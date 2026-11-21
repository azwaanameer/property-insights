// Route logic, kept out of src/routes so it can be tested without the TanStack runtime. Route files are thin wrappers.
import { z } from "zod";
import { CURRENCY, ONE_REPORT, PRO_MONTHLY, gstCents } from "../../config/pricing";
import { GnafPid, MARKET_TIER_BY_STATE, StateCode } from "../contracts/address";
import { ApiError, ErrorEnvelope } from "../contracts/errors";
import { devUnlockEnabled, entitlementSecret, processEnv, type Env } from "../config";
import { DatabaseNotConfiguredError, type Db } from "../db";
import { LAYERS } from "../layers";
import type { LayerDef } from "../layers/types";
import { errorFields, log } from "../log";
import { PaymentProviderError, WebhookSignatureError, type PaymentProvider } from "../payments/types";
import { selectProvider } from "../payments";
import { listCurrentDatasets } from "../repos/datasets";
import { recordLookup } from "../repos/lookup-log";
import { getPurchase, listActiveByIds } from "../repos/purchase";
import { listMarketValidation } from "../repos/source";
import { assembleReport, loadRights } from "../services/assemble-report";
import { buildSetCookie, isSecureRequest, readCookie, signEntitlementCookie, verifyEntitlementCookie } from "../services/entitlement-cookie";
import { entitlements, principalId, resolvePrincipal } from "../services/entitlements";
import { rightsGate } from "../services/layer-runner";
import { activeCookieIds, applyPaymentEvent, completeDevUnlock, payableLayers, purchaseView, startCheckout } from "../services/purchases";
import { createVendors } from "../vendors";
import type { VendorAdapters } from "../vendors/types";
import { loadedStates, resolveByPid, resolveQuery, suggest } from "../services/resolve-address";

export type DbSource = () => Db;

/** Injectable for tests. In production every field is read from the environment and the registry. */
export interface HandlerOptions {
  layers?: LayerDef[];
  /** Overrides the live vendor adapters (tests pass fakes). */
  vendors?: VendorAdapters;
  env?: Env;
  /** undefined = choose from the environment; null = no provider. */
  provider?: PaymentProvider | null;
  now?: Date;
}

/** Responses that depend on entitlement are never shared-cacheable (AD-3). */
const PRIVATE = "private, no-cache";
const NO_STORE = "no-store";

function json(body: unknown, status: number, requestId: string, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, "x-request-id": requestId },
  });
}

function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof ApiError) {
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message, request_id: requestId, candidates: err.candidates, match: err.match },
    };
    return json(ErrorEnvelope.parse(body), err.status, requestId, NO_STORE);
  }
  if (err instanceof DatabaseNotConfiguredError) {
    log("error", "not_configured", { request_id: requestId });
    return json({ error: { code: "not_configured", message: "The database is not configured.", request_id: requestId } }, 500, requestId, NO_STORE);
  }
  log("error", "request_failed", { request_id: requestId, ...errorFields(err) });
  return json({ error: { code: "internal_error", message: "Something went wrong.", request_id: requestId } }, 500, requestId, NO_STORE);
}

async function guarded(fn: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await fn(requestId);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

const QuerySchema = z.object({ q: z.string().trim().min(1, "q is required").max(200) });
const SuggestSchema = z.object({
  q: z.string().trim().max(200).refine((v) => v.replace(/\s/g, "").length >= 3, "q must have at least 3 non-space characters"),
});
const UnitSchema = z.string().trim().regex(/^[0-9A-Za-z]{1,8}$/, "unit must be letters and digits").optional();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError(400, "bad_request", r.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
  return r.data;
}

function searchParam(request: Request, name: string): string | undefined {
  return new URL(request.url).searchParams.get(name) ?? undefined;
}

export function handleSuggest(getDb: DbSource, request: Request): Promise<Response> {
  return guarded(async (requestId) => {
    const { q } = parse(SuggestSchema, { q: searchParam(request, "q") ?? "" });
    const candidates = await suggest(getDb(), q, 10);
    return json({ query: q, candidates }, 200, requestId, NO_STORE);
  });
}

export function handleResolve(getDb: DbSource, request: Request): Promise<Response> {
  return guarded(async (requestId) => {
    const { q } = parse(QuerySchema, { q: searchParam(request, "q") ?? "" });
    const address = await resolveQuery(getDb(), q);
    return json(address, 200, requestId, NO_STORE);
  });
}

export function handleAddress(getDb: DbSource, request: Request, params: { gnafPid: string }): Promise<Response> {
  return guarded(async (requestId) => {
    const pid = parse(GnafPid, params.gnafPid);
    const unit = parse(UnitSchema, searchParam(request, "unit"));
    const address = await resolveByPid(getDb(), pid, unit ?? null);
    return json(address, 200, requestId, NO_STORE);
  });
}

export function handleReport(
  getDb: DbSource,
  request: Request,
  params: { gnafPid: string },
  options: HandlerOptions = {},
): Promise<Response> {
  return guarded(async (requestId) => {
    const pid = parse(GnafPid, params.gnafPid);
    parse(z.literal("investor").default("investor"), searchParam(request, "view"));
    const unit = parse(UnitSchema, searchParam(request, "unit"));
    const db = getDb();
    const principal = await resolvePrincipal(request, db, { env: options.env, now: options.now });
    const address = await resolveByPid(db, pid, unit ?? null);
    const vendors = options.vendors ?? createVendors({ db, env: options.env ?? processEnv() });
    const report = await assembleReport({ db, address, principal, request_id: requestId, layers: options.layers, vendors });

    // Best effort: a failed log write never fails the report. Only the matched pid is stored.
    try {
      await recordLookup(db, {
        request_id: requestId,
        gnaf_pid: address.gnaf_pid,
        principal_kind: principal.kind,
        principal_id: principalId(principal),
        layers_served: report.layers.map((l) => ({ layer_id: l.layer_id, status: l.status })),
      });
    } catch (err) {
      log("warn", "lookup_log_failed", { request_id: requestId, ...errorFields(err) });
    }
    return json(report, 200, requestId, PRIVATE);
  });
}

export function handleCoverage(getDb: DbSource): Promise<Response> {
  return guarded(async (requestId) => {
    const db = getDb();
    const [datasets, validation, rights, loaded] = await Promise.all([
      listCurrentDatasets(db),
      listMarketValidation(db),
      loadRights(db),
      loadedStates(db),
    ]);
    const states = StateCode.options.map((state) => ({
      state,
      market_tier: MARKET_TIER_BY_STATE[state],
      loaded: loaded.includes(state),
      validation: validation.filter((v) => v.state === state),
    }));
    const layers = LAYERS.map((layer) => {
      // Public: status only. Which source blocks a layer is logged by the runner, never returned.
      const gate = rightsGate(layer, rights);
      return { layer_id: layer.layer_id, title: layer.title, tier: layer.tier, status: gate.ok ? "live" : "not_covered" };
    });
    return json({ generated_at: new Date().toISOString(), states, layers, datasets }, 200, requestId, NO_STORE);
  });
}

// ---------------------------------------------------------------- checkout, webhooks, purchase status, dev unlock (step 2c)

const PurchaseId = z.string().regex(/^pur_[0-9a-f]{32}$/, "not a purchase id");
const CheckoutBody = z.object({
  gnaf_pid: GnafPid,
  unit: UnitSchema,
  email: z.string().trim().toLowerCase().max(254).email("a valid email address is required"),
  plan: z.enum(["one", "pro"]),
});

function providerFor(options: HandlerOptions, env: Env, request: Request): PaymentProvider | null {
  return options.provider === undefined ? selectProvider(env, new URL(request.url).hostname) : options.provider;
}

function notConfigured(): ApiError {
  return new ApiError(503, "payments_not_configured", "Payments are not configured, so nothing can be bought yet.");
}

/** The per-plan facts the checkout page shows. Prices come from src/config/pricing.ts only. */
function priceSheet() {
  return {
    currency: CURRENCY,
    one: { amount_cents: ONE_REPORT.amount_cents, gst_cents: gstCents(ONE_REPORT.amount_cents), days: ONE_REPORT.days },
    pro: { amount_cents: PRO_MONTHLY.amount_cents, gst_cents: gstCents(PRO_MONTHLY.amount_cents) },
  };
}

/** GET: what the checkout page needs to draw itself. Always 200 for a known address; `payable` says whether a sale can start. */
export function handleCheckoutInfo(getDb: DbSource, request: Request, options: HandlerOptions = {}): Promise<Response> {
  return guarded(async (requestId) => {
    const pid = parse(GnafPid, searchParam(request, "pid"));
    const unit = parse(UnitSchema, searchParam(request, "unit"));
    const env = options.env ?? processEnv();
    const db = getDb();
    const address = await resolveByPid(db, pid, unit ?? null);
    const provider = providerFor(options, env, request);
    const configured = provider !== null && entitlementSecret(env) !== null;
    const payable = (await payableLayers(db, options.layers ?? LAYERS)).length > 0;
    return json(
      { gnaf_pid: address.gnaf_pid, display_address: address.display_address, provider: configured ? provider!.id : null, payable, prices: priceSheet() },
      200,
      requestId,
      NO_STORE,
    );
  });
}

/** POST: start a purchase. Refuses when payments are not set up or when no paid layer is open for the address. */
export function handleCheckoutStart(getDb: DbSource, request: Request, options: HandlerOptions = {}): Promise<Response> {
  return guarded(async (requestId) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new ApiError(400, "bad_request", "request: the body must be JSON");
    }
    const body = parse(CheckoutBody, raw);
    const env = options.env ?? processEnv();
    const provider = providerFor(options, env, request);
    // Without the cookie secret a paid purchase could never be turned into access, so that counts as not configured.
    if (!provider || !entitlementSecret(env)) throw notConfigured();
    const db = getDb();
    const address = await resolveByPid(db, body.gnaf_pid, body.unit ?? null);
    // No second charge for what the buyer already has: an active one-report for this address or an active Pro covers a one-report
    // purchase; only an active Pro covers another Pro.
    const principal = await resolvePrincipal(request, db, { env, now: options.now });
    const paidProbe = { layer_id: "checkout", tier: "paid" } as const;
    const have = entitlements(principal, paidProbe, { gnaf_pid: body.plan === "one" ? address.gnaf_pid : undefined, now: options.now });
    if (have === "entitled") {
      throw new ApiError(409, "already_entitled", "You already have access to this address, so there is nothing to buy.");
    }
    if ((await payableLayers(db, options.layers ?? LAYERS)).length === 0) {
      throw new ApiError(409, "nothing_to_unlock", "There is nothing to unlock for this address yet, so no payment can be taken.");
    }
    try {
      const { purchase, checkout_url } = await startCheckout({ db, provider, plan: body.plan, email: body.email, address, origin: new URL(request.url).origin });
      return json({ purchase_id: purchase.purchase_id, checkout_url, provider: provider.id }, 201, requestId, NO_STORE);
    } catch (err) {
      if (err instanceof PaymentProviderError) {
        log("error", "checkout_failed", { request_id: requestId, provider: provider.id, ...errorFields(err) });
        throw new ApiError(502, "payment_failed", "The payment provider could not start the checkout. Nothing was charged. Try again in a moment.");
      }
      throw err;
    }
  });
}

/** POST from the payment provider. The raw body is read once, verified, then applied at most once per event id. */
export function handleStripeWebhook(getDb: DbSource, request: Request, options: HandlerOptions = {}): Promise<Response> {
  return guarded(async (requestId) => {
    const env = options.env ?? processEnv();
    const provider = providerFor(options, env, request);
    if (!provider || provider.id === "dev") throw notConfigured();
    const rawBody = await request.text();
    let event;
    try {
      event = await provider.verifyWebhook(rawBody, request.headers);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        // The reason and the request id only. The body and the signature header are never logged.
        log("warn", "webhook_signature_invalid", { request_id: requestId, provider: provider.id, reason: err.message });
        throw new ApiError(400, "bad_request", "The webhook signature could not be verified.");
      }
      if (err instanceof PaymentProviderError && err.kind === "not_configured") throw notConfigured();
      throw err;
    }
    const result = await applyPaymentEvent(getDb(), provider, event, options.now ?? new Date(), requestId);
    // An event for a purchase we cannot find yet may have beaten the payment: refuse it so the provider sends it again.
    if (result === "retry") throw new ApiError(409, "event_unmatched", "That event names a purchase we do not have yet. Send it again later.");
    return json({ received: true, result }, 200, requestId, NO_STORE);
  });
}

/** Cookie ids that are still validly signed, so a new purchase is added to them rather than replacing them. */
async function existingCookieIds(request: Request, secret: string, now: Date): Promise<string[]> {
  const raw = readCookie(request);
  if (!raw) return [];
  return (await verifyEntitlementCookie(raw, secret, now))?.ids ?? [];
}

/**
 * GET: the buyer's confirmation page asks here. With `?purchase=` it reports that purchase and, once it is paid, sets the
 * entitlement cookie (the return from the provider is what hands the browser its access). Without it, it lists the cookie's
 * active purchases. The id is unguessable and is the only thing that proves the buyer is the buyer.
 */
export function handlePurchaseStatus(getDb: DbSource, request: Request, options: HandlerOptions = {}): Promise<Response> {
  return guarded(async (requestId) => {
    const env = options.env ?? processEnv();
    const now = options.now ?? new Date();
    const db = getDb();
    const secret = entitlementSecret(env);
    const idParam = searchParam(request, "purchase");
    let purchase: ReturnType<typeof purchaseView> | null = null;
    let setCookie: string | null = null;
    let ids = secret ? await existingCookieIds(request, secret, now) : [];

    if (idParam !== undefined) {
      const id = parse(PurchaseId, idParam);
      const row = await getPurchase(db, id);
      if (row) {
        purchase = purchaseView(row, now);
        if (purchase.status === "paid") {
          // Paid but no way to sign the cookie: say so, never "confirmed" without access.
          if (!secret) throw notConfigured();
          ids = await activeCookieIds(db, ids, id, now);
          setCookie = buildSetCookie(await signEntitlementCookie(ids, secret, now), { secure: isSecureRequest(request) });
        }
      }
    }

    const active = (await listActiveByIds(db, ids, now.toISOString())).map((p) => ({ plan: p.plan, gnaf_pid: p.gnaf_pid, expires_at: p.expires_at! }));
    const res = json({ purchase, active }, 200, requestId, NO_STORE);
    if (setCookie) res.headers.append("set-cookie", setCookie);
    return res;
  });
}

/** GET, development only. 404 unless ALLOW_DEV_UNLOCK=1 and no Stripe key is set. Marks the purchase paid and sends the buyer on. */
export function handleDevUnlock(getDb: DbSource, request: Request, options: HandlerOptions = {}): Promise<Response> {
  return guarded(async (requestId) => {
    const env = options.env ?? processEnv();
    if (!devUnlockEnabled(env, new URL(request.url).hostname)) throw new ApiError(404, "not_found", "Not found.");
    const secret = entitlementSecret(env);
    if (!secret) throw notConfigured();
    const id = parse(PurchaseId, searchParam(request, "purchase"));
    const now = options.now ?? new Date();
    const db = getDb();
    const paid = await completeDevUnlock(db, id, now);
    if (!paid) throw new ApiError(404, "not_found", "No pending dev purchase with that id.");
    const ids = await activeCookieIds(db, await existingCookieIds(request, secret, now), id, now);
    const res = new Response(null, {
      status: 302,
      headers: { location: `/done?purchase=${encodeURIComponent(id)}`, "cache-control": NO_STORE, "x-request-id": requestId },
    });
    res.headers.append("set-cookie", buildSetCookie(await signEntitlementCookie(ids, secret, now), { secure: isSecureRequest(request) }));
    return res;
  });
}

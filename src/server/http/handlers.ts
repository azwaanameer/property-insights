// Route logic, kept out of src/routes so it can be tested without the TanStack runtime. Route files are thin wrappers.
import { z } from "zod";
import { GnafPid, MARKET_TIER_BY_STATE, StateCode } from "../contracts/address";
import { ApiError, ErrorEnvelope } from "../contracts/errors";
import { DatabaseNotConfiguredError, type Db } from "../db";
import { LAYERS } from "../layers";
import type { LayerDef } from "../layers/types";
import { errorFields, log } from "../log";
import { listCurrentDatasets } from "../repos/datasets";
import { recordLookup } from "../repos/lookup-log";
import { listMarketValidation } from "../repos/source";
import { assembleReport, loadRights } from "../services/assemble-report";
import { principalId, resolvePrincipal } from "../services/entitlements";
import { rightsGate } from "../services/layer-runner";
import { loadedStates, resolveByPid, resolveQuery, suggest } from "../services/resolve-address";

export type DbSource = () => Db;

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
  options: { layers?: LayerDef[] } = {},
): Promise<Response> {
  return guarded(async (requestId) => {
    const pid = parse(GnafPid, params.gnafPid);
    parse(z.literal("investor").default("investor"), searchParam(request, "view"));
    const unit = parse(UnitSchema, searchParam(request, "unit"));
    const db = getDb();
    const principal = resolvePrincipal(request);
    const address = await resolveByPid(db, pid, unit ?? null);
    const report = await assembleReport({ db, address, principal, request_id: requestId, layers: options.layers });

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

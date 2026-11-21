// Stripe through its REST API with fetch. No SDK, so it runs on Workers unchanged.
// NOT tested against Stripe: the request shapes follow Stripe's published Checkout Session and webhook documentation, and the
// tests use a stubbed fetch and signed fixtures. Run it once in Stripe test mode before taking real money (see the spec notes).
import { fromHex, hmacSha256Verify } from "../crypto";
import { PaymentProviderError, WebhookSignatureError } from "./types";
import type { CheckoutInput, CheckoutSession, PaymentEvent, PaymentProvider } from "./types";

const API = "https://api.stripe.com/v1";
/** Stripe's own default tolerance for the webhook timestamp. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;
/** Every call to Stripe gives up after this long. */
export const FETCH_TIMEOUT_MS = 10_000;

export interface StripeOptions {
  secretKey: string;
  webhookSecret?: string;
  fetchImpl?: typeof fetch;
  /** Seconds since the epoch. Replaceable in tests. */
  nowSeconds?: () => number;
}

/** Stripe's form encoding: nested keys as a[b][c]=value. */
export function stripeForm(fields: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

type Obj = Record<string, any>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export class StripeProvider implements PaymentProvider {
  readonly id = "stripe";
  private readonly fetchImpl: typeof fetch;
  private readonly nowSeconds: () => number;

  constructor(private readonly opts: StripeOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.nowSeconds = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const pro = input.plan === "pro";
    const body = stripeForm({
      mode: pro ? "subscription" : "payment",
      customer_email: input.email,
      client_reference_id: input.purchase_id,
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      "metadata[purchase_id]": input.purchase_id,
      // Carried onto the objects Stripe creates later, so refunds and renewals can name the purchase.
      [pro ? "subscription_data[metadata][purchase_id]" : "payment_intent_data[metadata][purchase_id]"]: input.purchase_id,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": input.amount_cents,
      "line_items[0][price_data][product_data][name]": input.description,
      "line_items[0][price_data][recurring][interval]": pro ? "month" : undefined,
    });
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/checkout/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          // Stripe replays the answer if this exact call is sent twice. Every checkout attempt has its own purchase id,
          // so this does not merge separate attempts.
          "idempotency-key": `checkout_${input.purchase_id}`,
        },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError("Stripe could not be reached.");
    }
    const json = (await res.json().catch(() => null)) as Obj | null;
    if (!res.ok || !str(json?.url) || !str(json?.id)) {
      // Stripe's error message never contains the key. Nothing from the request is logged.
      throw new PaymentProviderError(`Stripe refused the checkout (${res.status}${str(json?.error?.message) ? `: ${json!.error.message}` : ""}).`);
    }
    return { url: json!.url, provider_ref: json!.id };
  }

  /** Signature format (Stripe docs): header `t=<unix>,v1=<hex>[,v1=<hex>]`, signed text `<t>.<raw body>`, HMAC-SHA256 with the endpoint secret. */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const secret = this.opts.webhookSecret;
    if (!secret) throw new PaymentProviderError("STRIPE_WEBHOOK_SECRET is not set.", "not_configured");
    const header = headers.get("stripe-signature") ?? "";
    let t = "";
    const sigs: string[] = [];
    for (const part of header.split(",")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k === "t") t = v;
      else if (k === "v1") sigs.push(v);
    }
    const ts = Number(t);
    if (!t || !Number.isFinite(ts) || sigs.length === 0) throw new WebhookSignatureError("missing or malformed signature header");
    if (Math.abs(this.nowSeconds() - ts) > WEBHOOK_TOLERANCE_SECONDS) throw new WebhookSignatureError("signature timestamp outside the tolerance");
    let ok = false;
    for (const hex of sigs) {
      const bytes = fromHex(hex);
      if (bytes && (await hmacSha256Verify(secret, `${t}.${rawBody}`, bytes))) ok = true;
    }
    if (!ok) throw new WebhookSignatureError("signature mismatch");

    let event: Obj;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new WebhookSignatureError("body is not JSON");
    }
    return mapStripeEvent(event);
  }
}

/** Reads only the fields we act on. Anything else is `ignored`. Exported for tests. */
export function mapStripeEvent(event: Obj): PaymentEvent {
  const id = str(event?.id);
  const type = str(event?.type) ?? "unknown";
  const obj: Obj = event?.data?.object ?? {};
  if (!id) return { id: "none", kind: "ignored", type };
  switch (type) {
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      return { id, kind: "failed", purchase_id: str(obj.client_reference_id) ?? str(obj.metadata?.purchase_id) };
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // `unpaid` means a delayed method has not settled yet: wait for async_payment_succeeded. `no_payment_required` is a
      // settled session with nothing to collect; it is passed on and the amount check refuses it, because every price here is above zero.
      if (obj.payment_status !== "paid" && obj.payment_status !== "no_payment_required") return { id, kind: "ignored", type };
      return {
        id,
        kind: "paid",
        purchase_id: str(obj.client_reference_id) ?? str(obj.metadata?.purchase_id),
        provider_ref: str(obj.id),
        payment_ref: str(obj.payment_intent) ?? str(obj.invoice),
        subscription_ref: str(obj.subscription),
        amount_cents: typeof obj.amount_total === "number" ? obj.amount_total : null,
        currency: str(obj.currency)?.toUpperCase() ?? null,
        mode: obj.mode === "payment" || obj.mode === "subscription" ? obj.mode : null,
      };
    case "charge.refunded":
      // Only a full refund ends access. A partial refund leaves the purchase paid.
      if (obj.refunded !== true) return { id, kind: "ignored", type };
      return {
        id,
        kind: "refunded",
        purchase_id: str(obj.metadata?.purchase_id),
        payment_refs: [str(obj.payment_intent), str(obj.invoice)].filter((v): v is string => v !== null),
      };
    case "invoice.paid": {
      // The first invoice is covered by the checkout event. Only later cycles renew.
      const sub = str(obj.subscription) ?? str(obj.parent?.subscription_details?.subscription);
      if (obj.billing_reason !== "subscription_cycle" || !sub) return { id, kind: "ignored", type };
      return { id, kind: "renewed", subscription_ref: sub };
    }
    case "customer.subscription.deleted":
      return str(obj.id) ? { id, kind: "ended", subscription_ref: obj.id } : { id, kind: "ignored", type };
    default:
      return { id, kind: "ignored", type };
  }
}

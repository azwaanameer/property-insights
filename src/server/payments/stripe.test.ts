// The Stripe provider against a stubbed fetch and signed fixtures. This proves our side of the contract as Stripe documents it.
// It does NOT prove Stripe accepts the request or sends these exact event shapes: that needs one run in Stripe test mode.
import { describe, expect, it } from "vitest";
import { hmacSha256, toHex } from "../crypto";
import { mapStripeEvent, StripeProvider, WEBHOOK_TOLERANCE_SECONDS } from "./stripe";
import { PaymentProviderError, WebhookSignatureError } from "./types";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;
const input = {
  purchase_id: "pur_" + "a".repeat(32), plan: "one" as const, email: "buyer@example.com", gnaf_pid: "GAVIC1", amount_cents: 2400, currency: "AUD",
  description: "VicProp full report: 1 Test St", success_url: "https://vicprop.example/done?purchase=x", cancel_url: "https://vicprop.example/checkout/GAVIC1",
};

function stubFetch(res: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

async function signed(body: string, t = NOW, secret = SECRET): Promise<Headers> {
  const sig = toHex(await hmacSha256(secret, `${t}.${body}`));
  return new Headers({ "stripe-signature": `t=${t},v1=${sig}` });
}

const provider = (fetchImpl?: typeof fetch) => new StripeProvider({ secretKey: "sk_test_dummy", webhookSecret: SECRET, fetchImpl, nowSeconds: () => NOW });

describe("createCheckout", () => {
  it("one report: payment mode, AUD cents, the purchase id on every object Stripe makes, idempotency key", async () => {
    const { calls, fetchImpl } = stubFetch({ status: 200, body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } });
    const out = await provider(fetchImpl).createCheckout(input);
    expect(out).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1", provider_ref: "cs_test_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal); // every call to Stripe has a time limit
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk_test_dummy");
    expect(headers["idempotency-key"]).toBe(`checkout_${input.purchase_id}`);
    const form = new URLSearchParams(calls[0].init.body as string);
    expect(Object.fromEntries(form)).toMatchObject({
      mode: "payment",
      customer_email: "buyer@example.com",
      client_reference_id: input.purchase_id,
      "metadata[purchase_id]": input.purchase_id,
      "payment_intent_data[metadata][purchase_id]": input.purchase_id,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "aud",
      "line_items[0][price_data][unit_amount]": "2400",
      success_url: input.success_url,
      cancel_url: input.cancel_url,
    });
    expect(form.has("line_items[0][price_data][recurring][interval]")).toBe(false);
  });
  it("pro: subscription mode with a monthly price", async () => {
    const { calls, fetchImpl } = stubFetch({ status: 200, body: { id: "cs_test_2", url: "https://checkout.stripe.com/c/pay/cs_test_2" } });
    await provider(fetchImpl).createCheckout({ ...input, plan: "pro", gnaf_pid: null, amount_cents: 9900 });
    const form = Object.fromEntries(new URLSearchParams(calls[0].init.body as string));
    expect(form).toMatchObject({
      mode: "subscription",
      "line_items[0][price_data][unit_amount]": "9900",
      "line_items[0][price_data][recurring][interval]": "month",
      "subscription_data[metadata][purchase_id]": input.purchase_id,
    });
    expect(form["payment_intent_data[metadata][purchase_id]"]).toBeUndefined();
  });
  it("a refusal or an outage is a PaymentProviderError that never carries the key", async () => {
    const refused = stubFetch({ status: 401, body: { error: { message: "Invalid API Key provided" } } });
    const err = await provider(refused.fetchImpl).createCheckout(input).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(err.message).toContain("401");
    expect(err.message).not.toContain("sk_test_dummy");
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(provider(down).createCheckout(input)).rejects.toBeInstanceOf(PaymentProviderError);
    const noUrl = stubFetch({ status: 200, body: { id: "cs_x" } });
    await expect(provider(noUrl.fetchImpl).createCheckout(input)).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe("verifyWebhook", () => {
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "pur_1", payment_intent: "pi_1", subscription: null, amount_total: 2400, currency: "aud", mode: "payment" } },
  };
  const raw = JSON.stringify(event);

  it("accepts a correctly signed body and maps it", async () => {
    expect(await provider().verifyWebhook(raw, await signed(raw))).toEqual({
      id: "evt_1", kind: "paid", purchase_id: "pur_1", provider_ref: "cs_1", payment_ref: "pi_1", subscription_ref: null, amount_cents: 2400, currency: "AUD", mode: "payment",
    });
  });
  it("accepts when any one of several v1 signatures matches (secret rotation)", async () => {
    const good = (await signed(raw)).get("stripe-signature")!;
    const h = new Headers({ "stripe-signature": `${good},v1=${"0".repeat(64)}` });
    expect((await provider().verifyWebhook(raw, h)).kind).toBe("paid");
  });
  it("rejects a tampered body, a wrong secret, a missing or malformed header", async () => {
    const headers = await signed(raw);
    await expect(provider().verifyWebhook(raw + " ", headers)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider().verifyWebhook(raw, await signed(raw, NOW, "whsec_other"))).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider().verifyWebhook(raw, new Headers())).rejects.toBeInstanceOf(WebhookSignatureError);
    for (const bad of ["garbage", "t=abc,v1=00", `t=${NOW}`, `t=${NOW},v1=zz`, `v1=${"0".repeat(64)}`]) {
      await expect(provider().verifyWebhook(raw, new Headers({ "stripe-signature": bad })), bad).rejects.toBeInstanceOf(WebhookSignatureError);
    }
  });
  it("rejects a replayed event outside the timestamp tolerance, and accepts one just inside it", async () => {
    await expect(provider().verifyWebhook(raw, await signed(raw, NOW - WEBHOOK_TOLERANCE_SECONDS - 1))).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider().verifyWebhook(raw, await signed(raw, NOW + WEBHOOK_TOLERANCE_SECONDS + 1))).rejects.toBeInstanceOf(WebhookSignatureError);
    expect((await provider().verifyWebhook(raw, await signed(raw, NOW - WEBHOOK_TOLERANCE_SECONDS))).kind).toBe("paid");
  });
  it("a signed body that is not JSON is a signature error, not a crash", async () => {
    const bad = "not json";
    await expect(provider().verifyWebhook(bad, await signed(bad))).rejects.toBeInstanceOf(WebhookSignatureError);
  });
  it("with no webhook secret it reports not configured instead of accepting anything", async () => {
    const p = new StripeProvider({ secretKey: "sk_test_dummy", nowSeconds: () => NOW });
    const err = await p.verifyWebhook(raw, await signed(raw)).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(err.kind).toBe("not_configured");
  });
});

describe("mapStripeEvent", () => {
  const ev = (type: string, object: Record<string, unknown>) => ({ id: "evt_m", type, data: { object } });
  it("an unpaid (delayed method) session waits; async success pays", () => {
    expect(mapStripeEvent(ev("checkout.session.completed", { payment_status: "unpaid" })).kind).toBe("ignored");
    expect(mapStripeEvent(ev("checkout.session.async_payment_succeeded", { payment_status: "paid", client_reference_id: "p" })).kind).toBe("paid");
  });
  it("no_payment_required is passed on as a settled session with its zero amount, so the amount check can refuse it", () => {
    expect(mapStripeEvent(ev("checkout.session.completed", { payment_status: "no_payment_required", client_reference_id: "p", amount_total: 0, currency: "aud", mode: "payment" }))).toMatchObject({
      kind: "paid", amount_cents: 0, currency: "AUD", mode: "payment",
    });
    expect(mapStripeEvent(ev("checkout.session.completed", { payment_status: "paid", client_reference_id: "p" }))).toMatchObject({ amount_cents: null, currency: null, mode: null });
  });
  it("an expired session or a failed delayed payment fails the purchase", () => {
    expect(mapStripeEvent(ev("checkout.session.expired", { client_reference_id: "p1" }))).toEqual({ id: "evt_m", kind: "failed", purchase_id: "p1" });
    expect(mapStripeEvent(ev("checkout.session.async_payment_failed", { metadata: { purchase_id: "p2" } }))).toEqual({ id: "evt_m", kind: "failed", purchase_id: "p2" });
  });
  it("the purchase id falls back to session metadata; a subscription session carries its subscription and invoice", () => {
    expect(mapStripeEvent(ev("checkout.session.completed", { payment_status: "paid", metadata: { purchase_id: "p9" }, subscription: "sub_1", invoice: "in_1" }))).toMatchObject({
      kind: "paid", purchase_id: "p9", subscription_ref: "sub_1", payment_ref: "in_1",
    });
  });
  it("only a full refund counts; partial refunds are ignored", () => {
    expect(mapStripeEvent(ev("charge.refunded", { refunded: false, amount_refunded: 100, payment_intent: "pi_1" })).kind).toBe("ignored");
    expect(mapStripeEvent(ev("charge.refunded", { refunded: true, payment_intent: "pi_1", metadata: { purchase_id: "p1" } }))).toEqual({
      id: "evt_m", kind: "refunded", purchase_id: "p1", payment_refs: ["pi_1"],
    });
  });
  it("renewals come only from later billing cycles, in either API shape", () => {
    expect(mapStripeEvent(ev("invoice.paid", { billing_reason: "subscription_create", subscription: "sub_1" })).kind).toBe("ignored");
    expect(mapStripeEvent(ev("invoice.paid", { billing_reason: "subscription_cycle", subscription: "sub_1" }))).toMatchObject({ kind: "renewed", subscription_ref: "sub_1" });
    expect(mapStripeEvent(ev("invoice.paid", { billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_2" } } }))).toMatchObject({ kind: "renewed", subscription_ref: "sub_2" });
  });
  it("a deleted subscription ends; anything else is ignored", () => {
    expect(mapStripeEvent(ev("customer.subscription.deleted", { id: "sub_1" }))).toMatchObject({ kind: "ended", subscription_ref: "sub_1" });
    expect(mapStripeEvent(ev("payment_intent.created", {})).kind).toBe("ignored");
    expect(mapStripeEvent({ type: "x" }).kind).toBe("ignored");
  });
});

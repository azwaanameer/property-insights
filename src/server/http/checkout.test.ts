// Checkout, webhooks, purchase status, dev unlock and entitlement end to end on PGlite, with a fake provider and signed fixtures.
// One test (or more) per row of the spec's I/O matrix. Nothing here talks to Stripe.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ONE_REPORT } from "../../config/pricing";
import type { LayerDef } from "../layers/types";
import { selectProvider } from "../payments";
import { activeCookieIds, completeDevUnlock } from "../services/purchases";
import { COOKIE_NAME, signEntitlementCookie } from "../services/entitlement-cookie";
import { createLoadedTestDb, type TestDb } from "../testing/db";
import { FakeProvider, signedWebhook } from "../testing/fake-provider";
import { handleCheckoutInfo, handleCheckoutStart, handleDevUnlock, handlePurchaseStatus, handleReport, handleStripeWebhook, type HandlerOptions } from "./handlers";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createLoadedTestDb());
  await db.query("INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES ('LX-paid', 'paid', true, ARRAY['gnaf'])");
});
afterAll(() => close());

const getDb = () => db;
const SECRET_FIGURE = 424242424;
const X = "GAVIC100000002";
const Y = "GAVIC100000003";
const ENTITLEMENT_SECRET = "test-entitlement-secret-0123456789abcdef";
const env = { ENTITLEMENT_SECRET };

/** A paid layer whose figure is the secret that must never reach an unentitled response. */
const paidLayer: LayerDef = {
  layer_id: "LX-paid",
  title: "Paid thing",
  tier: "paid",
  source_ids: ["gnaf"],
  teaser: "Paid layers send a teaser only.",
  run: async () => ({
    status: "ok",
    figures: [{ key: "k", label: "Secret", value: SECRET_FIGURE, chip: "Observed", source_ids: ["gnaf"], as_of: "2026-08-31" }],
    payload: { secret: SECRET_FIGURE },
  }),
};

const opts = (over: Partial<HandlerOptions> = {}): HandlerOptions => ({ layers: [paidLayer], env, ...over });
const post = (body: unknown, url = "http://localhost/api/v1/checkout") =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string, cookie?: string) => new Request(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined);

async function start(provider: FakeProvider | null, body: Record<string, unknown> = {}, o: Partial<HandlerOptions> = {}) {
  const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "Buyer@Example.com", plan: "one", ...body }), opts({ provider, ...o }));
  return { res, body: await res.json() };
}
const count = async () => Number((await db.query("SELECT count(*)::int AS n FROM app_purchase"))[0].n);
const row = async (id: string) => (await db.query("SELECT * FROM app_purchase WHERE purchase_id = $1", [id]))[0];

async function pay(provider: FakeProvider, purchaseId: string, eventId: string, extra: Record<string, unknown> = {}, now?: Date) {
  // Like a real event, it states what was charged: read the purchase to say the matching amount and mode.
  const p = await row(purchaseId);
  const matching = p ? { amount_cents: p.amount_cents, currency: p.currency, mode: p.plan === "pro" ? "subscription" : "payment" } : {};
  const res = await handleStripeWebhook(
    getDb,
    await signedWebhook({ id: eventId, kind: "paid", purchase_id: purchaseId, provider_ref: `fake_cs_${purchaseId}`, payment_ref: `pi_${purchaseId}`, subscription_ref: null, ...matching, ...extra } as any),
    opts({ provider, now }),
  );
  return { res, body: await res.json() };
}

/** The cookie a browser holds after returning to /done for this purchase. */
async function cookieFor(purchaseId: string, existing?: string): Promise<string> {
  const res = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${purchaseId}`, existing), opts());
  const set = res.headers.get("set-cookie");
  expect(set, "a paid purchase hands the browser a cookie").toBeTruthy();
  return set!.split(";")[0];
}

const report = (pid: string, cookie?: string, o: Partial<HandlerOptions> = {}) =>
  handleReport(getDb, get("/r", cookie), { gnafPid: pid }, opts(o));
const paidLayerOf = async (res: Response) => (await res.json()).layers.find((l: any) => l.layer_id === "LX-paid");

describe("start one-report checkout", () => {
  it("records a pending purchase at 2400 cents and returns the provider's checkout url", async () => {
    const provider = new FakeProvider();
    const { res, body } = await start(provider);
    expect(res.status).toBe(201);
    expect(body.checkout_url).toBe(`https://pay.example/session/${body.purchase_id}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await row(body.purchase_id)).toMatchObject({
      status: "pending", plan: "one", gnaf_pid: X, email: "buyer@example.com", amount_cents: 2400, currency: "AUD", provider: "fake",
    });
    expect(provider.created[0]).toMatchObject({
      amount_cents: 2400, plan: "one", success_url: `http://localhost/done?purchase=${body.purchase_id}`, cancel_url: `http://localhost/checkout/${X}`,
    });
  });
  it("pro is 9900 cents and keeps no address on the purchase", async () => {
    const { body } = await start(new FakeProvider(), { plan: "pro" });
    expect(await row(body.purchase_id)).toMatchObject({ plan: "pro", gnaf_pid: null, amount_cents: 9900 });
  });
  it("a unit on a building pid is resolved, so the purchase names the unit's pid", async () => {
    const { body } = await start(new FakeProvider(), { gnaf_pid: "GAVIC100000001", unit: "310" });
    expect((await row(body.purchase_id)).gnaf_pid).toBe(X);
  });
  it("dev mode: ALLOW_DEV_UNLOCK=1 with no Stripe key gives a dev unlock link and a banner flag", async () => {
    const devEnv = { ...env, ALLOW_DEV_UNLOCK: "1" };
    expect(selectProvider(devEnv, "localhost")?.id).toBe("dev");
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "dev@example.com", plan: "one" }), { layers: [paidLayer], env: devEnv });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ provider: "dev", checkout_url: `/api/v1/dev/unlock?purchase=${body.purchase_id}` });
    const info = await (await handleCheckoutInfo(getDb, get(`/api/v1/checkout?pid=${X}`), { layers: [paidLayer], env: devEnv })).json();
    expect(info).toMatchObject({ provider: "dev", payable: true, display_address: expect.any(String) });
    expect(info.prices.one).toEqual({ amount_cents: 2400, gst_cents: 218, days: 30 });
  });
  it("a Stripe key switches the dev provider off even when ALLOW_DEV_UNLOCK is set", () => {
    expect(selectProvider({ ...env, ALLOW_DEV_UNLOCK: "1", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" }, "localhost")?.id).toBe("stripe");
  });
  it("rejects a bad email, plan or pid with 400 and writes nothing", async () => {
    const before = await count();
    for (const bad of [{ email: "nope" }, { email: "" }, { plan: "gold" }, { gnaf_pid: "xyz" }]) {
      const { res, body } = await start(new FakeProvider(), bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.error.code).toBe("bad_request");
    }
    const notJson = await handleCheckoutStart(getDb, post("{oops"), opts({ provider: new FakeProvider() }));
    expect(notJson.status).toBe(400);
    expect(await count()).toBe(before);
  });
  it("a provider outage is a 502 with a plain message, and the purchase is marked failed", async () => {
    const provider = new FakeProvider();
    provider.failNext = true;
    const { res, body } = await start(provider);
    expect(res.status).toBe(502);
    expect(body.error).toMatchObject({ code: "payment_failed" });
    const rows = await db.query("SELECT status FROM app_purchase WHERE email = 'buyer@example.com' ORDER BY created_at DESC, purchase_id LIMIT 50");
    expect(rows.some((r) => r.status === "failed")).toBe(true);
  });
});

describe("no paid layer", () => {
  it("409 nothing_to_unlock and no purchase row", async () => {
    const before = await count();
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { layers: [], env, provider: new FakeProvider() });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("nothing_to_unlock");
    expect(await count()).toBe(before);
  });
  it("a paid layer that is not enabled and cleared does not count as something to sell", async () => {
    const unconfigured: LayerDef = { ...paidLayer, layer_id: "LX-not-in-config" };
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { layers: [unconfigured], env, provider: new FakeProvider() });
    expect(res.status).toBe(409);
    const info = await (await handleCheckoutInfo(getDb, get(`/api/v1/checkout?pid=${X}`), { layers: [unconfigured], env, provider: new FakeProvider() })).json();
    expect(info.payable).toBe(false);
  });
  it("the real layer registry has no paid layer today, so real checkout refuses", async () => {
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { env, provider: new FakeProvider() });
    expect(res.status).toBe(409);
  });
});

describe("payments not configured", () => {
  it("no Stripe key and no ALLOW_DEV_UNLOCK: checkout cannot complete and says payments are not configured", async () => {
    const before = await count();
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { layers: [paidLayer], env });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("payments_not_configured");
    expect(body.error.message).toMatch(/not configured/i);
    expect(await count()).toBe(before);
    const info = await (await handleCheckoutInfo(getDb, get(`/api/v1/checkout?pid=${X}`), { layers: [paidLayer], env })).json();
    expect(info.provider).toBeNull();
  });
  it("a provider without ENTITLEMENT_SECRET also refuses, because access could never be issued", async () => {
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { layers: [paidLayer], env: {}, provider: new FakeProvider() });
    expect(res.status).toBe(503);
  });
});

describe("payment succeeds", () => {
  it("a verified webhook marks the purchase paid with a 30 day expiry, and the return sets the cookie", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const now = new Date("2026-11-21T00:00:00Z");
    const res = await handleStripeWebhook(
      getDb,
      await signedWebhook({ id: "evt_paid_1", kind: "paid", purchase_id: body.purchase_id, provider_ref: "cs_1", payment_ref: "pi_1", subscription_ref: null, amount_cents: 2400, currency: "AUD", mode: "payment" }),
      opts({ provider, now }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, result: "applied" });
    const p = await row(body.purchase_id);
    expect(p.status).toBe("paid");
    expect(new Date(p.expires_at).toISOString()).toBe(new Date(now.getTime() + ONE_REPORT.days * 86_400_000).toISOString());

    const status = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${body.purchase_id}`), opts({ now }));
    const json = await status.json();
    expect(json.purchase).toMatchObject({ status: "paid", plan: "one", gnaf_pid: X });
    expect(json.active).toHaveLength(1);
    const cookie = status.headers.get("set-cookie")!;
    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure"); // plain http on localhost (development)
  });
  it("the cookie is Secure on https", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_paid_https");
    const res = await handlePurchaseStatus(getDb, new Request(`https://vicprop.example/api/v1/purchases/me?purchase=${body.purchase_id}`), opts());
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });
  it("a pending purchase reports pending and sets no cookie", async () => {
    const { body } = await start(new FakeProvider());
    const res = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${body.purchase_id}`), opts());
    expect((await res.json()).purchase.status).toBe("pending");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("an unknown or malformed purchase id is not a leak: null purchase or 400", async () => {
    const unknown = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=pur_${"0".repeat(32)}`), opts());
    expect((await unknown.json()).purchase).toBeNull();
    expect((await handlePurchaseStatus(getDb, get("/api/v1/purchases/me?purchase=nope"), opts())).status).toBe(400);
  });
});

describe("webhooks", () => {
  it("a duplicate event id is a no-op", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const first = await pay(provider, body.purchase_id, "evt_dup");
    expect(first.body.result).toBe("applied");
    const before = await row(body.purchase_id);
    const second = await pay(provider, body.purchase_id, "evt_dup");
    expect(second.res.status).toBe(200);
    expect(second.body.result).toBe("duplicate");
    expect(await row(body.purchase_id)).toEqual(before);
    expect(Number((await db.query("SELECT count(*)::int AS n FROM app_webhook_event WHERE event_id = 'evt_dup'"))[0].n)).toBe(1);
  });
  it("a tampered body is 400, changes nothing, and the log carries no body", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await handleStripeWebhook(
        getDb,
        await signedWebhook({ id: "evt_bad", kind: "paid", purchase_id: body.purchase_id, provider_ref: null, payment_ref: null, subscription_ref: null, amount_cents: 2400, currency: "AUD", mode: "payment" }, { tamper: true }),
        opts({ provider }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
      const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("webhook_signature_invalid");
      expect(logged).not.toContain(body.purchase_id);
    } finally {
      warn.mockRestore();
    }
    expect((await row(body.purchase_id)).status).toBe("pending");
    expect(Number((await db.query("SELECT count(*)::int AS n FROM app_webhook_event WHERE event_id = 'evt_bad'"))[0].n)).toBe(0);
  });
  it("a missing signature is 400; a webhook with no provider configured is 503", async () => {
    const provider = new FakeProvider();
    const unsigned = new Request("http://localhost/api/v1/webhooks/stripe", { method: "POST", body: "{}" });
    expect((await handleStripeWebhook(getDb, unsigned, opts({ provider }))).status).toBe(400);
    const ok = await signedWebhook({ id: "evt_x", kind: "ignored", type: "x" });
    expect((await handleStripeWebhook(getDb, ok, opts({ provider: null }))).status).toBe(503);
  });
  it("an event for a purchase we do not know is acknowledged as unmatched, not an error", async () => {
    const provider = new FakeProvider();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { body } = await pay(provider, `pur_${"f".repeat(32)}`, "evt_unknown");
      expect(body.result).toBe("unmatched");
    } finally {
      warn.mockRestore();
    }
  });
  it("a failure while applying releases the event so the provider's retry is handled", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const flaky: any = {
        query: async (text: string, params?: unknown[]) => {
          if (text.includes("UPDATE app_purchase") && text.includes("status = 'paid'")) throw new Error("db down");
          return db.query(text, params);
        },
      };
      const req = await signedWebhook({ id: "evt_retry", kind: "paid", purchase_id: body.purchase_id, provider_ref: null, payment_ref: null, subscription_ref: null, amount_cents: 2400, currency: "AUD", mode: "payment" });
      const failed = await handleStripeWebhook(() => flaky, req, opts({ provider }));
      expect(failed.status).toBe(500);
    } finally {
      error.mockRestore();
    }
    expect(Number((await db.query("SELECT count(*)::int AS n FROM app_webhook_event WHERE event_id = 'evt_retry'"))[0].n)).toBe(0);
    const retry = await pay(provider, body.purchase_id, "evt_retry");
    expect(retry.body.result).toBe("applied");
  });
});

describe("entitled request", () => {
  it("cookie for pid X: the paid layer returns its figures for X and stays locked for Y", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_entitled");
    const cookie = await cookieFor(body.purchase_id);

    const forX = await report(X, cookie);
    expect(forX.headers.get("cache-control")).toContain("private");
    expect(await paidLayerOf(forX)).toMatchObject({ status: "ok", figures: [{ value: SECRET_FIGURE }] });

    const forY = await report(Y, cookie);
    const textY = await forY.text();
    expect(textY).not.toContain(String(SECRET_FIGURE));
    expect(JSON.parse(textY).layers.find((l: any) => l.layer_id === "LX-paid")).toMatchObject({ status: "locked", figures: [], payload: {} });
  });
  it("no cookie and a purchase that is only pending both stay locked", async () => {
    const anon = await (await report(X)).text();
    expect(anon).not.toContain(String(SECRET_FIGURE));
    const { body } = await start(new FakeProvider());
    const cookie = `${COOKIE_NAME}=${await signEntitlementCookie([body.purchase_id], ENTITLEMENT_SECRET, new Date())}`;
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("locked");
  });
  it("the lookup log holds a guest id, never the email address", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { email: "private.person@example.com" });
    await pay(provider, body.purchase_id, "evt_log");
    const cookie = await cookieFor(body.purchase_id);
    await report("GAVIC100000030", cookie);
    const rows = await db.query("SELECT principal_kind, principal_id FROM app_lookup_log WHERE gnaf_pid = 'GAVIC100000030'");
    expect(rows[0].principal_kind).toBe("user");
    expect(rows[0].principal_id).toMatch(/^guest_[0-9a-f]{16}$/);
  });
});

describe("pro", () => {
  it("an active pro plan opens every address; once expired it locks again", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { plan: "pro" });
    await pay(provider, body.purchase_id, "evt_pro", { subscription_ref: "sub_pro_1" });
    const cookie = await cookieFor(body.purchase_id);
    for (const pid of [X, Y]) expect((await paidLayerOf(await report(pid, cookie))).status, pid).toBe("ok");

    await db.query("UPDATE app_purchase SET expires_at = now() - interval '1 hour' WHERE purchase_id = $1", [body.purchase_id]);
    for (const pid of [X, Y]) expect((await paidLayerOf(await report(pid, cookie))).status, pid).toBe("locked");
  });
  it("a renewal event moves the expiry on; the subscription ending pulls it to now", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { plan: "pro" });
    await pay(provider, body.purchase_id, "evt_pro2", { subscription_ref: "sub_pro_2" });
    const cookie = await cookieFor(body.purchase_id);
    await db.query("UPDATE app_purchase SET expires_at = now() + interval '1 day' WHERE purchase_id = $1", [body.purchase_id]);

    const renew = await handleStripeWebhook(getDb, await signedWebhook({ id: "evt_renew", kind: "renewed", subscription_ref: "sub_pro_2" }), opts({ provider }));
    expect((await renew.json()).result).toBe("applied");
    expect((await row(body.purchase_id)).expires_at.getTime() - Date.now()).toBeGreaterThan(30 * 86_400_000);
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("ok");

    const ended = await handleStripeWebhook(getDb, await signedWebhook({ id: "evt_end", kind: "ended", subscription_ref: "sub_pro_2" }), opts({ provider }));
    expect((await ended.json()).result).toBe("applied");
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("locked");
  });
});

describe("tampered or expired cookie", () => {
  async function paidCookieValue() {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, `evt_cookie_${body.purchase_id}`);
    return { id: body.purchase_id, value: (await cookieFor(body.purchase_id)).slice(COOKIE_NAME.length + 1) };
  }
  it("a changed payload or signature is anonymous", async () => {
    const { value } = await paidCookieValue();
    const [payload, sig] = value.split(".");
    const flipped = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA");
    for (const bad of [`${payload}.${flipped}`, `${payload}x.${sig}`, `${sig}.${payload}`, "garbage", ""]) {
      expect((await paidLayerOf(await report(X, `${COOKIE_NAME}=${bad}`))).status, bad).toBe("locked");
    }
  });
  it("a cookie signed with another secret is anonymous", async () => {
    const { id } = await paidCookieValue();
    const forged = await signEntitlementCookie([id], "another-secret-another-secret-another-secret", new Date());
    expect((await paidLayerOf(await report(X, `${COOKIE_NAME}=${forged}`))).status).toBe("locked");
  });
  it("a cookie past its own expiry is anonymous even though the purchase is still paid", async () => {
    const { id } = await paidCookieValue();
    const old = await signEntitlementCookie([id], ENTITLEMENT_SECRET, new Date("2020-01-01T00:00:00Z"));
    expect((await paidLayerOf(await report(X, `${COOKIE_NAME}=${old}`))).status).toBe("locked");
    const fresh = await signEntitlementCookie([id], ENTITLEMENT_SECRET, new Date());
    expect((await paidLayerOf(await report(X, `${COOKIE_NAME}=${fresh}`))).status).toBe("ok");
  });
  it("without ENTITLEMENT_SECRET no cookie can be trusted", async () => {
    const { id } = await paidCookieValue();
    const cookie = `${COOKIE_NAME}=${await signEntitlementCookie([id], ENTITLEMENT_SECRET, new Date())}`;
    expect((await paidLayerOf(await report(X, cookie, { env: {} }))).status).toBe("locked");
  });
  it("a purchase past its own expiry is locked even with a valid cookie", async () => {
    const { id, value } = await paidCookieValue();
    await db.query("UPDATE app_purchase SET expires_at = now() - interval '1 minute' WHERE purchase_id = $1", [id]);
    expect((await paidLayerOf(await report(X, `${COOKIE_NAME}=${value}`))).status).toBe("locked");
  });
});

describe("dev unlock", () => {
  const devEnv = { ...env, ALLOW_DEV_UNLOCK: "1" };
  async function devPurchase() {
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "dev@example.com", plan: "one" }), { layers: [paidLayer], env: devEnv });
    return (await res.json()).purchase_id as string;
  }
  it("is a 404 unless ALLOW_DEV_UNLOCK=1, and a 404 whenever a Stripe key is set", async () => {
    const id = await devPurchase();
    for (const e of [env, { ...env, ALLOW_DEV_UNLOCK: "0" }, { ...env, ALLOW_DEV_UNLOCK: "true" }, { ...devEnv, STRIPE_SECRET_KEY: "sk_test_x" }]) {
      const res = await handleDevUnlock(getDb, get(`/api/v1/dev/unlock?purchase=${id}`), { env: e });
      expect(res.status, JSON.stringify(e)).toBe(404);
    }
    expect((await row(id)).status).toBe("pending");
  });
  it("when enabled it marks the purchase paid, sets the cookie and sends the buyer to /done", async () => {
    const id = await devPurchase();
    const res = await handleDevUnlock(getDb, get(`/api/v1/dev/unlock?purchase=${id}`), { env: devEnv });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/done?purchase=${id}`);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect((await row(id)).status).toBe("paid");
    expect((await paidLayerOf(await report(X, cookie.split(";")[0]))).status).toBe("ok");
  });
  it("only a dev purchase can be unlocked this way: a purchase made through another provider is refused", async () => {
    const { body } = await start(new FakeProvider());
    const res = await handleDevUnlock(getDb, get(`/api/v1/dev/unlock?purchase=${body.purchase_id}`), { env: devEnv });
    expect(res.status).toBe(404);
    expect((await row(body.purchase_id)).status).toBe("pending");
  });
});

describe("refund", () => {
  it("a refund event marks the purchase refunded and access ends, though the cookie is still valid", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_pay_r");
    const cookie = await cookieFor(body.purchase_id);
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("ok");

    // The refund names the purchase only by the provider's payment reference, as a real refund event does.
    const res = await handleStripeWebhook(
      getDb,
      await signedWebhook({ id: "evt_refund", kind: "refunded", purchase_id: null, payment_refs: [`pi_${body.purchase_id}`] }),
      opts({ provider }),
    );
    expect((await res.json()).result).toBe("applied");
    expect(await row(body.purchase_id)).toMatchObject({ status: "refunded" });
    expect((await row(body.purchase_id)).refunded_at).toBeTruthy();
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("locked");
    const status = await (await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${body.purchase_id}`, cookie), opts())).json();
    expect(status.purchase.status).toBe("refunded");
    expect(status.active).toEqual([]);
  });
  it("nothing refunds a purchase except a provider event: expiry, failure and status checks never do", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_pay_r2");
    await db.query("UPDATE app_purchase SET expires_at = now() - interval '1 day' WHERE purchase_id = $1", [body.purchase_id]);
    await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${body.purchase_id}`), opts());
    expect((await row(body.purchase_id)).status).toBe("paid");
    expect((await row(body.purchase_id)).refunded_at).toBeNull();
  });
  it("a payment that arrives after a refund does not reopen access", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await handleStripeWebhook(getDb, await signedWebhook({ id: "evt_early_refund", kind: "refunded", purchase_id: body.purchase_id, payment_refs: [] }), opts({ provider }));
    const late = await pay(provider, body.purchase_id, "evt_late_pay");
    expect(late.body.result).toBe("ignored");
    expect((await row(body.purchase_id)).status).toBe("refunded");
  });
});

// ---------------------------------------------------------------- review fixes

const T0 = new Date("2026-11-21T00:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const eventCount = async (id: string) => Number((await db.query("SELECT count(*)::int AS n FROM app_webhook_event WHERE event_id = $1", [id]))[0].n);
const send = async (provider: FakeProvider, event: any, now?: Date) => {
  const res = await handleStripeWebhook(getDb, await signedWebhook(event), opts({ provider, now }));
  return { res, body: await res.json() };
};

describe("a purchase the provider accepted is never stranded as failed", () => {
  it("a failed purchase moves to paid on a verified paid event", async () => {
    const provider = new FakeProvider();
    provider.failNext = true;
    const { body: failed } = await start(provider, { email: "failed-then-paid@example.com" });
    expect(failed.error.code).toBe("payment_failed");
    const [p] = await db.query("SELECT purchase_id, status FROM app_purchase WHERE email = 'failed-then-paid@example.com'");
    expect(p.status).toBe("failed");
    const paid = await pay(provider, p.purchase_id, "evt_failed_then_paid");
    expect(paid.body.result).toBe("applied");
    expect((await row(p.purchase_id)).status).toBe("paid");
  });
  it("a failure of our own write after the provider made the session leaves the purchase pending, not failed", async () => {
    const provider = new FakeProvider();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const flaky: any = {
        query: async (text: string, params?: unknown[]) => {
          if (text.includes("SET provider_ref = $2")) throw new Error("db down");
          return db.query(text, params);
        },
      };
      const res = await handleCheckoutStart(() => flaky, post({ gnaf_pid: X, email: "own-write@example.com", plan: "one" }), opts({ provider }));
      expect(res.status).toBe(500);
    } finally {
      error.mockRestore();
    }
    expect(provider.created).toHaveLength(1);
    const [p] = await db.query("SELECT purchase_id, status FROM app_purchase WHERE email = 'own-write@example.com'");
    expect(p.status).toBe("pending");
    expect((await pay(provider, p.purchase_id, "evt_own_write")).body.result).toBe("applied");
  });
  it("an expired or failed-delayed-payment event fails a pending purchase", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const r = await send(provider, { id: "evt_expired", kind: "failed", purchase_id: body.purchase_id });
    expect(r.body.result).toBe("applied");
    expect((await row(body.purchase_id)).status).toBe("failed");
  });
});

describe("a Stripe key needs its webhook secret", () => {
  it("key without webhook secret is payments not configured, in both handlers", async () => {
    const half = { ...env, STRIPE_SECRET_KEY: "sk_test_x" };
    expect(selectProvider(half, "vicprop.example")).toBeNull();
    const res = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "a@example.com", plan: "one" }), { layers: [paidLayer], env: half });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("payments_not_configured");
    const info = await (await handleCheckoutInfo(getDb, get(`/api/v1/checkout?pid=${X}`), { layers: [paidLayer], env: half })).json();
    expect(info.provider).toBeNull();
    const full = { ...half, STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(selectProvider(full, "vicprop.example")?.id).toBe("stripe");
  });
});

describe("webhook claims", () => {
  const stale = (id: string, applied: boolean) =>
    db.query(
      `INSERT INTO app_webhook_event (provider, event_id, event_type, received_at, applied_at)
       VALUES ('fake', $1, 'paid', now() - interval '10 minutes', ${applied ? "now() - interval '9 minutes'" : "NULL"})`,
      [id],
    );
  it("an unapplied claim older than two minutes is taken over; the purchase becomes paid", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await stale("evt_stale", false);
    const r = await pay(provider, body.purchase_id, "evt_stale");
    expect(r.body.result).toBe("applied");
    expect((await row(body.purchase_id)).status).toBe("paid");
    expect((await db.query("SELECT applied_at FROM app_webhook_event WHERE event_id = 'evt_stale'"))[0].applied_at).toBeTruthy();
  });
  it("a fresh unapplied claim (another delivery is working) and an applied event are both duplicates", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await db.query("INSERT INTO app_webhook_event (provider, event_id, event_type) VALUES ('fake', 'evt_fresh', 'paid')");
    expect((await pay(provider, body.purchase_id, "evt_fresh")).body.result).toBe("duplicate");
    await stale("evt_applied_long_ago", true);
    expect((await pay(provider, body.purchase_id, "evt_applied_long_ago")).body.result).toBe("duplicate");
    expect((await row(body.purchase_id)).status).toBe("pending");
  });
  it("an event is applied once: applied_at is set, and a repeat does nothing", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_once");
    expect((await db.query("SELECT applied_at FROM app_webhook_event WHERE event_id = 'evt_once'"))[0].applied_at).toBeTruthy();
    expect((await pay(provider, body.purchase_id, "evt_once")).body.result).toBe("duplicate");
  });
  it("a failed release is logged, not swallowed, and the original error still surfaces", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const flaky: any = {
        query: async (text: string, params?: unknown[]) => {
          if (text.includes("UPDATE app_purchase") && text.includes("status = 'paid'")) throw new Error("db down");
          if (text.includes("DELETE FROM app_webhook_event")) throw new Error("release down");
          return db.query(text, params);
        },
      };
      const res = await handleStripeWebhook(() => flaky, await signedWebhook({ id: "evt_release_fails", kind: "paid", purchase_id: body.purchase_id, provider_ref: null, payment_ref: null, subscription_ref: null, amount_cents: 2400, currency: "AUD", mode: "payment" }), opts({ provider }));
      expect(res.status).toBe(500);
      const logged = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("webhook_release_failed");
      expect(logged).toContain("payment_event_failed");
    } finally {
      error.mockRestore();
    }
    // The claim was left behind, unapplied. It is not a duplicate for ever: once stale a retry takes it over.
    await db.query("UPDATE app_webhook_event SET received_at = now() - interval '5 minutes' WHERE event_id = 'evt_release_fails'");
    expect((await pay(provider, body.purchase_id, "evt_release_fails")).body.result).toBe("applied");
  });
});

describe("events that name nothing we hold", () => {
  it("a refund that beats the payment is refused so it is sent again, and refunds the buyer once the payment is in", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    const early = await send(provider, { id: "evt_refund_first", kind: "refunded", purchase_id: null, payment_refs: ["pi_order_test"] });
    expect(early.res.status).toBe(409);
    expect(early.body.error.code).toBe("event_unmatched");
    expect(await eventCount("evt_refund_first")).toBe(0); // the claim was released
    expect((await row(body.purchase_id)).status).toBe("pending");

    expect((await pay(provider, body.purchase_id, "evt_pay_second", { payment_ref: "pi_order_test" })).body.result).toBe("applied");
    const cookie = await cookieFor(body.purchase_id);
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("ok");

    const retry = await send(provider, { id: "evt_refund_first", kind: "refunded", purchase_id: null, payment_refs: ["pi_order_test"] });
    expect(retry.res.status).toBe(200);
    expect(retry.body.result).toBe("applied");
    expect((await row(body.purchase_id)).status).toBe("refunded");
    expect((await paidLayerOf(await report(X, cookie))).status).toBe("locked");
  });
  it("a renewal or end for an unknown subscription is refused so it is sent again", async () => {
    const provider = new FakeProvider();
    for (const kind of ["renewed", "ended"]) {
      const r = await send(provider, { id: `evt_${kind}_unknown`, kind, subscription_ref: "sub_nobody" });
      expect(r.res.status, kind).toBe(409);
      expect(await eventCount(`evt_${kind}_unknown`)).toBe(0);
    }
  });
});

describe("pro renewals and endings arriving out of order", () => {
  it("an older renewal never shortens a newer expiry; a late renewal after the end cannot reopen access", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { plan: "pro" });
    await pay(provider, body.purchase_id, "evt_ord_pay", { subscription_ref: "sub_ord" }, T0);
    const first = (await row(body.purchase_id)).expires_at.getTime();
    expect(first).toBe(days(32).getTime());

    expect((await send(provider, { id: "evt_ord_r2", kind: "renewed", subscription_ref: "sub_ord" }, days(30))).body.result).toBe("applied");
    const newer = (await row(body.purchase_id)).expires_at.getTime();
    expect(newer).toBe(days(62).getTime());
    // The older renewal event is delivered late: the expiry must not move back.
    await send(provider, { id: "evt_ord_r1", kind: "renewed", subscription_ref: "sub_ord" }, days(1));
    expect((await row(body.purchase_id)).expires_at.getTime()).toBe(newer);

    expect((await send(provider, { id: "evt_ord_end", kind: "ended", subscription_ref: "sub_ord" }, days(40))).body.result).toBe("applied");
    const ended = await row(body.purchase_id);
    expect(ended.expires_at.getTime()).toBe(days(40).getTime());
    expect(ended.ended_at).toBeTruthy();

    // A renewal for a cycle that was paid before the cancellation, delivered after it, is ignored.
    const late = await send(provider, { id: "evt_ord_late", kind: "renewed", subscription_ref: "sub_ord" }, days(41));
    expect(late.body.result).toBe("ignored");
    expect((await row(body.purchase_id)).expires_at.getTime()).toBe(days(40).getTime());
  });
});

describe("a paid event must match the purchase", () => {
  it("a different amount, currency or mode is ignored and the purchase stays pending", async () => {
    const provider = new FakeProvider();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { body } = await start(provider);
      const cases: [string, Record<string, unknown>][] = [
        ["amount", { amount_cents: 100 }],
        ["zero amount (no_payment_required)", { amount_cents: 0 }],
        ["missing amount", { amount_cents: null }],
        ["currency", { currency: "USD" }],
        ["mode", { mode: "subscription" }],
      ];
      for (const [name, extra] of cases) {
        const r = await pay(provider, body.purchase_id, `evt_mismatch_${name}`, extra);
        expect(r.body.result, name).toBe("ignored");
        expect((await row(body.purchase_id)).status, name).toBe("pending");
      }
      expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("payment_event_mismatch");
      const { body: pro } = await start(provider, { plan: "pro" });
      expect((await pay(provider, pro.purchase_id, "evt_mismatch_pro", { mode: "payment" })).body.result).toBe("ignored");
      expect((await pay(provider, body.purchase_id, "evt_match")).body.result).toBe("applied");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("no second charge", () => {
  const startWith = (cookie: string | undefined, body: Record<string, unknown>) =>
    handleCheckoutStart(
      getDb,
      new Request("http://localhost/api/v1/checkout", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ email: "again@example.com", plan: "one", ...body }) }),
      opts({ provider: new FakeProvider() }),
    );
  it("an active one-report for this address refuses another one for it, but not for another address or for Pro", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { email: "owner@example.com" });
    await pay(provider, body.purchase_id, "evt_have_one");
    const cookie = await cookieFor(body.purchase_id);
    const before = await count();
    const again = await startWith(cookie, { gnaf_pid: X });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("already_entitled");
    expect(await count()).toBe(before);
    expect((await startWith(cookie, { gnaf_pid: Y })).status).toBe(201);
    expect((await startWith(cookie, { gnaf_pid: X, plan: "pro" })).status).toBe(201);
  });
  it("an active Pro refuses both plans on any address", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { plan: "pro", email: "pro-owner@example.com" });
    await pay(provider, body.purchase_id, "evt_have_pro", { subscription_ref: "sub_have_pro" });
    const cookie = await cookieFor(body.purchase_id);
    for (const plan of ["one", "pro"]) {
      const res = await startWith(cookie, { gnaf_pid: Y, plan });
      expect(res.status, plan).toBe(409);
      expect((await res.json()).error.code).toBe("already_entitled");
    }
  });
  it("an expired purchase does not block buying again", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider, { email: "lapsed@example.com" });
    await pay(provider, body.purchase_id, "evt_lapsed");
    const cookie = await cookieFor(body.purchase_id);
    await db.query("UPDATE app_purchase SET expires_at = now() - interval '1 hour' WHERE purchase_id = $1", [body.purchase_id]);
    expect((await startWith(cookie, { gnaf_pid: X })).status).toBe(201);
  });
});

describe("purchase status", () => {
  it("a paid purchase with no usable entitlement secret is not configured, never 'confirmed' without a cookie", async () => {
    const provider = new FakeProvider();
    const { body } = await start(provider);
    await pay(provider, body.purchase_id, "evt_no_secret");
    for (const e of [{}, { ENTITLEMENT_SECRET: "too-short" }]) {
      const res = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=${body.purchase_id}`), opts({ env: e }));
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("payments_not_configured");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
  it("the answer is never cached or stored", async () => {
    const res = await handlePurchaseStatus(getDb, get(`/api/v1/purchases/me?purchase=pur_${"0".repeat(32)}`), opts());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("a second purchase adds to the cookie instead of replacing it", () => {
  it("pay purchase 1, take its cookie, pay purchase 2 for another address sending cookie 1: both addresses open", async () => {
    const provider = new FakeProvider();
    const { body: one } = await start(provider, { gnaf_pid: X, email: "two@example.com" });
    await pay(provider, one.purchase_id, "evt_merge_1");
    const cookie1 = await cookieFor(one.purchase_id);
    const { body: two } = await start(provider, { gnaf_pid: Y, email: "two@example.com" });
    await pay(provider, two.purchase_id, "evt_merge_2");
    const cookie2 = await cookieFor(two.purchase_id, cookie1);
    for (const pid of [X, Y]) expect((await paidLayerOf(await report(pid, cookie2))).status, pid).toBe("ok");
  });
  it("the same through the dev unlock", async () => {
    const devEnv = { ...env, ALLOW_DEV_UNLOCK: "1" };
    const make = async (pid: string) =>
      (await (await handleCheckoutStart(getDb, post({ gnaf_pid: pid, email: "dev-two@example.com", plan: "one" }), { layers: [paidLayer], env: devEnv })).json()).purchase_id as string;
    const a = await make(X);
    const first = await handleDevUnlock(getDb, get(`/api/v1/dev/unlock?purchase=${a}`), { env: devEnv });
    const cookie1 = first.headers.get("set-cookie")!.split(";")[0];
    const b = await make(Y);
    const second = await handleDevUnlock(getDb, get(`/api/v1/dev/unlock?purchase=${b}`, cookie1), { env: devEnv });
    const cookie2 = second.headers.get("set-cookie")!.split(";")[0];
    for (const pid of [X, Y]) expect((await paidLayerOf(await report(pid, cookie2))).status, pid).toBe("ok");
  });
  it("at the cap, inactive ids (refunded, expired, unknown) are dropped first and an active Pro id is never the one dropped", async () => {
    const hex = (n: number) => n.toString(16).padStart(32, "0");
    const insert = (n: number, plan: "one" | "pro", status: string, expires: string) =>
      db.query(
        `INSERT INTO app_purchase (purchase_id, email, plan, gnaf_pid, status, amount_cents, provider, paid_at, expires_at)
         VALUES ($1, 'cap@example.com', $2, $3, $4, 2400, 'fake', now(), now() + interval '${expires}')`,
        [`pur_${hex(n)}`, plan, plan === "one" ? X : null, status],
      );
    await insert(1, "pro", "paid", "20 days"); // the oldest, and a Pro
    for (let n = 2; n <= 23; n++) await insert(n, "one", "paid", "20 days");
    await insert(24, "one", "refunded", "20 days");
    await insert(25, "one", "paid", "-1 day");
    const existing = [...Array.from({ length: 25 }, (_, i) => `pur_${hex(i + 1)}`), `pur_${hex(999)}`];
    const ids = await activeCookieIds(db, existing, `pur_${hex(23)}`, new Date());
    expect(ids).toHaveLength(20);
    expect(ids).toContain(`pur_${hex(1)}`); // the Pro id survives although it is the oldest
    expect(ids).toContain(`pur_${hex(23)}`); // the newest survives
    for (const bad of [24, 25, 999]) expect(ids).not.toContain(`pur_${hex(bad)}`);
    expect(ids).not.toContain(`pur_${hex(2)}`); // the oldest one-report ids are what goes
  });
});

describe("dev unlock only on a local host", () => {
  const devEnv = { ...env, ALLOW_DEV_UNLOCK: "1" };
  it("answers 404 on any other host even with the flag set, and checkout there says payments are not configured", async () => {
    const id = (await (await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "host@example.com", plan: "one" }), { layers: [paidLayer], env: devEnv })).json()).purchase_id;
    const res = await handleDevUnlock(getDb, new Request(`https://vicprop.example/api/v1/dev/unlock?purchase=${id}`), { env: devEnv });
    expect(res.status).toBe(404);
    expect((await row(id)).status).toBe("pending");
    expect(selectProvider(devEnv, "vicprop.example")).toBeNull();
    expect(selectProvider(devEnv)).toBeNull();
    const start2 = await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "host@example.com", plan: "one" }, "https://vicprop.example/api/v1/checkout"), { layers: [paidLayer], env: devEnv });
    expect(start2.status).toBe(503);
    for (const host of ["localhost", "127.0.0.1"]) {
      expect(selectProvider(devEnv, host)?.id, host).toBe("dev");
    }
  });
  it("two hits at once both get the paid purchase", async () => {
    const id = (await (await handleCheckoutStart(getDb, post({ gnaf_pid: X, email: "race@example.com", plan: "one" }), { layers: [paidLayer], env: devEnv })).json()).purchase_id;
    const [a, b] = await Promise.all([completeDevUnlock(db, id, new Date()), completeDevUnlock(db, id, new Date())]);
    expect(a?.status).toBe("paid");
    expect(b?.status).toBe("paid");
  });
});


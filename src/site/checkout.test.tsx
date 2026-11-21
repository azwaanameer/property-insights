// The checkout and confirmation pages rendered to HTML, and the client decisions behind them. No DOM environment: pure views and stubs.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiResult, JsonFetcher } from "./address-api";
import { checkPurchase, loadCheckoutInfo, startPurchase, validEmail, type CheckoutInfo, type DoneView, type JsonPoster } from "./checkout-api";
import { CheckoutView, type CheckoutViewProps } from "./CheckoutPage";
import { CHECKOUT, DONE, NOT_COVERED } from "./copy";
import { DoneBody } from "./DonePage";

const info = (over: Partial<CheckoutInfo> = {}): CheckoutInfo => ({
  gnaf_pid: "GAVIC100000002",
  display_address: "310/628 Flinders Street, Docklands VIC 3008",
  provider: "stripe",
  payable: true,
  prices: { currency: "AUD", one: { amount_cents: 2400, gst_cents: 218, days: 30 }, pro: { amount_cents: 9900, gst_cents: 900 } },
  ...over,
});
const noop = () => {};
const view = (over: Partial<CheckoutViewProps> = {}) =>
  renderToStaticMarkup(<CheckoutView info={info()} plan="one" email="" busy={false} error="" blocked={null} onPlan={noop} onEmail={noop} onSubmit={noop} {...over} />);

describe("checkout page", () => {
  it("shows the address, both plans, the email field, an order summary with GST included and the refund line", () => {
    const html = view();
    expect(html).toContain("310/628 Flinders Street, Docklands VIC 3008");
    expect(html).toContain(CHECKOUT.one.name);
    expect(html).toContain(CHECKOUT.pro.name);
    expect(html).toContain("$24");
    expect(html).toContain("$99");
    expect(html).toContain("Includes GST of $2.18");
    expect(html).toContain(CHECKOUT.refund);
    expect(html).toContain('type="email"');
    expect(html).not.toContain(CHECKOUT.devBanner);
    expect(html).toContain("Continue to payment");
  });
  it("pro selected: the summary is the Pro price and GST", () => {
    const html = view({ plan: "pro" });
    expect(html).toContain("VicProp Pro, monthly");
    expect(html).toContain("Includes GST of $9");
  });
  it("dev mode shows the banner and says no payment is taken", () => {
    const html = view({ info: info({ provider: "dev" }) });
    expect(html).toContain("Dev unlock, no payment taken");
    expect(html).toContain(CHECKOUT.submitDev);
  });
  it("payments not configured: a plain message and a disabled form", () => {
    const html = view({ info: info({ provider: null }) });
    expect(html).toContain(CHECKOUT.notConfigured);
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  });
  it("nothing to unlock: the plain message, no purchase can start", () => {
    const html = view({ info: info({ payable: false }) });
    expect(html).toContain(CHECKOUT.nothingToUnlock);
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
  it("an error from a start attempt is shown in place; a blocked reason switches the form off", () => {
    expect(view({ error: CHECKOUT.failed })).toContain(CHECKOUT.failed);
    expect(view({ blocked: "nothing_to_unlock", error: CHECKOUT.nothingToUnlock })).toMatch(/<fieldset[^>]*disabled/);
  });
  it("busy: the button is disabled and says so", () => {
    expect(view({ busy: true })).toContain(CHECKOUT.busy);
  });
});

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = (status: number, code: string, message = "m"): ApiResult<never> => ({ ok: false, status, error: { code, message } });
const getStub = (r: ApiResult<unknown>): JsonFetcher => (async () => r) as JsonFetcher;
const postStub = (r: ApiResult<unknown>, seen?: { url?: string; body?: unknown }): JsonPoster =>
  (async (url: string, body: unknown) => {
    if (seen) Object.assign(seen, { url, body });
    return r;
  }) as JsonPoster;

describe("checkout client", () => {
  it("loads the order, or sorts a failure into a view", async () => {
    expect(await loadCheckoutInfo("GAVIC1", null, getStub(ok(info())))).toMatchObject({ kind: "ok" });
    expect(await loadCheckoutInfo("GANSW1", null, getStub(fail(404, "not_covered")))).toEqual({ kind: "not_covered", message: CHECKOUT.notCovered });
    expect(CHECKOUT.notCovered).toContain("outside Victoria");
    expect(NOT_COVERED.title).toContain("Victoria");
    expect(await loadCheckoutInfo("X", null, getStub(fail(404, "address_not_found", "No address.")))).toMatchObject({ kind: "not_found" });
    expect(await loadCheckoutInfo("X", null, getStub(fail(500, "internal_error")))).toMatchObject({ kind: "failed" });
    expect(await loadCheckoutInfo("X", null, getStub(fail(0, "network")))).toEqual({ kind: "failed", message: CHECKOUT.network });
    expect(await loadCheckoutInfo("X", null, getStub(ok({ nothing: true })))).toMatchObject({ kind: "failed" });
  });
  it("email check", () => {
    expect(validEmail("a@b.co")).toBe(true);
    for (const bad of ["", "a", "a@b", "a b@c.de", "@b.co"]) expect(validEmail(bad), bad).toBe(false);
  });
  it("a bad email never reaches the server", async () => {
    const seen: { url?: string } = {};
    expect(await startPurchase({ pid: "GAVIC1", email: "nope", plan: "one" }, postStub(ok({}), seen))).toEqual({ kind: "error", message: CHECKOUT.emailInvalid });
    expect(seen.url).toBeUndefined();
  });
  it("sends the pid, unit, trimmed email and plan, and redirects to the provider's url", async () => {
    const seen: { url?: string; body?: unknown } = {};
    const out = await startPurchase({ pid: "GAVIC1", unit: "310", email: " a@b.co ", plan: "pro" }, postStub(ok({ checkout_url: "https://pay.example/x" }), seen));
    expect(out).toEqual({ kind: "redirect", url: "https://pay.example/x" });
    expect(seen).toEqual({ url: "/api/v1/checkout", body: { gnaf_pid: "GAVIC1", unit: "310", email: "a@b.co", plan: "pro" } });
  });
  it("each refusal has plain words and the unfixable ones are marked blocked", async () => {
    const run = (r: ApiResult<unknown>) => startPurchase({ pid: "GAVIC1", email: "a@b.co", plan: "one" }, postStub(r));
    expect(await run(fail(503, "payments_not_configured"))).toEqual({ kind: "error", message: CHECKOUT.notConfigured, blocked: "not_configured" });
    expect(await run(fail(409, "nothing_to_unlock"))).toEqual({ kind: "error", message: CHECKOUT.nothingToUnlock, blocked: "nothing_to_unlock" });
    expect(await run(fail(502, "payment_failed"))).toEqual({ kind: "error", message: CHECKOUT.failed });
    expect(await run(fail(0, "network"))).toEqual({ kind: "error", message: CHECKOUT.network });
    expect(await run(ok({}))).toEqual({ kind: "error", message: CHECKOUT.failed });
  });
});

describe("confirmation page", () => {
  const done = (v: DoneView, slow = false) => renderToStaticMarkup(<DoneBody view={v} slow={slow} onRetry={noop} />);
  it("checking, then slow with a retry", () => {
    expect(done({ kind: "checking" })).toContain(DONE.checking.title);
    const slow = done({ kind: "checking" }, true);
    expect(slow).toContain(DONE.slow.title);
    expect(slow).toContain(DONE.slow.action);
  });
  it("paid one report links to the report; paid pro links to the search", () => {
    const one = done({ kind: "paid", plan: "one", gnaf_pid: "GAVIC100000002", expires_at: "2026-12-21T00:00:00Z" });
    expect(one).toContain(DONE.paidOne.title);
    expect(one).toContain('href="/report/GAVIC100000002"');
    expect(one).toContain("30 days");
    expect(one).toContain(DONE.keep.replace("'", "&#x27;")); // the markup escapes the apostrophe
    const pro = done({ kind: "paid", plan: "pro", gnaf_pid: null, expires_at: "2026-12-21T00:00:00Z" });
    expect(pro).toContain(DONE.paidPro.title);
    expect(pro).toContain("21 December 2026");
  });
  it("refunded, expired, failed, unknown, error and missing each say so plainly", () => {
    for (const kind of ["refunded", "expired", "failed", "unknown", "missing"] as const) {
      const html = done({ kind });
      expect(html, kind).toContain(DONE[kind].title);
      expect(html, kind).toContain(DONE.home);
    }
  });
  it("a failed check shows a retry action, not a dead end", () => {
    const html = done({ kind: "error" });
    expect(html).toContain(DONE.error.title);
    expect(html).toContain(DONE.error.action);
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });
  it("the copy promises no email or receipt, because none is sent", () => {
    for (const text of [CHECKOUT.emailHelp, DONE.unknown.text, DONE.keep]) expect(text.toLowerCase()).not.toMatch(/receipt/);
    expect(CHECKOUT.emailHelp).toContain("No email is sent yet");
    expect(DONE.keep).toContain("no email is sent");
  });
  it("the status check turns every answer into a view", async () => {
    const view = async (r: ApiResult<unknown>) => checkPurchase("pur_" + "a".repeat(32), getStub(r));
    const p = (status: string) => ok({ purchase: { status, plan: "one", gnaf_pid: "GAVIC1", expires_at: "2026-12-21T00:00:00Z" }, active: [] });
    expect(await view(p("pending"))).toEqual({ kind: "checking" });
    expect(await view(p("paid"))).toEqual({ kind: "paid", plan: "one", gnaf_pid: "GAVIC1", expires_at: "2026-12-21T00:00:00Z" });
    for (const k of ["refunded", "expired", "failed"] as const) expect(await view(p(k))).toEqual({ kind: k });
    expect(await view(ok({ purchase: null, active: [] }))).toEqual({ kind: "unknown" });
    expect(await view(fail(400, "bad_request"))).toEqual({ kind: "unknown" });
    expect(await view(fail(500, "internal_error"))).toEqual({ kind: "error" });
  });
});

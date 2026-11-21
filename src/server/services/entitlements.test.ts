import { describe, expect, it } from "vitest";
import { ANONYMOUS, type Principal } from "../contracts/address";
import { entitlements, principalFromPurchases } from "./entitlements";
import type { PurchaseRow } from "../repos/purchase";

const paid = { layer_id: "L04", tier: "paid" } as const;
const NOW = new Date("2026-11-21T00:00:00Z");
const later = "2026-12-21T00:00:00.000Z";
const earlier = "2026-11-01T00:00:00.000Z";
const user = (over: Partial<Extract<Principal, { kind: "user" }>>): Principal => ({ kind: "user", user_id: "u1", plan: "none", ...over });

describe("entitlements (AD-3)", () => {
  it("free layers are free for everyone", () => {
    expect(entitlements(ANONYMOUS, { layer_id: "L01", tier: "free" })).toBe("free");
  });
  it("paid layers are locked for anonymous and for users with nothing paid", () => {
    expect(entitlements(ANONYMOUS, paid)).toBe("locked");
    expect(entitlements(user({}), paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("locked");
  });
  it("an active pro plan opens every address", () => {
    const p = user({ plan: "pro", plan_expires_at: later });
    expect(entitlements(p, paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("entitled");
    expect(entitlements(p, paid, { gnaf_pid: "GAVIC2", now: NOW })).toBe("entitled");
    expect(entitlements(p, paid, { now: NOW })).toBe("entitled");
  });
  it("an expired pro plan, or one with no expiry, locks again", () => {
    expect(entitlements(user({ plan: "pro", plan_expires_at: earlier }), paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("locked");
    expect(entitlements(user({ plan: "pro" }), paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("locked");
  });
  it("a one-report purchase opens only its own address, and only until it expires", () => {
    const p = user({ plan: "one", unlocked: [{ gnaf_pid: "GAVIC1", expires_at: later }] });
    expect(entitlements(p, paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("entitled");
    expect(entitlements(p, paid, { gnaf_pid: "GAVIC2", now: NOW })).toBe("locked");
    expect(entitlements(p, paid, { now: NOW })).toBe("locked");
    expect(entitlements(user({ plan: "one", unlocked: [{ gnaf_pid: "GAVIC1", expires_at: earlier }] }), paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("locked");
  });
  it("a plan name alone grants nothing", () => {
    expect(entitlements(user({ plan: "one" }), paid, { gnaf_pid: "GAVIC1", now: NOW })).toBe("locked");
  });
});

const row = (over: Partial<PurchaseRow>): PurchaseRow => ({
  purchase_id: "pur_" + "a".repeat(32), email: "buyer@example.com", plan: "one", gnaf_pid: "GAVIC1", status: "paid", amount_cents: 2400, currency: "AUD",
  provider: "dev", provider_ref: null, provider_payment_ref: null, provider_subscription_ref: null, created_at: earlier, paid_at: earlier, expires_at: later, refunded_at: null, ended_at: null, ...over,
});

describe("principalFromPurchases", () => {
  it("no purchases is anonymous; a guest id never holds the email", async () => {
    expect(await principalFromPurchases([])).toEqual(ANONYMOUS);
    const p = await principalFromPurchases([row({})]);
    expect(p).toMatchObject({ kind: "user", plan: "one", unlocked: [{ gnaf_pid: "GAVIC1", expires_at: later }] });
    expect(JSON.stringify(p)).not.toContain("buyer@example.com");
  });
  it("pro wins over one and carries its own expiry", async () => {
    const p = await principalFromPurchases([row({}), row({ purchase_id: "pur_" + "b".repeat(32), plan: "pro", gnaf_pid: null, expires_at: "2026-12-30T00:00:00Z" })]);
    expect(p).toMatchObject({ plan: "pro", plan_expires_at: "2026-12-30T00:00:00Z" });
  });
  it("purchases that are not paid grant nothing", async () => {
    expect(await principalFromPurchases([row({ status: "refunded" }), row({ status: "pending", expires_at: null })])).toEqual(ANONYMOUS);
  });
});

import { describe, expect, it } from "vitest";
import { base64UrlEncode } from "../crypto";
import { buildSetCookie, COOKIE_NAME, isSecureRequest, readCookie, signEntitlementCookie, verifyEntitlementCookie } from "./entitlement-cookie";

const SECRET = "test-entitlement-secret-0123456789abcdef";
const NOW = new Date("2026-11-21T00:00:00Z");

describe("entitlement cookie", () => {
  it("round trips the purchase ids", async () => {
    const v = await signEntitlementCookie(["pur_a", "pur_b", "pur_a"], SECRET, NOW);
    expect(await verifyEntitlementCookie(v, SECRET, NOW)).toMatchObject({ v: 1, ids: ["pur_a", "pur_b"] });
  });
  it("holds no email, price or address", async () => {
    const v = await signEntitlementCookie(["pur_a"], SECRET, NOW);
    expect(atob(v.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).toBe(JSON.stringify({ v: 1, ids: ["pur_a"], exp: Math.floor(NOW.getTime() / 1000) + 400 * 86400 }));
  });
  it("a wrong secret, a changed payload, a changed signature and junk are all rejected", async () => {
    const v = await signEntitlementCookie(["pur_a"], SECRET, NOW);
    const [body, sig] = v.split(".");
    const forgedBody = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, ids: ["pur_stolen"], exp: 9_999_999_999 })));
    for (const bad of [`${forgedBody}.${sig}`, `${body}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, `${body}.`, `.${sig}`, body, "a.b.c", "", "%%%.%%%"]) {
      expect(await verifyEntitlementCookie(bad, SECRET, NOW), bad).toBeNull();
    }
    expect(await verifyEntitlementCookie(v, SECRET + "x", NOW)).toBeNull();
  });
  it("past its own expiry it is rejected", async () => {
    const v = await signEntitlementCookie(["pur_a"], SECRET, NOW, 60);
    expect(await verifyEntitlementCookie(v, SECRET, new Date(NOW.getTime() + 59_000))).not.toBeNull();
    expect(await verifyEntitlementCookie(v, SECRET, new Date(NOW.getTime() + 61_000))).toBeNull();
  });
  it("a correctly signed body of the wrong shape is rejected", async () => {
    const { hmacSha256 } = await import("../crypto");
    const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 2, ids: "x", exp: 1 })));
    const sig = base64UrlEncode(await hmacSha256(SECRET, body));
    expect(await verifyEntitlementCookie(`${body}.${sig}`, SECRET, NOW)).toBeNull();
  });
  it("reads its own cookie out of a header with others", () => {
    const req = new Request("http://localhost/", { headers: { cookie: `a=1; ${COOKIE_NAME}=abc.def; b=2` } });
    expect(readCookie(req)).toBe("abc.def");
    expect(readCookie(new Request("http://localhost/"))).toBeNull();
  });
  it("Set-Cookie is HttpOnly, SameSite=Lax and Secure everywhere except plain-http localhost", () => {
    expect(buildSetCookie("v", { secure: true })).toBe(`${COOKIE_NAME}=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}; Secure`);
    expect(buildSetCookie("v", { secure: false })).not.toContain("Secure");
    expect(isSecureRequest(new Request("http://localhost:3000/x"))).toBe(false);
    expect(isSecureRequest(new Request("http://127.0.0.1/x"))).toBe(false);
    expect(isSecureRequest(new Request("https://vicprop.example/x"))).toBe(true);
    expect(isSecureRequest(new Request("http://vicprop.example/x"))).toBe(true);
    expect(isSecureRequest(new Request("https://localhost/x"))).toBe(true);
  });
});

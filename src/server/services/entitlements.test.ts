import { describe, expect, it } from "vitest";
import { ANONYMOUS } from "../contracts/address";
import { entitlements } from "./entitlements";

describe("entitlements (AD-3)", () => {
  it("free layers are free for everyone", () => {
    expect(entitlements(ANONYMOUS, { layer_id: "L01", tier: "free" })).toBe("free");
  });
  it("paid layers are locked for anonymous and for signed-in users without a plan", () => {
    expect(entitlements(ANONYMOUS, { layer_id: "L04", tier: "paid" })).toBe("locked");
    expect(entitlements({ kind: "user", user_id: "u1", plan: "none" }, { layer_id: "L04", tier: "paid" })).toBe("locked");
  });
  it("paid layers are open to a paid plan", () => {
    expect(entitlements({ kind: "user", user_id: "u1", plan: "individual" }, { layer_id: "L04", tier: "paid" })).toBe("entitled");
    expect(entitlements({ kind: "user", user_id: "u1", plan: "pro" }, { layer_id: "L04", tier: "paid" })).toBe("entitled");
  });
});

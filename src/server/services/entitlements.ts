// AD-3: the one seam. Only this function reads a principal's plan. Everything else asks it.
import type { Principal } from "../contracts/address";
import type { LayerTier } from "../contracts/layer";

export type Entitlement = "free" | "entitled" | "locked";

/**
 * Decides whether a principal may see a layer's data.
 * - free layers: always `free`
 * - paid layers: `entitled` for a signed-in user on a paid plan, otherwise `locked`
 * There is no login or billing yet, so in practice every request is anonymous and paid layers are locked.
 */
export function entitlements(principal: Principal, layer: { layer_id: string; tier: LayerTier }): Entitlement {
  if (layer.tier === "free") return "free";
  if (principal.kind === "user" && (principal.plan === "individual" || principal.plan === "pro")) return "entitled";
  return "locked";
}

/** The principal for a request. No auth provider yet (deferred in the spine), so every request is anonymous. */
export function resolvePrincipal(_request: Request): Principal {
  return { kind: "anonymous" };
}

export function principalId(principal: Principal): string | null {
  return principal.kind === "user" ? principal.user_id : null;
}

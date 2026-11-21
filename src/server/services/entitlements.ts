// AD-3: the one seam. Only this function reads a principal's plan. Everything else asks it.
import { ANONYMOUS, type Principal } from "../contracts/address";
import type { LayerTier } from "../contracts/layer";
import { entitlementSecret, processEnv, type Env } from "../config";
import { sha256Hex } from "../crypto";
import type { Db } from "../db";
import { listActiveByIds, type PurchaseRow } from "../repos/purchase";
import { readCookie, verifyEntitlementCookie } from "./entitlement-cookie";

export type Entitlement = "free" | "entitled" | "locked";

export interface EntitlementContext {
  /** The address the report is for. A `one` purchase opens only this address. */
  gnaf_pid?: string;
  now?: Date;
}

/**
 * Decides whether a principal may see a layer's data.
 * - free layers: always `free`
 * - paid layers: `entitled` for an active pro plan (any address) or an active one-report purchase for this address
 * - anything expired, missing or for another address is `locked`
 */
export function entitlements(principal: Principal, layer: { layer_id: string; tier: LayerTier }, ctx: EntitlementContext = {}): Entitlement {
  if (layer.tier === "free") return "free";
  if (principal.kind !== "user") return "locked";
  const now = (ctx.now ?? new Date()).getTime();
  const live = (iso: string | undefined) => iso !== undefined && Date.parse(iso) > now;
  if (principal.plan === "pro" && live(principal.plan_expires_at)) return "entitled";
  if (ctx.gnaf_pid && principal.unlocked?.some((u) => u.gnaf_pid === ctx.gnaf_pid && live(u.expires_at))) return "entitled";
  return "locked";
}

/** A stable, non-reversible id for a guest, so logs never hold an email address. */
export async function guestUserId(email: string): Promise<string> {
  return `guest_${(await sha256Hex(email.trim().toLowerCase())).slice(0, 16)}`;
}

/** The principal for a set of active purchases. Expiry is checked again by entitlements(). */
export async function principalFromPurchases(purchases: PurchaseRow[]): Promise<Principal> {
  const active = purchases.filter((p) => p.status === "paid" && p.expires_at);
  if (active.length === 0) return ANONYMOUS;
  const pro = active.filter((p) => p.plan === "pro").sort((a, b) => (b.expires_at! > a.expires_at! ? 1 : -1))[0];
  const unlocked = active.filter((p) => p.plan === "one" && p.gnaf_pid).map((p) => ({ gnaf_pid: p.gnaf_pid!, expires_at: p.expires_at! }));
  return {
    kind: "user",
    user_id: await guestUserId(active[0].email),
    plan: pro ? "pro" : "one",
    plan_expires_at: pro?.expires_at ?? undefined,
    unlocked,
  };
}

/**
 * The principal for a request: anonymous unless the entitlement cookie is signed correctly, unexpired and names purchases
 * that are paid and unexpired in the database. A refund therefore ends access even while the cookie lives on.
 */
export async function resolvePrincipal(request: Request, db: Db, opts: { env?: Env; now?: Date } = {}): Promise<Principal> {
  const now = opts.now ?? new Date();
  const secret = entitlementSecret(opts.env ?? processEnv());
  const raw = readCookie(request);
  if (!secret || !raw) return ANONYMOUS;
  const payload = await verifyEntitlementCookie(raw, secret, now);
  if (!payload || payload.ids.length === 0) return ANONYMOUS;
  return principalFromPurchases(await listActiveByIds(db, payload.ids, now.toISOString()));
}

export function principalId(principal: Principal): string | null {
  return principal.kind === "user" ? principal.user_id : null;
}

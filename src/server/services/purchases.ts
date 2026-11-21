// Purchases: start a checkout, apply a verified provider event, complete a dev unlock. The rules that decide who may see paid
// layers stay in entitlements.ts (AD-3); this file only records what was paid for and for how long.
import { CURRENCY, ONE_REPORT, PRO_MONTHLY, planAmountCents, type PlanId } from "../../config/pricing";
import type { ResolvedAddress } from "../contracts/address";
import type { Db } from "../db";
import type { LayerDef } from "../layers/types";
import { errorFields, log } from "../log";
import type { PaymentEvent, PaymentProvider } from "../payments/types";
import {
  claimWebhookEvent,
  findByPaymentRefs,
  findBySubscriptionRef,
  getPurchase,
  insertPurchase,
  markFailed,
  markPaid,
  markRefunded,
  endSubscription,
  extendExpiry,
  listActiveByIds,
  markEventApplied,
  releaseWebhookEvent,
  setCheckoutRef,
  type PurchaseRow,
} from "../repos/purchase";
import { loadRights } from "./assemble-report";
import { MAX_PURCHASES_IN_COOKIE } from "./entitlement-cookie";
import { rightsGate } from "./layer-runner";

const DAY_MS = 24 * 60 * 60 * 1000;

/** An unguessable id (122 random bits). It is also the bearer of the return link, so it is never logged next to an email. */
export function newPurchaseId(): string {
  return `pur_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function expiryFor(plan: PlanId, paidAt: Date): Date {
  return new Date(paidAt.getTime() + (plan === "one" ? ONE_REPORT.days : PRO_MONTHLY.period_days) * DAY_MS);
}

/** Paid layers that are enabled and have every source cleared. If there are none, there is nothing to sell. */
export async function payableLayers(db: Db, layers: LayerDef[]): Promise<LayerDef[]> {
  const rights = await loadRights(db);
  return layers.filter((l) => l.tier === "paid" && rightsGate(l, rights).ok);
}

export function describePlan(plan: PlanId, address: Pick<ResolvedAddress, "display_address">): string {
  return plan === "one" ? `VicProp full report: ${address.display_address}` : "VicProp Pro, monthly";
}

export interface StartCheckoutInput {
  db: Db;
  provider: PaymentProvider;
  plan: PlanId;
  email: string;
  address: ResolvedAddress;
  origin: string;
}

/** Records a pending purchase and asks the provider for a checkout URL. A provider failure marks the purchase failed and rethrows. */
export async function startCheckout(input: StartCheckoutInput): Promise<{ purchase: PurchaseRow; checkout_url: string }> {
  const { db, provider, plan, address } = input;
  const email = input.email.trim().toLowerCase();
  const purchase = await insertPurchase(db, {
    purchase_id: newPurchaseId(),
    email,
    plan,
    gnaf_pid: plan === "one" ? address.gnaf_pid : null,
    amount_cents: planAmountCents(plan),
    currency: CURRENCY,
    provider: provider.id,
  });
  let session;
  try {
    session = await provider.createCheckout({
      purchase_id: purchase.purchase_id,
      plan,
      email,
      gnaf_pid: purchase.gnaf_pid,
      amount_cents: purchase.amount_cents,
      currency: purchase.currency,
      description: describePlan(plan, address),
      success_url: `${input.origin}/done?purchase=${encodeURIComponent(purchase.purchase_id)}`,
      cancel_url: `${input.origin}/checkout/${encodeURIComponent(address.gnaf_pid)}${plan === "pro" ? "?plan=pro" : ""}`,
    });
  } catch (err) {
    // Only a failed provider call fails the purchase. If the provider did create a session and our own write below fails, the
    // buyer can still pay it, and a verified paid event moves the purchase on from pending or failed.
    await markFailed(db, purchase.purchase_id);
    throw err;
  }
  await setCheckoutRef(db, purchase.purchase_id, session.provider_ref);
  return { purchase, checkout_url: session.url };
}

/** `retry`: an event for a purchase we cannot find yet (it may have arrived before the payment). Answer non-2xx so the provider resends. */
export type EventResult = "applied" | "duplicate" | "ignored" | "unmatched" | "retry";

/**
 * Applies one verified provider event, at most once per event id. The event id is claimed first and marked applied last; a claim
 * that was never finished goes stale and a retry takes it over. If applying fails the claim is released so the retry is handled.
 * Every transition is conditional in SQL, so a repeat can never double-apply.
 */
export async function applyPaymentEvent(db: Db, provider: PaymentProvider, event: PaymentEvent, now: Date, requestId?: string): Promise<EventResult> {
  if (event.kind === "ignored") return "ignored";
  if (!(await claimWebhookEvent(db, provider.id, event.id, event.kind))) return "duplicate";
  const release = () =>
    releaseWebhookEvent(db, provider.id, event.id).catch((err) =>
      log("error", "webhook_release_failed", { request_id: requestId, provider: provider.id, kind: event.kind, ...errorFields(err) }),
    );
  try {
    const result = await applyClaimedEvent(db, provider, event, now, requestId);
    if (result === "unmatched" && event.kind !== "paid" && event.kind !== "failed") {
      // A refund, renewal or end that names nothing we hold may have beaten the paid event. Do not keep the claim.
      log("warn", "payment_event_unmatched", { request_id: requestId, provider: provider.id, kind: event.kind });
      await release();
      return "retry";
    }
    await markEventApplied(db, provider.id, event.id);
    if (result === "unmatched") log("warn", "payment_event_unmatched", { request_id: requestId, provider: provider.id, kind: event.kind });
    return result;
  } catch (err) {
    log("error", "payment_event_failed", { request_id: requestId, provider: provider.id, kind: event.kind, ...errorFields(err) });
    await release();
    throw err;
  }
}

async function applyClaimedEvent(db: Db, provider: PaymentProvider, event: Exclude<PaymentEvent, { kind: "ignored" }>, now: Date, requestId?: string): Promise<EventResult> {
  const at = now.toISOString();
  switch (event.kind) {
    case "paid": {
      const purchase = event.purchase_id ? await getPurchase(db, event.purchase_id) : null;
      if (!purchase || purchase.provider !== provider.id) return "unmatched";
      // The event must describe this purchase: what was charged, in what currency, and for which kind of checkout.
      const mode = purchase.plan === "pro" ? "subscription" : "payment";
      if (event.amount_cents !== purchase.amount_cents || event.currency !== purchase.currency || event.mode !== mode) {
        log("warn", "payment_event_mismatch", {
          request_id: requestId,
          provider: provider.id,
          expected: { amount_cents: purchase.amount_cents, currency: purchase.currency, mode },
          received: { amount_cents: event.amount_cents, currency: event.currency, mode: event.mode },
        });
        return "ignored";
      }
      const updated = await markPaid(db, purchase.purchase_id, {
        paid_at: at,
        expires_at: expiryFor(purchase.plan, now).toISOString(),
        provider_ref: event.provider_ref,
        payment_ref: event.payment_ref,
        subscription_ref: event.subscription_ref,
      });
      return updated ? "applied" : "ignored";
    }
    case "failed": {
      const purchase = event.purchase_id ? await getPurchase(db, event.purchase_id) : null;
      if (!purchase || purchase.provider !== provider.id) return "unmatched";
      return (await markFailed(db, purchase.purchase_id)) ? "applied" : "ignored";
    }
    case "refunded": {
      const purchase =
        (event.purchase_id ? await getPurchase(db, event.purchase_id) : null) ?? (await findByPaymentRefs(db, provider.id, event.payment_refs));
      if (!purchase || purchase.provider !== provider.id) return "unmatched";
      return (await markRefunded(db, purchase.purchase_id, at)) ? "applied" : "ignored";
    }
    case "renewed": {
      const purchase = await findBySubscriptionRef(db, provider.id, event.subscription_ref);
      if (!purchase) return "unmatched";
      return (await extendExpiry(db, purchase.purchase_id, expiryFor("pro", now).toISOString())) ? "applied" : "ignored";
    }
    case "ended": {
      const purchase = await findBySubscriptionRef(db, provider.id, event.subscription_ref);
      if (!purchase) return "unmatched";
      return (await endSubscription(db, purchase.purchase_id, at)) ? "applied" : "ignored";
    }
  }
}

/**
 * The dev unlock: marks a pending dev purchase paid, no money involved. Returns the paid purchase, or null when the purchase is
 * unknown, belongs to another provider, or was refunded or failed. A purchase that is already paid is returned unchanged.
 */
export async function completeDevUnlock(db: Db, purchaseId: string, now: Date): Promise<PurchaseRow | null> {
  const purchase = await getPurchase(db, purchaseId);
  if (!purchase || purchase.provider !== "dev") return null;
  if (purchase.status === "paid") return purchase;
  if (purchase.status !== "pending") return null;
  const paid = await markPaid(db, purchaseId, {
    paid_at: now.toISOString(),
    expires_at: expiryFor(purchase.plan, now).toISOString(),
    provider_ref: purchase.provider_ref,
  });
  if (paid) return paid;
  // Lost a race with a concurrent hit: if the other one paid it, that is the answer.
  const again = await getPurchase(db, purchaseId);
  return again?.status === "paid" ? again : null;
}

/**
 * The ids for a new cookie: the ones still active in the database (expired, refunded and unknown ids are dropped), then the new
 * one. Over the cap the oldest one-report ids go first, so an active Pro id is never the one dropped.
 */
export async function activeCookieIds(db: Db, existing: string[], newId: string, now: Date): Promise<string[]> {
  const active = await listActiveByIds(db, [...new Set([...existing, newId])], now.toISOString());
  const ordered = [...active.filter((p) => p.plan !== "pro"), ...active.filter((p) => p.plan === "pro")].map((p) => p.purchase_id);
  return ordered.slice(-MAX_PURCHASES_IN_COOKIE);
}

/** What the buyer's confirmation page needs. `expired` is a paid purchase whose time has run out. */
export function purchaseView(p: PurchaseRow, now: Date): { status: "pending" | "paid" | "refunded" | "failed" | "expired"; plan: PlanId; gnaf_pid: string | null; expires_at: string | null } {
  const expired = p.status === "paid" && (!p.expires_at || Date.parse(p.expires_at) <= now.getTime());
  return { status: expired ? "expired" : p.status, plan: p.plan, gnaf_pid: p.gnaf_pid, expires_at: p.expires_at };
}

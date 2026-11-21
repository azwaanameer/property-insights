// app_purchase and app_webhook_event: written by the application (AD-8). SQL only; the rules live in services/purchases.ts.
// Timestamps leave SQL as ISO 8601 UTC text, so every database driver returns the same shape.
import type { Db } from "../db";

export type PurchaseStatus = "pending" | "paid" | "refunded" | "failed";

export interface PurchaseRow {
  purchase_id: string;
  email: string;
  plan: "one" | "pro";
  gnaf_pid: string | null;
  status: PurchaseStatus;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_ref: string | null;
  provider_payment_ref: string | null;
  provider_subscription_ref: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  refunded_at: string | null;
  ended_at: string | null;
}

const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const COLUMNS = `purchase_id, email, plan, gnaf_pid, status, amount_cents::int AS amount_cents, currency, provider, provider_ref,
  provider_payment_ref, provider_subscription_ref, ${ISO("created_at")} AS created_at, ${ISO("paid_at")} AS paid_at,
  ${ISO("expires_at")} AS expires_at, ${ISO("refunded_at")} AS refunded_at, ${ISO("ended_at")} AS ended_at`;

export async function insertPurchase(
  db: Db,
  p: Pick<PurchaseRow, "purchase_id" | "email" | "plan" | "gnaf_pid" | "amount_cents" | "currency" | "provider">,
): Promise<PurchaseRow> {
  const rows = await db.query<PurchaseRow>(
    `INSERT INTO app_purchase (purchase_id, email, plan, gnaf_pid, amount_cents, currency, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [p.purchase_id, p.email, p.plan, p.gnaf_pid, p.amount_cents, p.currency, p.provider],
  );
  return rows[0];
}

export async function getPurchase(db: Db, purchaseId: string): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(`SELECT ${COLUMNS} FROM app_purchase WHERE purchase_id = $1`, [purchaseId]);
  return rows[0] ?? null;
}

export async function setCheckoutRef(db: Db, purchaseId: string, providerRef: string): Promise<void> {
  await db.query(`UPDATE app_purchase SET provider_ref = $2 WHERE purchase_id = $1`, [purchaseId, providerRef]);
}

/** pending -> failed. True when it changed. */
export async function markFailed(db: Db, purchaseId: string): Promise<boolean> {
  const rows = await db.query(`UPDATE app_purchase SET status = 'failed' WHERE purchase_id = $1 AND status = 'pending' RETURNING purchase_id`, [purchaseId]);
  return rows.length > 0;
}

/**
 * pending or failed -> paid, once. A verified paid event is the truth even for a purchase we had marked failed (the provider call
 * may have succeeded while our own follow-up write failed). Paid and refunded purchases are left alone and null comes back.
 */
export async function markPaid(
  db: Db,
  purchaseId: string,
  v: { paid_at: string; expires_at: string; provider_ref?: string | null; payment_ref?: string | null; subscription_ref?: string | null },
): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(
    `UPDATE app_purchase
        SET status = 'paid', paid_at = $2::timestamptz, expires_at = $3::timestamptz,
            provider_ref = COALESCE($4, provider_ref), provider_payment_ref = COALESCE($5, provider_payment_ref),
            provider_subscription_ref = COALESCE($6, provider_subscription_ref)
      WHERE purchase_id = $1 AND status IN ('pending', 'failed')
      RETURNING ${COLUMNS}`,
    [purchaseId, v.paid_at, v.expires_at, v.provider_ref ?? null, v.payment_ref ?? null, v.subscription_ref ?? null],
  );
  return rows[0] ?? null;
}

/** Only a provider refund event reaches this. A purchase that is pending or paid becomes refunded and access ends. */
export async function markRefunded(db: Db, purchaseId: string, at: string): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(
    `UPDATE app_purchase SET status = 'refunded', refunded_at = $2::timestamptz, expires_at = LEAST(COALESCE(expires_at, $2::timestamptz), $2::timestamptz)
      WHERE purchase_id = $1 AND status IN ('pending', 'paid')
      RETURNING ${COLUMNS}`,
    [purchaseId, at],
  );
  return rows[0] ?? null;
}

/** A renewal. Never shortens an expiry, and never reopens a purchase whose subscription has ended. */
export async function extendExpiry(db: Db, purchaseId: string, expiresAt: string): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(
    `UPDATE app_purchase SET expires_at = GREATEST(expires_at, $2::timestamptz)
      WHERE purchase_id = $1 AND status = 'paid' AND ended_at IS NULL RETURNING ${COLUMNS}`,
    [purchaseId, expiresAt],
  );
  return rows[0] ?? null;
}

/** The subscription ended: access stops now (never later than it already would) and no renewal can reopen it. */
export async function endSubscription(db: Db, purchaseId: string, at: string): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(
    `UPDATE app_purchase SET ended_at = $2::timestamptz, expires_at = LEAST(expires_at, $2::timestamptz)
      WHERE purchase_id = $1 AND status = 'paid' AND ended_at IS NULL RETURNING ${COLUMNS}`,
    [purchaseId, at],
  );
  return rows[0] ?? null;
}

export async function findByPaymentRefs(db: Db, provider: string, refs: string[]): Promise<PurchaseRow | null> {
  if (refs.length === 0) return null;
  const rows = await db.query<PurchaseRow>(
    `SELECT ${COLUMNS} FROM app_purchase WHERE provider = $1 AND provider_payment_ref = ANY($2::text[]) ORDER BY created_at DESC LIMIT 1`,
    [provider, refs],
  );
  return rows[0] ?? null;
}

export async function findBySubscriptionRef(db: Db, provider: string, ref: string): Promise<PurchaseRow | null> {
  const rows = await db.query<PurchaseRow>(
    `SELECT ${COLUMNS} FROM app_purchase WHERE provider = $1 AND provider_subscription_ref = $2 ORDER BY created_at DESC LIMIT 1`,
    [provider, ref],
  );
  return rows[0] ?? null;
}

/** Paid and not yet expired, for the ids a request's cookie names. */
export async function listActiveByIds(db: Db, ids: string[], now: string): Promise<PurchaseRow[]> {
  if (ids.length === 0) return [];
  return db.query<PurchaseRow>(
    `SELECT ${COLUMNS} FROM app_purchase
      WHERE purchase_id = ANY($1::text[]) AND status = 'paid' AND expires_at > $2::timestamptz
      ORDER BY created_at`,
    [ids, now],
  );
}

/** An unapplied claim older than this is a worker that died, and a retry may take it over. */
export const STALE_CLAIM = "2 minutes";

/**
 * True when this delivery should be handled: the event is new, or an earlier claim was never applied and has gone stale.
 * False for an applied event and for a claim another delivery is still working on.
 */
export async function claimWebhookEvent(db: Db, provider: string, eventId: string, eventType: string): Promise<boolean> {
  const rows = await db.query(
    `INSERT INTO app_webhook_event (provider, event_id, event_type) VALUES ($1, $2, $3)
     ON CONFLICT (provider, event_id) DO UPDATE SET received_at = now(), event_type = EXCLUDED.event_type
       WHERE app_webhook_event.applied_at IS NULL AND app_webhook_event.received_at < now() - interval '${STALE_CLAIM}'
     RETURNING event_id`,
    [provider, eventId, eventType],
  );
  return rows.length > 0;
}

export async function markEventApplied(db: Db, provider: string, eventId: string): Promise<void> {
  await db.query(`UPDATE app_webhook_event SET applied_at = now() WHERE provider = $1 AND event_id = $2`, [provider, eventId]);
}

/** Hands an unapplied claim back after a failed attempt, so the provider's retry is handled instead of skipped. */
export async function releaseWebhookEvent(db: Db, provider: string, eventId: string): Promise<void> {
  await db.query(`DELETE FROM app_webhook_event WHERE provider = $1 AND event_id = $2 AND applied_at IS NULL`, [provider, eventId]);
}

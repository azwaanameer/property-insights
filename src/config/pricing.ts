// The one place prices live. Both are proposals (owner decision pending) and include GST.
// Money is integer cents with a currency (spine conventions). The marketing copy builds its dollar strings from this file.

export const CURRENCY = "AUD";

/** One report: one address, readable for `days` days after payment. */
export const ONE_REPORT = { amount_cents: 2400, days: 30 } as const;

/**
 * Pro: monthly, every address while active. `period_days` is how long one paid month keeps access open: a month is at most
 * 31 days and one more day absorbs a late renewal event. A renewal event moves the expiry on again.
 */
export const PRO_MONTHLY = { amount_cents: 9900, period_days: 32 } as const;

export type PlanId = "one" | "pro";

export function planAmountCents(plan: PlanId): number {
  return plan === "one" ? ONE_REPORT.amount_cents : PRO_MONTHLY.amount_cents;
}

/** GST contained in a GST-inclusive price: one eleventh, rounded to the cent. */
export function gstCents(inclusiveCents: number): number {
  return Math.round(inclusiveCents / 11);
}

/** Whole dollars when the price is a whole dollar amount, otherwise dollars and cents. */
export function formatAud(cents: number): string {
  const dollars = cents / 100;
  return "$" + (Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2));
}

// Shared derivations for the suburb layers. Every derived figure is Estimated, and the layer that shows it names the method in the
// figure `note`. Nothing here predicts anything: these describe change that already happened (AD-10).
import type { ResolvedAddress } from "../../contracts/address";

/** A median resting on fewer than this many sales or lettings is shown with the chip Estimated and a "few" note. */
export const THIN_MIN = 10;

/** Round a fraction to four decimals (0.06667 -> 0.0667) so figures do not carry false precision. */
export const roundFraction = (x: number) => Math.round(x * 10_000) / 10_000;

/** Compound annual growth between two medians over `years` years, as a fraction. Null when an endpoint is missing or not positive. */
export function cagr(start: number | null | undefined, end: number | null | undefined, years: number): number | null {
  if (!start || !end || start <= 0 || end <= 0 || years <= 0) return null;
  return roundFraction(Math.pow(end / start, 1 / years) - 1);
}

/** Change between two values as a fraction (0.0667 = +6.67%). */
export function relativeChange(now: number | null | undefined, before: number | null | undefined): number | null {
  if (!now || !before || before <= 0) return null;
  return roundFraction(now / before - 1);
}

/** Gross yield = median weekly rent x 52 / median price, as a fraction. Both inputs in the same currency unit (cents). */
export function grossYield(weeklyRentCents: number | null | undefined, medianPriceCents: number | null | undefined): number | null {
  if (!weeklyRentCents || !medianPriceCents || weeklyRentCents <= 0 || medianPriceCents <= 0) return null;
  return roundFraction((weeklyRentCents * 52) / medianPriceCents);
}

/**
 * Position of `subject` among `values` ranked from highest to lowest: 1 + the number of values strictly higher.
 * `values` includes the subject. Returns null when fewer than two suburbs have a value. A position in a list, never a score.
 */
export function rankAmong(subject: number | null | undefined, values: number[]): { position: number; of: number } | null {
  if (subject === null || subject === undefined || values.length < 2) return null;
  return { position: 1 + values.filter((v) => v > subject).length, of: values.length };
}

/** ISO date n years earlier (quarter ends keep their month and day). */
export function yearsBefore(iso: string, n: number): string {
  return `${Number(iso.slice(0, 4)) - n}${iso.slice(4)}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-03-31" -> "March 2026". */
export function monthYear(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "2026-03-31" -> "March quarter 2026". */
export function quarterLabel(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} quarter ${iso.slice(0, 4)}`;
}

/** 0.0734 -> "7.3%". For sentences inside notes and questions; figures themselves are formatted by the renderer. */
export const percentText = (fraction: number) => `${(Math.abs(fraction) * 100).toFixed(1)}%`;

export const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-AU")}`;

export type Family = "unit" | "house";

/** The kind of dwelling the report is about: a unit when the address is a unit or sits in a building with units, else a house. */
export function dwellingFamily(address: Pick<ResolvedAddress, "match" | "is_multi_unit">): Family {
  return address.match === "unit" || address.is_multi_unit ? "unit" : "house";
}

/** What each family compares against in the rent file. Primary is the size used for gross yield. */
export const FAMILY = {
  unit: { dwelling: "unit", noun: "unit", rent_noun: "flat", bedrooms: [1, 2, 3], primary_bedrooms: 2 },
  house: { dwelling: "house", noun: "house", rent_noun: "house", bedrooms: [2, 3, 4], primary_bedrooms: 3 },
} as const;

export const otherFamily = (f: Family): Family => (f === "unit" ? "house" : "unit");

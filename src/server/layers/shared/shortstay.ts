// The City Retreats CRM's short-stay income method, as the product states it (read-only references: cityretreatscrm src/lib/airdna.comps.ts,
// airdna.parse.ts and income.ts). Pure: no I/O. Money is whole Australian dollars here; the layer turns it into cents.
import type { ShortStayComp, ShortStayEstimate } from "../../vendors/types";

/** A comparable listing worth trusting: a full year of trading and enough reviews to be an established listing (airdna.comps.ts). */
export const MIN_COMP_REVENUE = 20000;
export const MIN_COMP_REVIEWS = 20;
/** At least this many strong comps and they alone are used; fewer and every comp with revenue is used, and the figure says so. */
export const MIN_STRONG_COMPS = 5;
/** The nearest this many comps are used. */
export const MAX_COMPS = 15;
/** The product cutoff: short stay is shown only when the estimated income is at least this many times the home's long-term rent for a year. */
export const CUTOFF_NUMERATOR = 14;
export const CUTOFF_DENOMINATOR = 10;
export const CUTOFF_RATIO = CUTOFF_NUMERATOR / CUTOFF_DENOMINATOR;

export const isStrongComp = (c: ShortStayComp): boolean => c.revenue !== null && c.revenue >= MIN_COMP_REVENUE && (c.reviews ?? 0) >= MIN_COMP_REVIEWS;

/** Linear-interpolated percentile of an ascending-sorted array, rounded to whole dollars (airdna.parse.ts `percentile`). */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

export interface CompSelection {
  /** `strong` when there were at least 5 strong comps; `all` when every comp with revenue was used instead. */
  basis: "strong" | "all";
  strong_count: number;
  /** The nearest up to 15, nearest first. */
  used: ShortStayComp[];
  p25: number | null;
  median: number | null;
  p75: number | null;
}

/** Nearest first; a comp with no distance goes last; ties by id so the order never depends on the vendor's. */
const byDistance = (a: ShortStayComp, b: ShortStayComp) =>
  (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);

export function selectComps(comps: ShortStayComp[]): CompSelection {
  const withRevenue = comps.filter((c) => c.revenue !== null && c.revenue > 0).sort(byDistance);
  const strong = withRevenue.filter(isStrongComp);
  const basis = strong.length >= MIN_STRONG_COMPS ? "strong" : "all";
  const used = (basis === "strong" ? strong : withRevenue).slice(0, MAX_COMPS);
  const revenues = used.map((c) => c.revenue as number).sort((a, b) => a - b);
  return { basis, strong_count: strong.length, used, p25: percentile(revenues, 0.25), median: percentile(revenues, 0.5), p75: percentile(revenues, 0.75) };
}

export type IncomeMethod = "airdna" | "own" | "airdna_fallback";

export interface ChosenIncome {
  method: IncomeMethod;
  annual: number;
  /** The 25th and 75th percentile of the comps used, when there are comps. */
  p25: number | null;
  p75: number | null;
  /** AirDNA's confidence as a word ("High", "Medium", "Low") or null when it gave none or one we do not know. */
  level: string | null;
  selection: CompSelection;
  /** True when the own estimate rests on every comp with revenue because there were fewer than 5 strong ones. */
  few: boolean;
}

/** "high" -> High, "med"/"medium" -> Medium, "low" -> Low; anything else is not a confidence we can name. */
export function confidenceWord(level: string | null): "High" | "Medium" | "Low" | null {
  const l = level?.trim().toLowerCase() ?? "";
  if (l === "high") return "High";
  if (l.startsWith("med")) return "Medium";
  if (l === "low") return "Low";
  return null;
}

/**
 * The CRM's rule (income.ts): AirDNA's own figure when its confidence is High; otherwise our estimate, the median of the nearest 15 strong comps;
 * with no usable comps, AirDNA's figure as a labelled fallback. Null when there is neither.
 */
export function chooseIncome(e: ShortStayEstimate): ChosenIncome | null {
  const selection = selectComps(e.comps);
  const level = confidenceWord(e.confidence_level);
  const air = e.annual_revenue !== null && e.annual_revenue > 0 ? e.annual_revenue : null;
  const range = { p25: selection.p25, p75: selection.p75 };
  if (air !== null && level === "High") return { method: "airdna", annual: air, ...range, level, selection, few: false };
  if (selection.median !== null && selection.used.length > 0) {
    return { method: "own", annual: selection.median, ...range, level, selection, few: selection.basis === "all" };
  }
  if (air !== null) return { method: "airdna_fallback", annual: air, ...range, level, selection, few: false };
  return null;
}

/** Whole-dollar income is at least 1.4 times the weekly rent x 52, compared in whole cents with integers so 1.4 exactly counts. */
export function meetsCutoff(annual_income_cents: number, annual_rent_cents: number): boolean {
  return annual_income_cents * CUTOFF_DENOMINATOR >= annual_rent_cents * CUTOFF_NUMERATOR;
}

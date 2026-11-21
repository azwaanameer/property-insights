// Reading helpers over the rows the repos return. Pure functions: no SQL here.
import type { PriceRow, RentRow } from "../../repos/series";
import { cagr, FAMILY, grossYield, THIN_MIN, yearsBefore, type Family } from "./derive";

export const isThinPrice = (r: Pick<PriceRow, "low_count" | "carried_forward" | "sales_count">) => r.low_count || r.carried_forward || (r.sales_count !== null && r.sales_count < THIN_MIN);
/** The note for a median that is thin or carried forward; undefined when it is neither. */
export function priceThinNote(r: PriceRow, noun: string): string | undefined {
  if (r.carried_forward) return `No ${noun} sales in this period: the Valuer-General carried an earlier median forward.`;
  if (isThinPrice(r)) return `Few sales: this median rests on ${r.sales_count ?? "fewer than 10"} sales, so treat it as indicative.`;
  return undefined;
}

export const isThinRent = (r: Pick<RentRow, "low_count" | "lettings_count">) => r.low_count || (r.lettings_count !== null && r.lettings_count < THIN_MIN);

export function quarterRows(rows: PriceRow[], sal: string, family: Family): PriceRow[] {
  return rows.filter((r) => r.sal_code === sal && r.dwelling_type === family && r.period_type === "quarter").sort((a, b) => a.period.localeCompare(b.period));
}

export function annualRows(rows: PriceRow[], sal: string, family: Family): PriceRow[] {
  return rows.filter((r) => r.sal_code === sal && r.dwelling_type === family && r.period_type === "year").sort((a, b) => a.period.localeCompare(b.period));
}

/** The newest quarter the suburb has a median for. */
export function latestQuarter(rows: PriceRow[], sal: string, family: Family): PriceRow | null {
  return quarterRows(rows, sal, family).at(-1) ?? null;
}

/** The same quarter a year earlier, if the source gave one. */
export function priorYearQuarter(rows: PriceRow[], latest: PriceRow): PriceRow | null {
  const want = yearsBefore(latest.period, 1);
  return rows.find((r) => r.sal_code === latest.sal_code && r.dwelling_type === latest.dwelling_type && r.period_type === "quarter" && r.period === want) ?? null;
}

export function annualFor(rows: PriceRow[], sal: string, family: Family, year: number): PriceRow | null {
  return rows.find((r) => r.sal_code === sal && r.dwelling_type === family && r.period_type === "year" && r.period.startsWith(`${year}-`)) ?? null;
}

export function rentAt(rows: RentRow[], sal: string, family: Family, bedrooms: number, period: string): RentRow | null {
  return rows.find((r) => r.sal_code === sal && r.dwelling_type === family && r.bedrooms === bedrooms && r.period === period) ?? null;
}

/** Quarter ends a layer needs from the rent file: the latest and a year earlier (L07 builds its own longer list). */
export function rentPeriods(asOf: string): { latest: string; yearAgo: string } {
  return { latest: asOf, yearAgo: yearsBefore(asOf, 1) };
}

/** The year the annual series ends: the latest calendar year the suburb has a median for. */
export function latestYear(rows: PriceRow[], sal: string, family: Family): number | null {
  const last = annualRows(rows, sal, family).at(-1);
  return last ? Number(last.period.slice(0, 4)) : null;
}

/**
 * One suburb's headline numbers for the family, used by the compare layer for the subject and each neighbour.
 * Everything is derived from the same rows the single-suburb layers read, so the numbers agree.
 */
export interface Snapshot {
  sal_code: string;
  price_cents: number | null;
  price_thin: boolean;
  sales_count: number | null;
  rent_weekly_cents: number | null;
  rent_thin: boolean;
  lettings_count: number | null;
  gross_yield: number | null;
  price_cagr_5y: number | null;
}

export function snapshot(sal: string, family: Family, prices: PriceRow[], rents: RentRow[], rentLatest: string): Snapshot {
  const q = latestQuarter(prices, sal, family);
  const rent = rentAt(rents, sal, family, FAMILY[family].primary_bedrooms, rentLatest);
  const year = latestYear(prices, sal, family);
  const end = year === null ? null : annualFor(prices, sal, family, year);
  const start = year === null ? null : annualFor(prices, sal, family, year - 5);
  return {
    sal_code: sal,
    price_cents: q?.median_cents ?? null,
    price_thin: q ? isThinPrice(q) : false,
    sales_count: q?.sales_count ?? null,
    rent_weekly_cents: rent?.median_weekly_rent_cents ?? null,
    rent_thin: rent ? isThinRent(rent) : false,
    lettings_count: rent?.lettings_count ?? null,
    gross_yield: grossYield(rent?.median_weekly_rent_cents, q?.median_cents),
    price_cagr_5y: cagr(start?.median_cents, end?.median_cents, 5),
  };
}

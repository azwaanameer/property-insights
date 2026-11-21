// SQL only. Price and rent series, read through the current dataset pointer of their source (AD-7).
// Returns null when the source has no published dataset, so a layer can say so instead of showing an empty table.
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export type DwellingType = "house" | "unit";

export interface PriceRow {
  sal_code: string;
  dwelling_type: DwellingType;
  period_type: "year" | "quarter";
  /** Last day of the period, ISO date. */
  period: string;
  median_cents: number;
  sales_count: number | null;
  /** The source flags the median as resting on fewer than 10 sales. */
  low_count: boolean;
  /** No sales in the period; the source carried an earlier median forward. */
  carried_forward: boolean;
  /** The locality name as the source wrote it. */
  source_name: string | null;
  sal_match_type: string;
}

export interface RentRow {
  sal_code: string;
  dwelling_type: DwellingType | "all";
  bedrooms: number;
  /** Last day of the quarter, ISO date. The median covers leases that began in the 12 months to this date. */
  period: string;
  median_weekly_rent_cents: number;
  lettings_count: number | null;
  low_count: boolean;
  source_name: string | null;
  sal_match_type: string;
}

export interface Versioned<T> {
  /** as_of of the dataset version the rows came from. */
  as_of: string;
  rows: T[];
}

export const VGV_SOURCE = "vgv_medians";
export const RENT_SOURCE = "homes_victoria_rents";

/** All price rows (annual and quarterly, both dwelling types) for the given suburbs. */
export async function listPrices(db: Db, salCodes: string[]): Promise<Versioned<PriceRow> | null> {
  const ds = await currentDataset(db, VGV_SOURCE);
  if (!ds || salCodes.length === 0) return ds ? { as_of: ds.as_of, rows: [] } : null;
  const rows = await db.query<PriceRow>(
    `SELECT p.sal_code, p.dwelling_type, p.period_type, to_char(p.period, 'YYYY-MM-DD') AS period,
            p.median_cents::float8 AS median_cents, p.sales_count, p.low_count, p.carried_forward,
            p.source_name, p.sal_match_type
     FROM series_price p
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
     WHERE p.sal_code = ANY($2::text[]) AND p.median_cents IS NOT NULL
     ORDER BY p.sal_code, p.dwelling_type, p.period_type, p.period`,
    [VGV_SOURCE, salCodes],
  );
  return { as_of: ds.as_of, rows };
}

/**
 * Rent rows for the given suburbs, limited to the given quarter ends (a moving annual median exists for every quarter, so a
 * layer asks for the few it needs). Omit `periods` for every stored quarter.
 */
export async function listRents(db: Db, salCodes: string[], periods?: string[]): Promise<Versioned<RentRow> | null> {
  const ds = await currentDataset(db, RENT_SOURCE);
  if (!ds || salCodes.length === 0) return ds ? { as_of: ds.as_of, rows: [] } : null;
  const rows = await db.query<RentRow>(
    `SELECT r.sal_code, r.dwelling_type, r.bedrooms::int AS bedrooms, to_char(r.period, 'YYYY-MM-DD') AS period,
            r.median_weekly_rent_cents::float8 AS median_weekly_rent_cents, r.lettings_count, r.low_count,
            r.source_name, r.sal_match_type
     FROM series_rent r
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = r.dataset_version_id
     WHERE r.sal_code = ANY($2::text[]) AND r.median_weekly_rent_cents IS NOT NULL
       AND ($3::text[] IS NULL OR to_char(r.period, 'YYYY-MM-DD') = ANY($3::text[]))
     ORDER BY r.sal_code, r.dwelling_type, r.bedrooms, r.period`,
    [RENT_SOURCE, salCodes, periods ?? null],
  );
  return { as_of: ds.as_of, rows };
}

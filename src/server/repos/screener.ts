// SQL only. The inputs of a yield screen: for each suburb the latest quarter's median price and the latest moving-annual median rent of the
// given size, side by side, from the Valuer-General and Homes Victoria datasets through their current pointers (AD-7). Pass a list of
// suburb codes to screen those, or null to screen every suburb in the state. Only suburbs that have both a price and a rent come back.
import type { Db } from "../db";
import { currentDataset } from "./datasets";
import { RENT_SOURCE, VGV_SOURCE, type DwellingType } from "./series";

export interface YieldInput {
  sal_code: string;
  price_cents: number;
  price_period: string;
  sales_count: number | null;
  price_low_count: boolean;
  price_carried_forward: boolean;
  rent_weekly_cents: number;
  lettings_count: number | null;
  rent_low_count: boolean;
  /** The Homes Victoria area name as the file wrote it. */
  rent_area: string | null;
}

export async function listYieldInputs(
  db: Db,
  salCodes: string[] | null,
  dwelling: DwellingType,
  bedrooms: number,
): Promise<{ prices_as_of: string; rents_as_of: string; rows: YieldInput[] } | null> {
  const [prices, rents] = await Promise.all([currentDataset(db, VGV_SOURCE), currentDataset(db, RENT_SOURCE)]);
  if (!prices || !rents) return null;
  if (salCodes !== null && salCodes.length === 0) return { prices_as_of: prices.as_of, rents_as_of: rents.as_of, rows: [] };
  const rows = await db.query<YieldInput>(
    `WITH price AS (
       SELECT DISTINCT ON (p.sal_code) p.sal_code, p.median_cents::float8 AS price_cents, to_char(p.period, 'YYYY-MM-DD') AS price_period,
              p.sales_count, p.low_count AS price_low_count, p.carried_forward AS price_carried_forward
       FROM series_price p
       JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
       WHERE p.dwelling_type = $3 AND p.period_type = 'quarter' AND p.median_cents IS NOT NULL
         AND ($5::text[] IS NULL OR p.sal_code = ANY($5::text[]))
       ORDER BY p.sal_code, p.period DESC),
     rent AS (
       SELECT r.sal_code, r.median_weekly_rent_cents::float8 AS rent_weekly_cents, r.lettings_count, r.low_count AS rent_low_count, r.source_name AS rent_area
       FROM series_rent r
       JOIN src_dataset_current c ON c.source_id = $2 AND c.dataset_version_id = r.dataset_version_id
       JOIN src_dataset_version v ON v.dataset_version_id = c.dataset_version_id
       WHERE r.dwelling_type = $3 AND r.bedrooms = $4 AND r.period = v.as_of AND r.median_weekly_rent_cents IS NOT NULL
         AND ($5::text[] IS NULL OR r.sal_code = ANY($5::text[])))
     SELECT p.sal_code, p.price_cents, p.price_period, p.sales_count, p.price_low_count, p.price_carried_forward,
            r.rent_weekly_cents, r.lettings_count, r.rent_low_count, r.rent_area
     FROM price p JOIN rent r ON r.sal_code = p.sal_code
     ORDER BY p.sal_code`,
    [VGV_SOURCE, RENT_SOURCE, dwelling, bedrooms, salCodes],
  );
  return { prices_as_of: prices.as_of, rents_as_of: rents.as_of, rows };
}

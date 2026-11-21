// SQL only. Recent sales as reported on realestate.com.au listings (fact_reported_sale), read through the current dataset pointer of the
// source rp_sold_listings (AD-7). Every row is a listing-site record, never a Victorian title record. Null when no dataset is published.
// No agent, agency or phone column exists, so none can be read.
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export const SALES_SOURCE = "rp_sold_listings";

/** Dwelling types the report treats as apartment-like (sales in a building) and as a house (sales on a street). The build plane holds the same lists. */
export const BUILDING_TYPES = ["apartment", "unit", "flat", "studio"] as const;
export const STREET_TYPES = ["house", "townhouse", "villa", "duplex/semi-detached"] as const;

export interface SalesDataset {
  /** The harvest date. */
  as_of: string;
  retrieved_at: string;
  row_count: number;
  /** The suburbs the sales cover: ABS SAL code and the name the harvest searched. */
  suburbs: { sal_code: string; name: string }[];
  window_from: string;
  window_to: string;
}

/** One sale, as reported. `url` is the listing's path on realestate.com.au. */
export interface ReportedSale {
  listing_id: string;
  address_text: string;
  unit_no: string | null;
  street_no: string | null;
  suburb: string;
  postcode: string;
  price_aud: number;
  bed: number | null;
  bath: number | null;
  park: number | null;
  property_type: string;
  sold_on: string;
  url: string;
}

const COLUMNS = `s.listing_id, s.address_text, s.unit_no, s.street_no, s.suburb, s.postcode, s.price_aud::int AS price_aud,
  s.bed::int AS bed, s.bath::int AS bath, s.park::int AS park, s.property_type, to_char(s.sold_on, 'YYYY-MM-DD') AS sold_on, s.url`;

const CURRENT = `JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = s.dataset_version_id`;

/** The current dataset with the suburbs and the span of sale dates it covers, or null when none is published. */
export async function getSalesDataset(db: Db): Promise<SalesDataset | null> {
  const ds = await currentDataset(db, SALES_SOURCE);
  if (!ds) return null;
  const suburbs = await db.query<{ sal_code: string; name: string }>(
    `SELECT s.sal_code, min(s.harvest_suburb) AS name FROM fact_reported_sale s ${CURRENT}
     WHERE s.sal_code IS NOT NULL GROUP BY s.sal_code ORDER BY min(s.harvest_suburb)`,
    [SALES_SOURCE],
  );
  const span = await db.query<{ a: string | null; b: string | null }>(
    `SELECT to_char(min(s.sold_on), 'YYYY-MM-DD') AS a, to_char(max(s.sold_on), 'YYYY-MM-DD') AS b FROM fact_reported_sale s ${CURRENT}`,
    [SALES_SOURCE],
  );
  if (suburbs.length === 0 || !span[0]?.a || !span[0]?.b) return null;
  return { as_of: ds.as_of, retrieved_at: ds.retrieved_at, row_count: ds.row_count, suburbs, window_from: span[0].a, window_to: span[0].b };
}

/** Sales matched to one G-NAF building (the pipeline stored the match), most recent first, with the count of all of them. */
export async function listBuildingSales(db: Db, buildingId: string, types: readonly string[], limit: number): Promise<{ total: number; rows: ReportedSale[] }> {
  const where = `s.building_id = $2 AND s.property_type = ANY($3::text[])`;
  const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM fact_reported_sale s ${CURRENT} WHERE ${where}`, [SALES_SOURCE, buildingId, [...types]]);
  const rows = await db.query<ReportedSale>(
    `SELECT ${COLUMNS} FROM fact_reported_sale s ${CURRENT} WHERE ${where} ORDER BY s.sold_on DESC, s.listing_id LIMIT $4`,
    [SALES_SOURCE, buildingId, [...types], limit],
  );
  return { total: count[0]?.n ?? 0, rows };
}

/** Sales on one street (street key, suburb key and postcode all equal), most recent first, with the count of all of them. */
export async function listStreetSales(
  db: Db,
  street: { street_key: string; suburb_key: string; postcode: string },
  types: readonly string[],
  limit: number,
): Promise<{ total: number; rows: ReportedSale[] }> {
  const where = `s.street_key = $2 AND s.suburb_key = $3 AND s.postcode = $4 AND s.property_type = ANY($5::text[])`;
  const args = [SALES_SOURCE, street.street_key, street.suburb_key, street.postcode, [...types]];
  const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM fact_reported_sale s ${CURRENT} WHERE ${where}`, args);
  const rows = await db.query<ReportedSale>(
    `SELECT ${COLUMNS} FROM fact_reported_sale s ${CURRENT} WHERE ${where} ORDER BY s.sold_on DESC, s.listing_id LIMIT $6`,
    [...args, limit],
  );
  return { total: count[0]?.n ?? 0, rows };
}

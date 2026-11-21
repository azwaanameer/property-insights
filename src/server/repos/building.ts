// SQL only. Building facts: the G-NAF unit count (through the current G-NAF pointer) and the City of Melbourne record matched to a
// G-NAF building (through the current com_open_data pointer). The match was made by the pipeline and its type is stored (AD-6, AD-7).
import type { Db } from "../db";
import { boxAround, haversineMetres } from "../geo";
import { currentDataset } from "./datasets";

export const COM_SOURCE = "com_open_data";

export type ComMatchType = "exact_street_number" | "nearest_within_30m_same_street";

export interface ComBuilding {
  property_id: string;
  building_name: string | null;
  street_address: string;
  clue_small_area: string | null;
  construction_year: number | null;
  refurbished_year: number | null;
  floors_above: number | null;
  predominant_use: string | null;
  dwelling_count: number | null;
  census_year: number;
  match_type: ComMatchType;
}

/** The G-NAF unit count of a building (ref_building) and its name. Null when the address has no building row (no units under it). */
export async function getGnafBuilding(db: Db, buildingId: string): Promise<{ as_of: string; unit_count: number; building_name: string | null } | null> {
  const ds = await currentDataset(db, "gnaf");
  if (!ds) return null;
  const rows = await db.query<{ unit_count: number; building_name: string | null }>(
    `SELECT b.unit_count::int AS unit_count, b.building_name
     FROM ref_building b
     JOIN src_dataset_current c ON c.source_id = 'gnaf' AND c.dataset_version_id = b.dataset_version_id
     WHERE b.building_id = $1`,
    [buildingId],
  );
  return rows[0] ? { as_of: ds.as_of, ...rows[0] } : null;
}

/** The City of Melbourne record matched to this G-NAF building, or null when none was matched. Null `dataset` means no dataset is published. */
export async function getComBuilding(db: Db, gnafBuildingId: string): Promise<{ as_of: string; building: ComBuilding | null } | null> {
  const ds = await currentDataset(db, COM_SOURCE);
  if (!ds) return null;
  const rows = await db.query<ComBuilding>(
    `SELECT b.property_id, b.building_name, b.street_address, b.clue_small_area, b.construction_year, b.refurbished_year,
            b.floors_above, b.predominant_use, b.dwelling_count, b.census_year, m.match_type
     FROM ref_com_building_match m
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = m.dataset_version_id
     JOIN ref_com_building b ON b.dataset_version_id = m.dataset_version_id AND b.property_id = m.property_id
     WHERE m.gnaf_building_id = $2`,
    [COM_SOURCE, gnafBuildingId],
  );
  return { as_of: ds.as_of, building: rows[0] ?? null };
}

/** How close a City of Melbourne building must be for an address to count as inside the area the council data covers. */
export const COVERAGE_RADIUS_M = 400;

/**
 * Whether the council data covers this point: some building in the current dataset lies within COVERAGE_RADIUS_M of it (a bounding-box
 * prefilter, then straight-line distance). A box around every record would take in neighbouring councils, so coverage is judged by the data.
 */
export async function isComCovered(db: Db, lat: number, lon: number, radiusM = COVERAGE_RADIUS_M): Promise<boolean> {
  const box = boxAround(lat, lon, radiusM);
  const rows = await db.query<{ lat: number; lon: number }>(
    `SELECT b.lat::float8 AS lat, b.lon::float8 AS lon
     FROM ref_com_building b
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = b.dataset_version_id
     WHERE b.lat BETWEEN $2 AND $3 AND b.lon BETWEEN $4 AND $5`,
    [COM_SOURCE, box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return rows.some((r) => haversineMetres(lat, lon, r.lat, r.lon) <= radiusM);
}

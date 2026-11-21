// SQL only. School zones and school locations, read through the current dataset pointers of their two sources (AD-7). The zone lookup is
// a bounding-box prefilter in SQL; the point-in-polygon test is in the layer (src/server/geo.ts). Nothing here reads or
// returns a school quality figure, and none is stored.
import type { Db } from "../db";
import { boxAround } from "../geo";
import { currentDataset } from "./datasets";
import type { Versioned } from "./series";

export const ZONES_SOURCE = "vic_school_zones_2026";
export const LOCATIONS_SOURCE = "vic_school_locations_2026";

export type Sector = "Government" | "Catholic" | "Independent";

export interface ZoneRow {
  zone_id: string;
  school_name: string;
  campus_name: string | null;
  school_key: string | null;
  level: "primary" | "secondary";
  year_levels: string;
  boundary_year: number;
  /** GeoJSON polygon rings, [lon, lat] pairs, outer ring first. */
  rings: number[][][];
}

export interface SchoolRow {
  school_key: string;
  name: string;
  sector: Sector;
  school_type: string;
  address: string;
  locality: string;
  lat: number;
  lon: number;
}

interface RawZone extends Omit<ZoneRow, "rings"> {
  rings: unknown;
}

function ringsOf(v: unknown): number[][][] {
  const value = typeof v === "string" ? safeParse(v) : v;
  return Array.isArray(value) ? (value as number[][][]) : [];
}
function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/**
 * Zones whose bounding box contains the point. The caller runs the exact polygon test. `years` are the boundary years of every zone in the
 * current dataset (normally one), so the report states the year the data says. Null when no zone dataset is published.
 */
export async function listZoneCandidates(db: Db, lat: number, lon: number): Promise<(Versioned<ZoneRow> & { years: number[] }) | null> {
  const ds = await currentDataset(db, ZONES_SOURCE);
  if (!ds) return null;
  const years = await db.query<{ y: number }>(
    `SELECT DISTINCT z.boundary_year::int AS y FROM ref_school_zone z
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = z.dataset_version_id ORDER BY 1`,
    [ZONES_SOURCE],
  );
  const rows = await db.query<RawZone>(
    `SELECT z.zone_id, z.school_name, z.campus_name, z.school_key, z.level, z.year_levels, z.boundary_year::int AS boundary_year, z.rings
     FROM ref_school_zone z
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = z.dataset_version_id
     WHERE z.min_lat <= $2 AND z.max_lat >= $2 AND z.min_lon <= $3 AND z.max_lon >= $3
     ORDER BY z.level DESC, z.zone_id`,
    [ZONES_SOURCE, lat, lon],
  );
  return { as_of: ds.as_of, years: years.map((r) => r.y), rows: rows.map((r) => ({ ...r, rings: ringsOf(r.rings) })) };
}

/** Which of these school keys have at least one zone in the current zones dataset (a school can be near and have no zone at all). */
export async function listZonedSchoolKeys(db: Db, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db.query<{ school_key: string }>(
    `SELECT DISTINCT z.school_key FROM ref_school_zone z
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = z.dataset_version_id
     WHERE z.school_key = ANY($2::text[])`,
    [ZONES_SOURCE, keys],
  );
  return new Set(rows.map((r) => r.school_key));
}

/** Schools by key from the current locations dataset (a zone school's location row, when the zone could be joined to one). */
export async function listSchoolsByKey(db: Db, keys: string[]): Promise<Versioned<SchoolRow> | null> {
  const ds = await currentDataset(db, LOCATIONS_SOURCE);
  if (!ds) return null;
  if (keys.length === 0) return { as_of: ds.as_of, rows: [] };
  const rows = await db.query<SchoolRow>(
    `SELECT s.school_key, s.name, s.sector, s.school_type, s.address, s.locality, s.lat::float8 AS lat, s.lon::float8 AS lon
     FROM ref_school s
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = s.dataset_version_id
     WHERE s.school_key = ANY($2::text[])`,
    [LOCATIONS_SOURCE, keys],
  );
  return { as_of: ds.as_of, rows };
}

/** Schools inside the box around the point, of the given sectors. The caller trims to the circle and sorts by distance. */
export async function listSchoolsInBox(db: Db, lat: number, lon: number, radiusM: number, sectors: Sector[]): Promise<Versioned<SchoolRow> | null> {
  const ds = await currentDataset(db, LOCATIONS_SOURCE);
  if (!ds) return null;
  const box = boxAround(lat, lon, radiusM);
  const rows = await db.query<SchoolRow>(
    `SELECT s.school_key, s.name, s.sector, s.school_type, s.address, s.locality, s.lat::float8 AS lat, s.lon::float8 AS lon
     FROM ref_school s
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = s.dataset_version_id
     WHERE s.sector = ANY($2::text[]) AND s.lat BETWEEN $3 AND $4 AND s.lon BETWEEN $5 AND $6
     ORDER BY s.school_key`,
    [LOCATIONS_SOURCE, sectors, box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return { as_of: ds.as_of, rows };
}

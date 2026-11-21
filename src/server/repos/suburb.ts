// SQL only. Suburb names, markers and adjacency, read through the current dataset pointer of their source (AD-7).
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export const SUBURB_SOURCE = "abs_asgs_2021";
export const CENSUS_SOURCE = "abs_census_2021";
export const SEIFA_SOURCE = "abs_seifa_2021";
export const NEIGHBOUR_SOURCE = "gnaf_neighbours";

export interface Neighbour {
  sal_code: string;
  name: string;
  sal_match_type: string;
  neighbour_match_type: string;
}

export interface MarkerValue {
  value: number;
  /** ABS quality flag, for example "q" on a SEIFA index for a small population. */
  flag: string | null;
}

export type MarkerMap = Map<string, Record<string, MarkerValue>>;

/**
 * Suburbs next to `salCode`, with their names from the current suburb list, first `limit` by name. `total` is the true number of
 * adjacent suburbs, so a caller that truncates can say so. Null when no neighbour dataset is published.
 */
export async function listNeighbours(db: Db, salCode: string, limit = 1000): Promise<{ as_of: string; rows: Neighbour[]; total: number } | null> {
  const ds = await currentDataset(db, NEIGHBOUR_SOURCE);
  if (!ds) return null;
  const found = await db.query<Neighbour & { total: number }>(
    `SELECT n.neighbour_sal_code AS sal_code, s.name, n.sal_match_type, n.neighbour_match_type, (count(*) OVER ())::int AS total
     FROM ref_suburb_neighbour n
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = n.dataset_version_id
     JOIN src_dataset_current sc ON sc.source_id = $2
     JOIN ref_suburb s ON s.dataset_version_id = sc.dataset_version_id AND s.sal_code = n.neighbour_sal_code
     WHERE n.sal_code = $3
     ORDER BY s.name, n.neighbour_sal_code
     LIMIT $4`,
    [NEIGHBOUR_SOURCE, SUBURB_SOURCE, salCode, limit],
  );
  const rows: Neighbour[] = found.map(({ total: _total, ...n }) => n);
  return { as_of: ds.as_of, rows, total: found[0]?.total ?? 0 };
}

/** Markers for the given suburbs from one source (Census or SEIFA). Null when that source has no published dataset. */
export async function listMarkers(db: Db, sourceId: string, salCodes: string[], keys: string[]): Promise<{ as_of: string; markers: MarkerMap } | null> {
  const ds = await currentDataset(db, sourceId);
  if (!ds) return null;
  const markers: MarkerMap = new Map();
  if (salCodes.length === 0) return { as_of: ds.as_of, markers };
  const rows = await db.query<{ sal_code: string; marker_key: string; value: number; flag: string | null }>(
    `SELECT m.sal_code, m.marker_key, m.value::float8 AS value, m.flag
     FROM fact_suburb_marker m
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = m.dataset_version_id
     WHERE m.sal_code = ANY($2::text[]) AND m.marker_key = ANY($3::text[]) AND m.value IS NOT NULL`,
    [sourceId, salCodes, keys],
  );
  for (const r of rows) {
    const cur = markers.get(r.sal_code) ?? {};
    cur[r.marker_key] = { value: r.value, flag: r.flag };
    markers.set(r.sal_code, cur);
  }
  return { as_of: ds.as_of, markers };
}

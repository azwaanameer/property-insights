// SQL only. Public transport stops from the PTV GTFS feed, read through the current dataset pointer (AD-7). The lookup is a bounding-box
// prefilter; the caller works out straight-line distances (src/server/geo.ts). Null when no stop dataset is published.
import type { Db } from "../db";
import { boxAround } from "../geo";
import { currentDataset } from "./datasets";
import type { Versioned } from "./series";

export const GTFS_SOURCE = "gtfs_vic";

export type TransitMode = "train" | "tram" | "bus" | "coach";
export const TRANSIT_MODES: TransitMode[] = ["train", "tram", "bus", "coach"];

export interface StopRow {
  stop_key: string;
  name: string;
  mode: TransitMode;
  lat: number;
  lon: number;
  routes: string[];
}

interface RawStop extends Omit<StopRow, "routes"> {
  routes: unknown;
}

/** jsonb comes back parsed from every adapter, but a string is tolerated. Anything that is not a list of strings is an empty list. */
function routeList(v: unknown): string[] {
  const value = typeof v === "string" ? safeParse(v) : v;
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}
function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/** Stops of one mode inside the box that contains a circle of `radiusM` metres. The caller trims to the circle. */
export async function listStopsInBox(db: Db, mode: TransitMode, lat: number, lon: number, radiusM: number): Promise<Versioned<StopRow> | null> {
  const ds = await currentDataset(db, GTFS_SOURCE);
  if (!ds) return null;
  const box = boxAround(lat, lon, radiusM);
  const rows = await db.query<RawStop>(
    `SELECT s.stop_key, s.name, s.mode, s.lat::float8 AS lat, s.lon::float8 AS lon, s.routes
     FROM ref_transit_stop s
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = s.dataset_version_id
     WHERE s.mode = $2 AND s.lat BETWEEN $3 AND $4 AND s.lon BETWEEN $5 AND $6
     ORDER BY s.stop_key`,
    [GTFS_SOURCE, mode, box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return { as_of: ds.as_of, rows: rows.map((r) => ({ ...r, routes: routeList(r.routes) })) };
}

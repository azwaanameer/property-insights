// SQL only. The City of Melbourne development activity monitor, read through the current com_open_data pointer (AD-7). The lookup is a
// bounding-box prefilter; the caller trims to the circle with straight-line distances.
import type { Db } from "../db";
import { boxAround } from "../geo";
import { COM_SOURCE } from "./building";
import { currentDataset } from "./datasets";
import type { Versioned } from "./series";

export type SupplyStatus = "COMPLETED" | "APPROVED" | "UNDER CONSTRUCTION" | "APPLIED";

export interface SupplyProject {
  development_key: string;
  status: SupplyStatus;
  year_completed: number | null;
  street_address: string;
  clue_small_area: string | null;
  lat: number;
  lon: number;
  floors_above: number | null;
  resi_dwellings: number;
  town_planning_application: string | null;
}

/** Developments inside the box around the point. Null when no City of Melbourne dataset is published. */
export async function listProjectsInBox(db: Db, lat: number, lon: number, radiusM: number): Promise<Versioned<SupplyProject> | null> {
  const ds = await currentDataset(db, COM_SOURCE);
  if (!ds) return null;
  const box = boxAround(lat, lon, radiusM);
  const rows = await db.query<SupplyProject>(
    `SELECT p.development_key, p.status, p.year_completed, p.street_address, p.clue_small_area, p.lat::float8 AS lat, p.lon::float8 AS lon,
            p.floors_above, p.resi_dwellings::int AS resi_dwellings, p.town_planning_application
     FROM fact_supply_project p
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
     WHERE p.lat BETWEEN $2 AND $3 AND p.lon BETWEEN $4 AND $5
     ORDER BY p.development_key`,
    [COM_SOURCE, box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return { as_of: ds.as_of, rows };
}

// SQL only. OpenStreetMap places (shops, cafes, parks, medical places, gyms, libraries) from the loaded Victorian extract, read through the
// current dataset pointer (AD-7). The lookup is a bounding-box prefilter on the (lat, lon) index; the caller works out straight-line distances
// (src/server/geo.ts). Null when no places dataset is published. Data is © OpenStreetMap contributors (ODbL 1.0).
import type { Db } from "../db";
import { boxAround } from "../geo";
import { currentDataset } from "./datasets";
import type { Versioned } from "./series";

export const PLACES_SOURCE = "openstreetmap";

export const PLACE_CATEGORIES = ["groceries", "food", "parks", "medical", "fitness", "library"] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** One place with one point. `name` is null when the element has no name tag. */
export interface PlaceRow {
  osm_id: string;
  category: PlaceCategory;
  name: string | null;
  lat: number;
  lon: number;
}

/** Places of every category inside the box that contains a circle of `radiusM` metres. The caller trims to the circle. */
export async function listPlacesInBox(db: Db, lat: number, lon: number, radiusM: number): Promise<Versioned<PlaceRow> | null> {
  const ds = await currentDataset(db, PLACES_SOURCE);
  if (!ds) return null;
  const box = boxAround(lat, lon, radiusM);
  const rows = await db.query<PlaceRow>(
    `SELECT p.osm_id, p.category, p.name, p.lat::float8 AS lat, p.lon::float8 AS lon
     FROM ref_place p
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
     WHERE p.lat BETWEEN $2 AND $3 AND p.lon BETWEEN $4 AND $5
     ORDER BY p.osm_id`,
    [PLACES_SOURCE, box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return { as_of: ds.as_of, rows };
}

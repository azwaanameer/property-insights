// Test-only: put exact places into ref_place as the current openstreetmap dataset, so a layer test controls what is near the address.
// (createSuburbDataTestDb already loads the committed OpenStreetMap excerpt through the real extractor and loader; this replaces it.)
import type { Db } from "../db";
import { PLACES_SOURCE, type PlaceRow } from "../repos/place";

export function osmPlace(over: Partial<PlaceRow> & { osm_id: string }): PlaceRow {
  return { category: "food", name: "Some Place", lat: -37.8, lon: 144.95, ...over };
}

/** Publish `places` as a new version of the places dataset (replacing the current one). */
export async function setPlaces(db: Db, places: PlaceRow[], as_of = "2026-11-20"): Promise<string> {
  const [v] = await db.query<{ id: string }>(
    `INSERT INTO src_dataset_version (source_id, retrieved_at, file_sha256, row_count, licence_snapshot, as_of, states, status)
     VALUES ($1, now(), NULL, $2, 'ODbL 1.0', $3, ARRAY['VIC'], 'published') RETURNING dataset_version_id::text AS id`,
    [PLACES_SOURCE, places.length, as_of],
  );
  for (const p of places) {
    await db.query("INSERT INTO ref_place (dataset_version_id, osm_id, category, name, lat, lon) VALUES ($1, $2, $3, $4, $5, $6)", [v.id, p.osm_id, p.category, p.name, p.lat, p.lon]);
  }
  await db.query(
    `INSERT INTO src_dataset_current (source_id, dataset_version_id, published_at) VALUES ($1, $2, now())
     ON CONFLICT (source_id) DO UPDATE SET dataset_version_id = EXCLUDED.dataset_version_id, published_at = EXCLUDED.published_at`,
    [PLACES_SOURCE, v.id],
  );
  return v.id;
}

/** Remove the current places pointer, as if no places dataset had ever been published. */
export async function clearPlaces(db: Db): Promise<void> {
  await db.query("DELETE FROM src_dataset_current WHERE source_id = $1", [PLACES_SOURCE]);
}

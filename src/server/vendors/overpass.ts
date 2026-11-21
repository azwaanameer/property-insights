// OpenStreetMap places through the Overpass API. Data is © OpenStreetMap contributors (ODbL 1.0): every figure built from it carries that credit.
// Nothing here rates, reviews or scores a place: it keeps the kind, the name tag if any, and the point.
import type { Db } from "../db";
import { cacheKey, cached, fetchJson, snapPoint, VendorError, type FetchFn } from "./cache";
import type { OsmPlace, PlaceCategoryKey, PlacesData, VendorResult } from "./types";

export const OVERPASS_TTL_DAYS = 30;
/** The layer counts places within 800 m; the search is 900 m around the snapped point, which still covers 800 m around the address. */
export const OVERPASS_RADIUS_M = 900;
/** Overpass is asked for this many elements at most. Reaching it means counts may be understated. */
export const OVERPASS_LIMIT = 400;
const ENDPOINT = "https://overpass-api.de/api/interpreter";

export function overpassQuery(lat: number, lon: number): string {
  const around = `(around:${OVERPASS_RADIUS_M},${lat},${lon})`;
  return (
    `[out:json][timeout:20];(` +
    `nwr${around}[shop~"^(supermarket|convenience|greengrocer|bakery)$"];` +
    `nwr${around}[amenity~"^(cafe|restaurant|pharmacy|doctors|clinic|hospital|library|gym)$"];` +
    `nwr${around}[leisure~"^(park|fitness_centre|playground)$"];` +
    `);out center tags ${OVERPASS_LIMIT};`
  );
}

/** The one category an element belongs to, by its tags. Order matters only for an element tagged with more than one (it counts once). */
export function categoryOf(tags: Record<string, unknown>): PlaceCategoryKey | null {
  const shop = tags.shop;
  const amenity = tags.amenity;
  const leisure = tags.leisure;
  if (shop === "supermarket" || shop === "convenience" || shop === "greengrocer" || shop === "bakery") return "groceries";
  if (amenity === "cafe" || amenity === "restaurant") return "food";
  if (leisure === "park" || leisure === "playground") return "parks";
  if (amenity === "pharmacy" || amenity === "doctors" || amenity === "clinic" || amenity === "hospital") return "medical";
  if (amenity === "gym" || leisure === "fitness_centre") return "fitness";
  if (amenity === "library") return "library";
  return null;
}

/** Throws if the body is not an Overpass answer. A way or relation takes its point from `center`. */
export function parseOverpass(body: unknown): PlacesData {
  const elements = (body as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) throw new VendorError("unexpected response shape");
  const seen = new Set<string>();
  const places: OsmPlace[] = [];
  for (const raw of elements) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, any>;
    const tags = typeof e.tags === "object" && e.tags !== null ? e.tags : {};
    const category = categoryOf(tags);
    const lat = typeof e.lat === "number" ? e.lat : e.center?.lat;
    const lon = typeof e.lon === "number" ? e.lon : e.center?.lon;
    if (!category || typeof lat !== "number" || typeof lon !== "number" || typeof e.type !== "string" || e.id === undefined) continue;
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = typeof tags.name === "string" && tags.name.trim() ? tags.name.trim() : null;
    places.push({ osm_id: id, category, name, lat, lon });
  }
  return { places, truncated: elements.length >= OVERPASS_LIMIT };
}

export async function fetchPlaces(opts: { db: Db; fetchFn: FetchFn; lat: number; lon: number; now?: () => Date; timeout_ms?: number }): Promise<VendorResult<PlacesData>> {
  const { db, fetchFn, lat, lon } = opts;
  const centre = snapPoint(lat, lon);
  return cached({
    db,
    vendor: "openstreetmap",
    key: cacheKey("openstreetmap", lat, lon, `r${OVERPASS_RADIUS_M}`),
    ttl_days: OVERPASS_TTL_DAYS,
    now: opts.now,
    load: async () => {
      const body = `data=${encodeURIComponent(overpassQuery(centre.lat, centre.lon))}`;
      return parseOverpass(await fetchJson(fetchFn, ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, opts.timeout_ms));
    },
  });
}


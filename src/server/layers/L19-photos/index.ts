// L19 Photos (layer id L19-photos): public street-level photos near the address (Mapillary, CC BY-SA 4.0) and public place photos within 1 km
// (Wikimedia Commons, each under its own open licence). They show the street and the neighbourhood, never the property itself: nothing here
// says an image is "the property". Every image carries its author, licence and a link to its source page, and the layer drops any image that
// lacks them. The layer never fetches: the adapters are handed in through the context and a failure comes back as a value (AD-8, AD-9).
// Only metadata and URLs are used; images load from the vendors' own servers.
import type { Figure } from "../../contracts/layer";
import { haversineMetres } from "../../geo";
import { log } from "../../log";
import { VENDOR_BUDGET_MS, type PlaceImage, type StreetImage, type VendorResult } from "../../vendors/types";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE } from "../shared/location";
import { vendorWithin } from "../shared/vendor-wait";

export const MAPILLARY_SOURCE = "mapillary";
export const COMMONS_SOURCE = "wikimedia_commons";
/** `gnaf` is listed because the address point comes from G-NAF. */
export const L19_SOURCE_IDS = [MAPILLARY_SOURCE, COMMONS_SOURCE, "gnaf"];

/** Street images are taken from within this distance of the address point (straight line). */
export const STREET_RADIUS_M = 150;
export const PLACE_RADIUS_M = 1000;
export const MAX_STREET_IMAGES = 4;
export const MAX_PLACE_IMAGES = 3;
/** Images within this many years of the newest one count as recent when choosing a spread of directions. */
const RECENT_WINDOW_YEARS = 2;
/** A newest street image older than this gets the "street may have changed" note. */
export const OLD_AFTER_YEARS = 3;

export const NO_PHOTOS_MESSAGE = "No public photos found near this address.";
export const UNAVAILABLE_MESSAGE = "Photos are not available right now.";
export const STREET_UNAVAILABLE_NOTE = "Street photos are not available right now.";
export const PLACE_UNAVAILABLE_NOTE = "Neighbourhood photos from Wikimedia Commons are not available right now.";
export const OLD_STREET_NOTE = "The newest street photo is more than three years old, so the street may have changed.";
export const PHOTO_SCOPE_NOTES = [
  "These are public photos of the street and the neighbourhood, taken by other people. They are not photos of this property.",
];

export const MAPILLARY_LICENCE = "CC BY-SA 4.0";
export const MAPILLARY_LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

/** North, east, south, west: which way the camera faced, so the chosen photos look different ways along the street. */
const quadrant = (angle: number | null): number => (angle === null ? 4 : Math.floor((((angle % 360) + 360) % 360 + 45) / 90) % 4);
const DIRECTIONS = ["north", "east", "south", "west"];

interface NearStreet extends StreetImage {
  distance_m: number;
}

/** Up to four recent images within 150 m: one per facing direction first, then the newest of the rest. Returned newest first. Panoramas are already excluded. */
export function pickStreetImages(images: StreetImage[], lat: number, lon: number, max = MAX_STREET_IMAGES): NearStreet[] {
  const near: NearStreet[] = images
    .map((i) => ({ ...i, distance_m: Math.round(haversineMetres(lat, lon, i.lat, i.lon)) }))
    .filter((i) => i.distance_m <= STREET_RADIUS_M && Number.isFinite(Date.parse(i.captured_at)))
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || a.id.localeCompare(b.id));
  if (near.length === 0) return [];
  const newest = Date.parse(near[0].captured_at);
  const windowStart = new Date(newest);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - RECENT_WINDOW_YEARS);
  const recent = near.filter((i) => Date.parse(i.captured_at) >= windowStart.getTime());
  const older = near.filter((i) => !recent.includes(i));
  const chosen: NearStreet[] = [];
  const usedDirections = new Set<number>();
  for (const i of recent) {
    if (chosen.length >= max) break;
    const q = quadrant(i.compass_angle);
    if (usedDirections.has(q)) continue;
    usedDirections.add(q);
    chosen.push(i);
  }
  for (const i of [...recent, ...older]) {
    if (chosen.length >= max) break;
    if (!chosen.includes(i)) chosen.push(i);
  }
  return chosen.sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || a.id.localeCompare(b.id));
}

/** Up to three open-licence Commons photos within 1 km, nearest first (a photo with no position was returned by the 1 km search and is kept last). */
export function pickPlaceImages(images: PlaceImage[], lat: number, lon: number, max = MAX_PLACE_IMAGES): (PlaceImage & { distance_m: number | null })[] {
  return images
    .map((i) => ({ ...i, distance_m: i.lat !== null && i.lon !== null ? Math.round(haversineMetres(lat, lon, i.lat, i.lon)) : null }))
    .filter((i) => i.distance_m === null || i.distance_m <= PLACE_RADIUS_M)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity) || a.title.localeCompare(b.title))
    .slice(0, max);
}

const yearOf = (iso: string) => new Date(iso).getUTCFullYear();

/**
 * A source that gave no answer for any reason: a failed call, or a missing Mapillary token (`no_key`). Either way the photos are not available,
 * which is not the same as "none found".
 */
const failed = <T,>(r: VendorResult<T>): boolean => !r.ok;

let warnedNoToken = false;
/** A missing token is a configuration problem the operator should see once, not on every report. */
function warnOnceNoToken(r: VendorResult<unknown>) {
  if (r.ok || r.reason !== "no_key" || warnedNoToken) return;
  warnedNoToken = true;
  log("warn", "mapillary_token_missing", { detail: "MAPILLARY_ACCESS_TOKEN is not set, so street photos are not available" });
}
/** For tests: lets the once-only warning fire again. */
export function resetNoTokenWarning() {
  warnedNoToken = false;
}

export const L19Photos: LayerDef = {
  layer_id: "L19-photos",
  title: "Street photos",
  tier: "free",
  source_ids: L19_SOURCE_IDS,
  // The two outside calls run together and give up at 5 s (cache read and write included); the layer waits a little longer so a slow vendor is a
  // gap, not an error, and the report stays under about 12 s with L06.
  timeout_ms: Math.max(VENDOR_BUDGET_MS.mapillary, VENDOR_BUDGET_MS.wikimedia) + 500,
  teaser: "Recent public photos of the street and the neighbourhood, each credited to its photographer.",
  async run({ address, vendors }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    const wait = Math.max(VENDOR_BUDGET_MS.mapillary, VENDOR_BUDGET_MS.wikimedia) + 250;
    const [street, places] = await Promise.all([vendorWithin(wait, () => vendors.streetImages(lat, lon)), vendorWithin(wait, () => vendors.placeImages(lat, lon))]);
    warnOnceNoToken(street);
    const streetPicked = street.ok ? pickStreetImages(street.data, lat, lon) : [];
    const placePicked = places.ok ? pickPlaceImages(places.data, lat, lon) : [];

    if (streetPicked.length === 0 && placePicked.length === 0) {
      return { status: "gap", figures: [], payload: {}, message: failed(street) || failed(places) ? UNAVAILABLE_MESSAGE : NO_PHOTOS_MESSAGE };
    }

    const figures: Figure[] = [];
    const notes: string[] = [...PHOTO_SCOPE_NOTES];
    const where = address.display_address;

    const streetItems = streetPicked.map((i) => {
      const year = yearOf(i.captured_at);
      return {
        id: i.id,
        year,
        captured_at: i.captured_at,
        creator: i.creator,
        licence: MAPILLARY_LICENCE,
        licence_url: MAPILLARY_LICENCE_URL,
        thumb_url: i.thumb_url,
        source_url: i.source_url,
        distance_m: i.distance_m,
        facing: i.compass_angle === null ? null : DIRECTIONS[quadrant(i.compass_angle)],
        alt: `Street view near ${where}, ${year}`,
      };
    });
    if (street.ok && streetItems.length > 0) {
      const newest = streetItems[0];
      figures.push(
        figure({
          key: "newest_street_photo",
          label: "Newest street photo",
          value: newest.year,
          unit: UNIT.year,
          chip: "Observed",
          source_ids: [MAPILLARY_SOURCE],
          as_of: street.as_of,
          note: `Year taken. Photos shown were taken within ${STREET_RADIUS_M} m of the address point (straight line).`,
        }),
      );
      const cutoff = new Date();
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - OLD_AFTER_YEARS);
      if (Date.parse(newest.captured_at) < cutoff.getTime()) notes.push(OLD_STREET_NOTE);
    }
    if (failed(street)) notes.push(STREET_UNAVAILABLE_NOTE);

    const placeItems = placePicked.map((i) => ({
      title: i.title,
      author: i.author,
      licence: i.licence,
      licence_url: i.licence_url,
      thumb_url: i.thumb_url,
      source_url: i.source_url,
      distance_m: i.distance_m,
      alt: `Photo from Wikimedia Commons near ${where}: ${i.title.replace(/\.[a-z]+$/i, "")}`,
    }));
    if (places.ok && placeItems.length > 0) {
      figures.push(
        figure({
          key: "place_photos",
          label: "Neighbourhood photos within 1 km",
          value: placeItems.length,
          unit: UNIT.count,
          chip: "Observed",
          source_ids: [COMMONS_SOURCE],
          as_of: places.as_of,
          note: "Photos from Wikimedia Commons with an open licence, each credited to its author. Distances are straight-line.",
        }),
      );
    }
    if (failed(places)) notes.push(PLACE_UNAVAILABLE_NOTE);

    return {
      status: "ok",
      figures,
      payload: { street: streetItems, places: placeItems, notes, centre: { lat, lon } },
    };
  },
};

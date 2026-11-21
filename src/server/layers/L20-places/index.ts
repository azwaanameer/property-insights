// L20 Nearby places (layer id L20-places): the nearest shop, cafe, park, medical and fitness place of each kind, and how many are within 400 m
// and 800 m, from the OpenStreetMap places loaded as a dataset (pipeline/ingest/osm-places.mjs; no outside call is made at request time).
// Data is © OpenStreetMap contributors (ODbL 1.0) and says so beside every figure. Every distance is a straight line from the address point to
// the place's point, not a walking route. There are no ratings, reviews, quality scores or "walkability" scores: OpenStreetMap carries none and
// this section invents none. A place with no name tag is counted but never listed by name. Only Victoria is loaded; no dataset is a gap.
import type { Figure } from "../../contracts/layer";
import { haversineMetres } from "../../geo";
import { listPlacesInBox, PLACES_SOURCE, type PlaceRow } from "../../repos/place";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE, STRAIGHT_LINE_NOTE } from "../shared/location";
import type { PlaceCategoryKey } from "../shared/place-category";

export const OSM_SOURCE = PLACES_SOURCE;
/** `gnaf` is listed because the address point comes from G-NAF. */
export const L20_SOURCE_IDS = [OSM_SOURCE, "gnaf"];

export const OSM_CREDIT = { text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" };
export const RINGS_M = [400, 800] as const;

export const CATEGORIES: { key: PlaceCategoryKey; heading: string; label: string }[] = [
  { key: "groceries", heading: "Supermarkets and groceries", label: "Nearest supermarket or grocer" },
  { key: "food", heading: "Cafes and restaurants", label: "Nearest cafe or restaurant" },
  { key: "parks", heading: "Parks and playgrounds", label: "Nearest park or playground" },
  { key: "medical", heading: "Pharmacy and medical", label: "Nearest pharmacy or medical centre" },
  { key: "fitness", heading: "Fitness", label: "Nearest gym or fitness centre" },
  { key: "library", heading: "Library", label: "Nearest library" },
];

export const NOT_LOADED_MESSAGE = "Nearby places are not loaded.";
export const VICTORIA_ONLY_MESSAGE = "Nearby places are loaded for Victorian addresses only.";
export const NOTHING_MESSAGE = "No shops, cafes, parks, medical places, gyms or libraries are listed in OpenStreetMap within 800 m of this address.";
export const UNNAMED = "A place with no name in OpenStreetMap";
export const SCOPE_NOTES = [
  "Places are as mapped by OpenStreetMap contributors, so a place can be missing or out of date. Distances are measured to the place's centre point, so a large park can be closer than its centre.",
];

export const L20Places: LayerDef = {
  layer_id: "L20-places",
  title: "Nearby places",
  tier: "free",
  source_ids: L20_SOURCE_IDS,
  teaser: "The nearest shops, cafes, parks, medical places and gyms, as straight-line distances.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (address.state !== "VIC") return { status: "gap", figures: [], payload: {}, message: VICTORIA_ONLY_MESSAGE };
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    // The bounding box is a prefilter on the index; the true straight-line distance trims it to the circle.
    const res = await listPlacesInBox(db, lat, lon, RINGS_M[1]);
    if (!res) return { status: "gap", figures: [], payload: {}, message: NOT_LOADED_MESSAGE };

    const within = res.rows
      .map((p: PlaceRow) => ({ ...p, distance_m: Math.round(haversineMetres(lat, lon, p.lat, p.lon)) }))
      .filter((p) => p.distance_m <= RINGS_M[1])
      .sort((a, b) => a.distance_m - b.distance_m || a.osm_id.localeCompare(b.osm_id));
    if (within.length === 0) return { status: "gap", figures: [], payload: {}, message: NOTHING_MESSAGE };

    const figures: Figure[] = [];
    const categories = CATEGORIES.map((c) => {
      const mine = within.filter((p) => p.category === c.key);
      const nearest = mine[0] ?? null;
      const within_400 = mine.filter((p) => p.distance_m <= RINGS_M[0]).length;
      const within_800 = mine.length;
      if (nearest) {
        figures.push(
          figure({
            key: `nearest_${c.key}`,
            label: c.label,
            value: nearest.distance_m,
            unit: UNIT.metres,
            chip: "Estimated",
            source_ids: [OSM_SOURCE],
            as_of: res.as_of,
            note: `${nearest.name ?? UNNAMED}. ${within_400} within 400 m and ${within_800} within 800 m. ${STRAIGHT_LINE_NOTE}`,
          }),
        );
      } else {
        figures.push(
          gapFigure({
            key: `nearest_${c.key}`,
            label: c.label,
            unit: UNIT.metres,
            source_ids: [OSM_SOURCE],
            as_of: res.as_of,
            note: "None listed in OpenStreetMap within 800 m of this address.",
          }),
        );
      }
      return {
        key: c.key,
        heading: c.heading,
        nearest: nearest ? { name: nearest.name, distance_m: nearest.distance_m } : null,
        within_400,
        within_800,
      };
    });

    return {
      status: "ok",
      figures,
      payload: {
        centre: { lat, lon },
        rings_m: [...RINGS_M],
        categories,
        straight_line: true,
        notes: [...SCOPE_NOTES],
        credit: OSM_CREDIT,
        meta: { chip: "Estimated", source_ids: [OSM_SOURCE], as_of: res.as_of },
      },
    };
  },
};

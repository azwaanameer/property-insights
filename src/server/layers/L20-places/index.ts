// L20 Nearby places (layer id L20-places): the nearest shop, cafe, park, medical and fitness place of each kind, and how many are within 400 m
// and 800 m, from OpenStreetMap. Data is © OpenStreetMap contributors (ODbL 1.0) and says so beside every figure. Every distance is a straight
// line from the address point to the place's point, not a walking route. There are no ratings, reviews, quality scores or "walkability" scores:
// OpenStreetMap carries none and this section invents none. A place with no name tag is counted but never listed by name.
import type { Figure } from "../../contracts/layer";
import { haversineMetres } from "../../geo";
import type { OsmPlace, PlaceCategoryKey } from "../../vendors/types";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE, STRAIGHT_LINE_NOTE } from "../shared/location";

export const OSM_SOURCE = "openstreetmap";
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

export const UNAVAILABLE_MESSAGE = "Nearby places are not available right now.";
export const NOTHING_MESSAGE = "No shops, cafes, parks, medical places, gyms or libraries are listed in OpenStreetMap within 800 m of this address.";
export const UNNAMED = "A place with no name in OpenStreetMap";
export const SCOPE_NOTES = [
  "Places are as mapped by OpenStreetMap contributors, so a place can be missing or out of date. Distances are measured to the place's centre point, so a large park can be closer than its centre.",
];
export const TRUNCATED_NOTE = "OpenStreetMap returned the most places this search allows, so the counts may be understated.";

export const L20Places: LayerDef = {
  layer_id: "L20-places",
  title: "Nearby places",
  tier: "free",
  source_ids: L20_SOURCE_IDS,
  timeout_ms: 10_000, // the outside call gives up at 8 s; the layer waits a little longer so a slow vendor is a gap, not an error
  teaser: "The nearest shops, cafes, parks, medical places and gyms, as straight-line distances.",
  async run({ address, vendors }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    const res = await vendors.places(lat, lon);
    if (!res.ok) return { status: "gap", figures: [], payload: {}, message: UNAVAILABLE_MESSAGE };

    const within = res.data.places
      .map((p: OsmPlace) => ({ ...p, distance_m: Math.round(haversineMetres(lat, lon, p.lat, p.lon)) }))
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

    const notes = [...SCOPE_NOTES];
    if (res.data.truncated) notes.push(TRUNCATED_NOTE);
    return {
      status: "ok",
      figures,
      payload: {
        centre: { lat, lon },
        rings_m: [...RINGS_M],
        categories,
        truncated: res.data.truncated,
        straight_line: true,
        notes,
        credit: OSM_CREDIT,
        meta: { chip: "Estimated", source_ids: [OSM_SOURCE], as_of: res.as_of },
      },
    };
  },
};

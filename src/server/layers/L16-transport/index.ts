// L16 Transport: the nearest stop of each kind (train, tram, bus, regional coach) and how many stops are close, from the PTV GTFS stops.
// Every distance is a straight line from the address point to the stop, as the crow flies. There is no walking route, no walk time and no
// isochrone: the street network is not loaded, so a straight line is all that can be said, and every figure says so.
import type { Figure } from "../../contracts/layer";
import { haversineMetres, offsetMetres } from "../../geo";
import { GTFS_SOURCE, listStopsInBox, TRANSIT_MODES, type StopRow, type TransitMode } from "../../repos/transit";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE, STRAIGHT_LINE_NOTE } from "../shared/location";

/** `gnaf` is listed because the address point comes from G-NAF. */
export const L16_SOURCE_IDS = [GTFS_SOURCE, "gnaf"];

export const MODE_LABEL: Record<TransitMode, string> = { train: "Train", tram: "Tram", bus: "Bus", coach: "Regional coach" };

/** The two rings the counts and the schematic use, in metres. */
export const RINGS_M = [400, 800] as const;
/** The nearest stop of a mode is looked for in these growing circles; beyond the last there is none to report. */
export const SEARCH_RADII_M = [800, 2_000, 5_000, 15_000] as const;
/** Stops drawn on the schematic map (the nearest of those inside the outer ring). */
export const MAX_MAP_STOPS = 60;
const MAX_ROUTES_SHOWN = 6;

interface Near extends StopRow {
  distance_m: number;
}

const withDistance = (rows: StopRow[], lat: number, lon: number): Near[] =>
  rows.map((s) => ({ ...s, distance_m: Math.round(haversineMetres(lat, lon, s.lat, s.lon)) })).sort((a, b) => a.distance_m - b.distance_m || a.stop_key.localeCompare(b.stop_key));

/** The stops drawn on the schematic: each mode's nearest stop first (so it is never cut), then the rest by distance, up to the cap. */
export function pickMapStops<T extends { mode: string; distance_m: number }>(inside: T[], cap = MAX_MAP_STOPS): T[] {
  const byDistance = [...inside].sort((a, b) => a.distance_m - b.distance_m);
  const chosen = new Set<T>();
  for (const mode of TRANSIT_MODES) {
    const first = byDistance.find((s) => s.mode === mode);
    if (first) chosen.add(first);
  }
  for (const s of byDistance) {
    if (chosen.size >= cap) break;
    chosen.add(s);
  }
  return byDistance.filter((s) => chosen.has(s));
}

export function routesText(routes: string[]): string {
  if (routes.length === 0) return "";
  const shown = routes.slice(0, MAX_ROUTES_SHOWN).join(", ");
  return routes.length > MAX_ROUTES_SHOWN ? `${shown} and ${routes.length - MAX_ROUTES_SHOWN} more` : shown;
}

export const L16Transport: LayerDef = {
  layer_id: "L16-transport",
  title: "Transport",
  tier: "free",
  source_ids: L16_SOURCE_IDS,
  dataset_ids: [GTFS_SOURCE],
  teaser: "The nearest train, tram, bus and coach stops, and how many are close by, as straight-line distances.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    // Everything within the outer ring, for every mode: the counts and the schematic map.
    const outer = RINGS_M[1];
    const perMode = await Promise.all(
      TRANSIT_MODES.map(async (mode) => {
        const found = await listStopsInBox(db, mode, lat, lon, SEARCH_RADII_M[0]);
        return { mode, found };
      }),
    );
    if (perMode.some((m) => m.found === null)) return { status: "gap", figures: [], payload: {}, message: "Public transport stops are not loaded." };
    const as_of = perMode[0].found!.as_of;

    const figures: Figure[] = [];
    const nearest: Record<string, { name: string; mode: TransitMode; distance_m: number; routes: string[] } | null> = {};
    const counts: Record<string, { within_400: number; within_800: number }> = {};
    const inside: Near[] = [];
    let foundAny = false;

    for (const { mode, found } of perMode) {
      const near = withDistance(found!.rows, lat, lon);
      const within = near.filter((s) => s.distance_m <= outer);
      inside.push(...within);
      let best: Near | undefined = within[0];
      // Nothing within 800 m: widen the circle until a stop turns up or the last radius is passed.
      for (const radius of SEARCH_RADII_M.slice(1)) {
        if (best) break;
        const wider = await listStopsInBox(db, mode, lat, lon, radius);
        best = withDistance(wider?.rows ?? [], lat, lon).find((s) => s.distance_m <= radius);
      }
      counts[mode] = { within_400: within.filter((s) => s.distance_m <= RINGS_M[0]).length, within_800: within.length };
      const label = MODE_LABEL[mode];
      if (!best) {
        nearest[mode] = null;
        const reach = SEARCH_RADII_M[SEARCH_RADII_M.length - 1] / 1000;
        figures.push(
          gapFigure({
            key: `nearest_${mode}`,
            label: `Nearest ${label.toLowerCase()} stop`,
            unit: UNIT.metres,
            source_ids: [GTFS_SOURCE],
            as_of,
            note: `No ${label.toLowerCase()} stop is listed within ${reach} km of this address.`,
          }),
        );
        continue;
      }
      foundAny = true;
      nearest[mode] = { name: best.name, mode, distance_m: best.distance_m, routes: best.routes };
      const servedBy = routesText(best.routes);
      figures.push(
        figure({
          key: `nearest_${mode}`,
          label: `Nearest ${label.toLowerCase()} stop`,
          value: best.distance_m,
          unit: UNIT.metres,
          chip: "Estimated",
          source_ids: [GTFS_SOURCE],
          as_of,
          note: `${best.name}${servedBy ? `, served by ${servedBy}` : ""}. ${STRAIGHT_LINE_NOTE}`,
        }),
        figure({
          key: `${mode}_stops_within_800m`,
          label: `${label} stops within 800 m`,
          value: counts[mode].within_800,
          unit: UNIT.count,
          chip: "Estimated",
          source_ids: [GTFS_SOURCE],
          as_of,
          note: `Counted from the stop list: ${counts[mode].within_400} within 400 m and ${counts[mode].within_800} within 800 m, straight-line. Platforms of one station count once.`,
        }),
      );
    }

    if (!foundAny) {
      return {
        status: "gap",
        figures,
        payload: { counts, nearest },
        message: `No train, tram, bus or coach stop is listed within ${SEARCH_RADII_M[SEARCH_RADII_M.length - 1] / 1000} km of this address.`,
      };
    }

    const mapStops = pickMapStops(inside)
      .map((s) => ({ name: s.name, mode: s.mode, distance_m: s.distance_m, routes: s.routes, ...offsetMetres(lat, lon, s.lat, s.lon) }));
    return {
      status: "ok",
      figures,
      payload: {
        centre: { lat, lon },
        rings_m: [...RINGS_M],
        counts,
        nearest,
        stops: mapStops,
        stops_within_outer_ring: inside.length,
        straight_line: true,
        meta: { chip: "Estimated", source_ids: [GTFS_SOURCE], as_of },
      },
    };
  },
};

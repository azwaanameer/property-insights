// L08 Supply: new apartments coming within one kilometre, from the City of Melbourne development activity monitor, by stage: under
// construction, approved and applied for. The monitor covers the City of Melbourne only, so an address outside it gets a gap that says so
// and no number (AD-9). Distances are straight lines from the address point. The counts are what the council recorded; nothing here says
// whether or when a project will be built.
import type { Figure } from "../../contracts/layer";
import { boxAround, haversineMetres, offsetMetres } from "../../geo";
import { COM_SOURCE, isComCovered } from "../../repos/building";
import { listProjectsInBox, type SupplyProject, type SupplyStatus } from "../../repos/supply";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE, STRAIGHT_LINE_NOTE } from "../shared/location";

/** `gnaf` is listed because the address point comes from G-NAF. */
export const L08_SOURCE_IDS = [COM_SOURCE, "gnaf"];

export const RADIUS_M = 1_000;
export const COM_ONLY_SUPPLY_MESSAGE = "The City of Melbourne development monitor covers the City of Melbourne only, and this address is outside it, so no new supply is shown.";
/** Projects listed in the table (the nearest of the three stages). */
export const MAX_LISTED = 15;

export const STAGES: { status: SupplyStatus; key: string; label: string }[] = [
  { status: "UNDER CONSTRUCTION", key: "under_construction", label: "Under construction" },
  { status: "APPROVED", key: "approved", label: "Approved" },
  { status: "APPLIED", key: "applied", label: "Applied for" },
];

export const L08Supply: LayerDef = {
  layer_id: "L08-supply",
  title: "Supply",
  tier: "free",
  source_ids: L08_SOURCE_IDS,
  dataset_ids: [COM_SOURCE],
  teaser: "How many new apartments are being built, approved or applied for within a kilometre.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    const [found, covered] = await Promise.all([listProjectsInBox(db, lat, lon, RADIUS_M), isComCovered(db, lat, lon)]);
    if (!found) return { status: "gap", figures: [], payload: {}, message: "The City of Melbourne development monitor is not loaded." };
    // Covered only when a council building lies close by: an address in a neighbouring council gets the gap, never an empty "0 projects".
    if (!covered) return { status: "gap", figures: [], payload: { outside_coverage: true }, message: COM_ONLY_SUPPLY_MESSAGE };

    const box = boxAround(lat, lon, RADIUS_M);
    const near = found.rows
      .filter((p) => p.lat >= box.min_lat && p.lat <= box.max_lat)
      .map((p) => ({ ...p, distance_m: Math.round(haversineMetres(lat, lon, p.lat, p.lon)) }))
      .filter((p) => p.distance_m <= RADIUS_M)
      .sort((a, b) => a.distance_m - b.distance_m || a.development_key.localeCompare(b.development_key));

    const src = [COM_SOURCE];
    const method = `Counted from the council's development monitor: projects within ${RADIUS_M / 1000} km of the address point. ${STRAIGHT_LINE_NOTE}`;
    const figures: Figure[] = [];
    const stages = STAGES.map((s) => {
      const projects = near.filter((p) => p.status === s.status);
      const dwellings = projects.reduce((n, p) => n + p.resi_dwellings, 0);
      figures.push(
        figure({ key: `projects_${s.key}`, label: `Projects ${s.label.toLowerCase()}, within 1 km`, value: projects.length, unit: UNIT.count, chip: "Estimated", source_ids: src, as_of: found.as_of, note: method }),
        figure({
          key: `dwellings_${s.key}`,
          label: `Dwellings ${s.label.toLowerCase()}, within 1 km`,
          value: dwellings,
          unit: UNIT.count,
          chip: "Estimated",
          source_ids: src,
          as_of: found.as_of,
          note: "Sum of the dwellings the council recorded for those projects. Student beds, hotel rooms and offices are not dwellings.",
        }),
      );
      return { key: s.key, label: s.label, projects: projects.length, dwellings };
    });
    const pipeline = near.filter((p) => STAGES.some((s) => s.status === p.status));
    const total = stages.reduce((n, s) => n + s.dwellings, 0);
    figures.push(
      figure({
        key: "dwellings_in_pipeline",
        label: "Dwellings under construction, approved or applied for, within 1 km",
        value: total,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: src,
        as_of: found.as_of,
        note: "The three stages added together. Approved and applied-for projects may change or not go ahead; the council's record does not say.",
      }),
    );

    const listed = (list: (SupplyProject & { distance_m: number })[]) =>
      list.slice(0, MAX_LISTED).map((p) => ({
        development_key: p.development_key,
        status: p.status,
        stage: STAGES.find((s) => s.status === p.status)?.label ?? p.status,
        street_address: p.street_address,
        dwellings: p.resi_dwellings,
        floors_above: p.floors_above,
        application: p.town_planning_application,
        distance_m: p.distance_m,
        ...offsetMetres(lat, lon, p.lat, p.lon),
      }));
    return {
      status: "ok",
      figures,
      payload: {
        radius_m: RADIUS_M,
        stages,
        projects: listed(pipeline),
        projects_total: pipeline.length,
        straight_line: true,
        meta: { chip: "Estimated", source_ids: src, as_of: found.as_of },
      },
    };
  },
};

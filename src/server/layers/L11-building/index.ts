// L11 Building: what is known about the building. The number of apartments is the G-NAF unit count, shown as a range and labelled
// Estimated (AD-6). Year built, floors, main use and the council's dwelling count come from the City of Melbourne building census, only
// where the pipeline matched this G-NAF building to one City of Melbourne record (the match type is stored and shown). The City of
// Melbourne files cover that council only: elsewhere the layer says so and invents nothing (AD-9).
import type { Figure } from "../../contracts/layer";
import { COM_SOURCE, getComBuilding, getGnafBuilding, isComCovered, type ComBuilding } from "../../repos/building";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";

/** `gnaf` is listed because the unit count and the building key come from G-NAF. */
export const L11_SOURCE_IDS = ["gnaf", COM_SOURCE];

export const COM_ONLY_MESSAGE = "City of Melbourne building facts are not available for this address: that dataset covers the City of Melbourne only.";
export const NO_MATCH_MESSAGE =
  "City of Melbourne building facts are not available for this address: that dataset covers the City of Melbourne only, and no single building record could be matched to this address.";
export const NO_BUILDING_MESSAGE = "This address could not be matched to a building, so no building facts are shown.";

/** The G-NAF unit count is shown as a range this wide each side (a tenth, at least one). An indication, not a measured error. */
export const UNIT_RANGE_SHARE = 0.1;

/** 300 -> { low: 270, high: 330 }; 2 -> { low: 1, high: 3 }. No unit addresses (n below 1) is no range. */
export function unitRange(n: number): { low: number; high: number } | null {
  if (!Number.isFinite(n) || n < 1) return null;
  const spread = Math.max(1, Math.ceil(n * UNIT_RANGE_SHARE));
  return { low: Math.max(1, n - spread), high: n + spread };
}

export const MATCH_TEXT: Record<ComBuilding["match_type"], string> = {
  exact_street_number: "Same street and street number as the City of Melbourne record.",
  nearest_within_30m_same_street: "The street number falls inside the City of Melbourne record's number range, on the same street and within 30 m.",
};

export const L11Building: LayerDef = {
  layer_id: "L11-building",
  title: "Building",
  tier: "free",
  source_ids: L11_SOURCE_IDS,
  dataset_ids: [COM_SOURCE],
  teaser: "What is known about the building: how many apartments it has, how old it is and how tall.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const buildingId = address.building_id;
    if (!buildingId) return { status: "gap", figures: [], payload: {}, message: NO_BUILDING_MESSAGE };

    const [gnaf, com] = await Promise.all([getGnafBuilding(db, buildingId), getComBuilding(db, buildingId)]);
    if (!com) return { status: "gap", figures: [], payload: {}, message: "City of Melbourne building data is not loaded." };

    const figures: Figure[] = [];
    const payload: Record<string, unknown> = { building_id: buildingId };

    const range = gnaf ? unitRange(gnaf.unit_count) : null;
    if (gnaf && range) {
      payload.unit_count = gnaf.unit_count;
      payload.unit_range = range;
      figures.push(
        figure({
          key: "apartments_in_building",
          label: "Apartments in the building",
          value: `${range.low} to ${range.high}`,
          chip: "Estimated",
          source_ids: ["gnaf"],
          as_of: gnaf.as_of,
          note: `Derived: G-NAF lists ${gnaf.unit_count} unit addresses under this building's street number. G-NAF can miss unit addresses, so the true number can differ. The range, about 10% either side, is indicative and is not a measured error.`,
        }),
      );
    }

    const b = com.building;
    const src = [COM_SOURCE];
    if (b) {
      // An exact street-number match is an observation of that record; a range match is an inference, so it is Estimated.
      const chip = b.match_type === "exact_street_number" ? ("Observed" as const) : ("Estimated" as const);
      const basis = `City of Melbourne building census ${b.census_year}. ${MATCH_TEXT[b.match_type]}`;
      payload.com = { property_id: b.property_id, street_address: b.street_address, census_year: b.census_year, match_type: b.match_type, match_text: MATCH_TEXT[b.match_type] };
      const add = (key: string, label: string, value: Figure["value"], unit: string | undefined, note?: string) =>
        figures.push(value === null ? gapFigure({ key, label, unit, source_ids: src, as_of: com.as_of, note: note ?? "The City of Melbourne census has no figure for this building." }) : figure({ key, label, value, unit, chip, source_ids: src, as_of: com.as_of, note: note ?? basis }));
      add("year_built", "Year built", b.construction_year, UNIT.year);
      if (b.refurbished_year !== null) add("year_refurbished", "Year refurbished", b.refurbished_year, UNIT.year);
      add("floors_above_ground", "Floors above ground", b.floors_above, UNIT.count);
      add("main_use", "Main use of the building", b.predominant_use, undefined);
      // Only a count from the building's own census year is stored; with none, no dwelling figure is shown at all.
      if (b.dwelling_count !== null) add("council_dwelling_count", "Dwellings counted by the council", b.dwelling_count, UNIT.count, `${basis} The council counts dwellings in a building each year; this can differ from the G-NAF address count.`);
      figures.push(
        figure({
          key: "building_match",
          label: "How the building record was matched",
          value: b.match_type === "exact_street_number" ? "Same street number" : "Inside the street-number range",
          chip: "Estimated",
          source_ids: [COM_SOURCE, "gnaf"],
          as_of: com.as_of,
          note: `Matched in the data build: ${MATCH_TEXT[b.match_type]} Record ${b.property_id}, ${b.street_address}.`,
        }),
      );
    } else {
      // Outside the council's area, or no single record could be matched: say so, and show nothing the dataset did not give.
      const { lat, lon } = address;
      const outside = lat !== null && lon !== null && !(await isComCovered(db, lat, lon));
      const message = outside ? COM_ONLY_MESSAGE : NO_MATCH_MESSAGE;
      payload.com = null;
      payload.com_message = message;
      figures.push(gapFigure({ key: "council_building_facts", label: "Year built, floors and main use", source_ids: src, as_of: com.as_of, note: message }));
      if (!range) return { status: "gap", figures: [], payload, message };
    }

    return { status: "ok", figures, payload };
  },
};

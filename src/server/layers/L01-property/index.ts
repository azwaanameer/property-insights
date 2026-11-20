// L01 Property: what is this property? Address facts from G-NAF, suburb from the ABS SAL match. Free layer.
// Reads only the already-resolved address (the resolver read it through the current-dataset pointers); no vendor calls.
import type { Figure } from "../../contracts/layer";
import type { LayerDef, LayerRunOutput } from "../types";

export const L01_SOURCE_IDS = ["gnaf", "abs_asgs_2021"];

export const L01Property: LayerDef = {
  layer_id: "L01-property",
  title: "Property",
  tier: "free",
  source_ids: L01_SOURCE_IDS,
  teaser: "The address, building and suburb this report is about.",
  async run({ address }): Promise<LayerRunOutput> {
    const gnaf = ["gnaf"];
    const as_of = address.gnaf_as_of;
    const figures: Figure[] = [
      { key: "address", label: "Address", value: address.display_address, chip: "Observed", source_ids: gnaf, as_of },
      { key: "locality", label: "Locality", value: address.locality, chip: "Observed", source_ids: gnaf, as_of },
      { key: "state", label: "State", value: address.state, chip: "Observed", source_ids: gnaf, as_of },
    ];
    if (address.postcode) {
      figures.push({ key: "postcode", label: "Postcode", value: address.postcode, chip: "Observed", source_ids: gnaf, as_of });
    }
    if (address.building_name) {
      figures.push({ key: "building_name", label: "Building name", value: address.building_name, chip: "Observed", source_ids: gnaf, as_of });
    }

    // Unit claims only when the unit itself is in G-NAF. Building-only matches suppress them (AD-9).
    const unitClaimsSuppressed = address.match !== "unit" && (address.is_multi_unit || address.unit_requested !== null);
    if (address.match === "unit") {
      if (address.unit_number) {
        figures.push({ key: "unit", label: "Unit", value: address.unit_number, chip: "Observed", source_ids: gnaf, as_of });
      }
      if (address.level_number) {
        figures.push({ key: "level", label: "Level", value: address.level_number, chip: "Observed", source_ids: gnaf, as_of });
      }
    } else if (address.unit_requested) {
      figures.push({
        key: "unit",
        label: "Unit",
        value: null,
        chip: "Unknown",
        source_ids: gnaf,
        as_of,
        note: `Unit ${address.unit_requested} is not in G-NAF, so no unit-level facts are shown.`,
      });
    }

    // The suburb comes from matching the G-NAF locality name to an ABS suburb, so it is an allocation, not an observation.
    if (address.sal_code && address.sal_name) {
      figures.push({
        key: "suburb",
        label: "Suburb",
        value: address.sal_name,
        chip: "Estimated",
        source_ids: ["abs_asgs_2021", "gnaf"],
        as_of: address.suburb_as_of ?? as_of,
        note: `ABS suburb code ${address.sal_code}, matched from the G-NAF locality name (${address.sal_match_type}).`,
      });
    } else {
      figures.push({
        key: "suburb",
        label: "Suburb",
        value: null,
        chip: "Unknown",
        source_ids: ["abs_asgs_2021", "gnaf"],
        as_of: null,
        note: "The G-NAF locality could not be matched to a single ABS suburb, so suburb layers will not run for this address.",
      });
    }

    if (address.lat !== null && address.lon !== null) {
      figures.push({
        key: "location",
        label: "Location (GDA2020)",
        value: `${address.lat.toFixed(6)}, ${address.lon.toFixed(6)}`,
        chip: "Observed",
        source_ids: gnaf,
        as_of,
      });
    }

    return {
      status: "ok",
      figures,
      payload: {
        gnaf_pid: address.gnaf_pid,
        building_id: address.building_id,
        sal_code: address.sal_code,
        match: address.match,
        unit_claims_suppressed: unitClaimsSuppressed,
        coordinates: address.lat !== null && address.lon !== null ? { lat: address.lat, lon: address.lon, datum: "GDA2020" } : null,
      },
    };
  },
};

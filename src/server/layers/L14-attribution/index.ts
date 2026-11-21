// L14 Attribution: where all of this came from. A synthesis layer (AD-1): it runs after the others and reads their RESULTS (`ctx.siblings`),
// never calling them. It credits a source only where a section that is ok shows at least one figure with a value taken from it: a gap, locked,
// not-covered or failed section credits nothing, and neither does a section that merely names the source in a note or an empty figure.
// Each credit carries the attribution text and licence from the source registry (AD-4), the licence link, whether VicProp changed the data
// (CC BY asks that changes are indicated) and the as-of date of the dataset behind it (AD-7).
import type { LayerResult } from "../../contracts/layer";
import { listCurrentDatasets } from "../../repos/datasets";
import { listSources } from "../../repos/source";
import type { LayerDef, LayerRunOutput } from "../types";

/** Own data: the registry that lets this layer be switched on. It is not itself a source to credit. */
export const REGISTRY_SOURCE = "vicprop_registry";
export const L14_SOURCE_IDS = [REGISTRY_SOURCE];

export const SOURCES_NOTE = "Every figure in this report shows its source and date. A figure marked Estimated says how it was worked out. This report is general information, not advice.";

export const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";
export const CC_BY_SA_4_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
/** Where a credit line links to, for a source whose licence asks for a link in the credit. */
export const CREDIT_URLS: Record<string, string> = { openstreetmap: "https://www.openstreetmap.org/copyright" };

/** The licence text of the registry mapped to its licence page; a licence that is set per item (Wikimedia Commons) has none here. */
export function licenceUrl(licence: string): string | null {
  if (licence.includes("CC BY-SA 4.0")) return CC_BY_SA_4_URL;
  if (licence.includes("CC BY 4.0")) return CC_BY_4_URL;
  if (licence.includes("ODbL")) return ODBL_URL;
  return null;
}

/**
 * Sources VicProp always transforms before showing: stops grouped into stations, zones tested against the address, schools filtered to open
 * ones, council records matched to addresses, a conditions rating derived from Census shares, neighbours matched to suburbs by name, and crime
 * counts added up by suburb and rates worked out for Victoria, and reported sales cleaned and matched to buildings and fitted into a price-driver model.
 * Any source behind an Estimated figure is also credited as adapted.
 */
export const ADAPTED_SOURCES = new Set(["gtfs_vic", "vic_school_zones_2026", "vic_school_locations_2026", "com_open_data", "gnaf_neighbours", "conditions_rating", "csa_crime_incidents", "rp_sold_listings", "rp_sold_model"]);

export interface Citation {
  layers: string[];
  estimated: boolean;
}

/** For each source id, the ok sections that show a non-null figure from it, and whether any such figure is Estimated. */
export function citedBy(siblings: LayerResult[]): Map<string, Citation> {
  const used = new Map<string, Citation>();
  for (const s of siblings) {
    if (s.status !== "ok") continue;
    for (const f of s.figures) {
      if (f.value === null) continue;
      for (const id of f.source_ids) {
        const cur = used.get(id) ?? { layers: [], estimated: false };
        if (!cur.layers.includes(s.layer_id)) cur.layers.push(s.layer_id);
        if (f.chip === "Estimated") cur.estimated = true;
        used.set(id, cur);
      }
    }
  }
  return used;
}

export const L14Attribution: LayerDef = {
  layer_id: "L14-attribution",
  title: "Attribution",
  tier: "free",
  synthesis: true,
  source_ids: L14_SOURCE_IDS,
  teaser: "The data this report was built from, with its licence and date.",
  async run({ db, siblings }): Promise<LayerRunOutput> {
    const used = citedBy(siblings ?? []);
    used.delete(REGISTRY_SOURCE);
    const [registry, datasets] = await Promise.all([listSources(db), listCurrentDatasets(db)]);
    const known = new Map(registry.map((r) => [r.source_id, r]));
    const dated = new Map(datasets.map((d) => [d.source_id, d]));
    const sources = [...used.keys()]
      // AD-4: only a cleared source is shown or credited; anything else would have stopped its section.
      .filter((id) => known.get(id)?.rights_status === "cleared")
      .map((id) => {
        const r = known.get(id)!;
        const d = dated.get(id);
        return {
          source_id: id,
          name: r.name,
          licence: r.licence,
          attribution_text: r.attribution_text,
          licence_url: licenceUrl(r.licence),
          credit_url: CREDIT_URLS[id] ?? null,
          adapted: ADAPTED_SOURCES.has(id) || (used.get(id)?.estimated ?? false),
          as_of: d?.as_of ?? null,
          retrieved_at: d?.retrieved_at ?? null,
          used_by: used.get(id)?.layers ?? [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    if (sources.length === 0) {
      return { status: "gap", figures: [], payload: {}, message: "No section of this report cited a source, so there is nothing to list." };
    }
    return { status: "ok", figures: [], payload: { note: SOURCES_NOTE, sources } };
  },
};

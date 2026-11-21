// L18 Recorded crime (layer id L18-safety): what the Crime Statistics Agency (CSA) recorded in the address's suburb, and the rate for each
// 100,000 residents of its council area against Victoria. Plain counts and rates as the CSA publishes them, with its own notices.
// There is no score, label, ranking or colour, no forecast (AD-10), and no suburb rate: the CSA publishes suburb counts only, and its suburb
// boundaries are not the ABS ones, so the rate is for the council area. The address is matched to the CSA suburb on the normalised name AND
// the postcode; no match is a gap, never a guess (AD-9). A figure we add up or subtract is Estimated; a council rate as published is Observed.
import type { Figure } from "../../contracts/layer";
import { CRIME_SOURCE, getCrimeDataset, getVictorianRate, listCouncilCrime, listCrimeNotes, listSuburbCrime, type CrimeNote, type SuburbCrimeRow } from "../../repos/crime";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { suburbKey } from "../shared/suburb-key";

/** `gnaf` is listed because the suburb name and postcode come from the G-NAF address. */
export const L18_SOURCE_IDS = [CRIME_SOURCE, "gnaf"];

/** The six offence divisions of the CSA classification, as it names them in the workbook. */
export const DIVISIONS: Record<string, string> = {
  A: "Crimes against the person",
  B: "Property and deception offences",
  C: "Drug offences",
  D: "Public order and security offences",
  E: "Justice procedures offences",
  F: "Other offences",
};

/** Years of totals shown in the series. */
export const SERIES_YEARS = 5;

export const NOT_LOADED_MESSAGE = "Crime statistics are not loaded.";
export const NO_POSTCODE_MESSAGE =
  "This address has no postcode, and the Crime Statistics Agency's suburb counts are matched on suburb name and postcode together, so no crime figures are shown. A postcode is needed.";
export const VICTORIA_ONLY_MESSAGE = "Recorded crime figures come from the Victorian Crime Statistics Agency, so they are shown for Victorian addresses only.";
export const noSuburbMessage = (suburb: string, postcode: string) =>
  `The Crime Statistics Agency's list does not include the suburb or town "${suburb}" with postcode ${postcode}, so no crime figures are shown. It publishes counts only for the suburbs and towns in its own list, matched on name and postcode together, and may have counted this place under a neighbour.`;
export const noLatestMessage = (suburb: string, postcode: string, year: number) =>
  `The Crime Statistics Agency lists no incidents for "${suburb}" (postcode ${postcode}) in the year ending June ${year}, so no counts are shown for that year.`;

/** Short statements of scope that are VicProp's own words, kept apart from the CSA's notices. They say what the figures are, and give no verdict. */
export const SCOPE_NOTES = [
  "This section shows incidents recorded by police and one council area rate, as the Crime Statistics Agency publishes them. It gives no verdict on an area and no view of what happens next.",
  "Suburb counts follow the Crime Statistics Agency's own suburb or town and postcode, which are not always the same as the suburb on your address. The agency publishes no rate for a suburb.",
  "The rate is incidents for each 100,000 residents of the whole council area, so it does not describe this suburb on its own. Small counts move a lot from one year to the next.",
];

/** "ST KILDA EAST" -> "St Kilda East", for a message that names the suburb as the address file wrote it. */
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
const yearLabel = (y: number) => `year ending June ${y}`;
const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const sum = (rows: { incidents: number }[]) => rows.reduce((n, r) => n + r.incidents, 0);

/** The CSA's notices as published, in the order they are shown: this table's footnotes, the council table's footnotes, then the general notes (not the licence line, which is credited in the sources). */
export function pickNotices(notes: CrimeNote[]): { key: string; text: string }[] {
  const by = (pred: (n: CrimeNote) => boolean) => notes.filter(pred);
  const ordered = [
    ...by((n) => n.sheet === "Footnotes" && n.topic === "Table 03"),
    ...by((n) => n.sheet === "Footnotes" && n.topic === "Table 01"),
    ...by((n) => n.sheet === "Contents" && n.topic === "notes" && !n.note_text.includes("Creative Commons")),
  ];
  const seen = new Set<string>();
  return ordered.filter((n) => (seen.has(n.note_text) ? false : (seen.add(n.note_text), true))).map((n) => ({ key: n.note_key, text: n.note_text }));
}

function divisionLetter(division: string): string {
  return division.charAt(0);
}

export const L18Safety: LayerDef = {
  layer_id: "L18-safety",
  title: "Recorded crime",
  tier: "free",
  source_ids: L18_SOURCE_IDS,
  teaser: "How many crimes police recorded in the suburb in the latest year, and the council area's rate for every hundred thousand residents.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const dataset = await getCrimeDataset(db);
    if (!dataset) return { status: "gap", figures: [], payload: {}, message: NOT_LOADED_MESSAGE };
    if (address.state !== "VIC") return { status: "gap", figures: [], payload: {}, message: VICTORIA_ONLY_MESSAGE };
    if (!address.postcode) return { status: "gap", figures: [], payload: {}, message: NO_POSTCODE_MESSAGE };

    const { latest_year: latest, as_of } = dataset;
    const src = [CRIME_SOURCE];
    const rows = await listSuburbCrime(db, suburbKey(address.locality), address.postcode);
    if (rows.length === 0) return { status: "gap", figures: [], payload: {}, message: noSuburbMessage(titleCase(address.locality), address.postcode) };
    const name = rows[0].suburb;

    const inYear = (y: number): SuburbCrimeRow[] => rows.filter((r) => r.year_ending === y);
    const now = inYear(latest);
    if (now.length === 0) return { status: "gap", figures: [], payload: {}, message: noLatestMessage(name, address.postcode, latest) };
    const previousYear = latest - 1;
    const before = inYear(previousYear);

    const councils = [...new Set(now.map((r) => r.lga))].sort();
    const [councilRows, victoria, noteRows] = await Promise.all([listCouncilCrime(db, councils, latest), getVictorianRate(db, latest), listCrimeNotes(db)]);

    const across = councils.length > 1 ? ` The suburb lies in ${councils.length} council areas (${councils.join(" and ")}); the counts are added together.` : "";
    const summed = `Added up from the Crime Statistics Agency's published counts for ${name} ${address.postcode}, ${yearLabel(latest)}.${across}`;
    const total = sum(now);
    const figures: Figure[] = [
      figure({ key: "suburb_total", label: `Incidents recorded in ${name}, ${yearLabel(latest)}`, value: total, unit: UNIT.count, chip: "Estimated", source_ids: src, as_of, note: summed }),
    ];

    // One figure per division, always all six: the agency lists only offences that occurred, so a division with no row has none recorded.
    const divisions = Object.entries(DIVISIONS).map(([letter, label]) => {
      const mine = now.filter((r) => divisionLetter(r.division) === letter);
      const prev = before.filter((r) => divisionLetter(r.division) === letter);
      return { key: letter, name: label, total: sum(mine), previous: before.length > 0 ? sum(prev) : null };
    });
    for (const d of divisions) {
      figures.push(
        figure({
          key: `division_${d.key.toLowerCase()}`,
          label: `${d.name}, ${yearLabel(latest)}`,
          value: d.total,
          unit: UNIT.count,
          chip: "Estimated",
          source_ids: src,
          as_of,
          note: d.total === 0 ? "The Crime Statistics Agency lists no incident of this kind for the suburb in this year." : `Added up from the agency's offence subdivisions in division ${d.key}.`,
        }),
      );
    }

    const previousTotal = before.length > 0 ? sum(before) : null;
    if (previousTotal !== null && previousTotal > 0) {
      figures.push(
        figure({
          key: "change_on_previous_year",
          label: `Change in recorded incidents on the ${yearLabel(previousYear)}`,
          value: (total - previousTotal) / previousTotal,
          unit: UNIT.fraction,
          chip: "Estimated",
          source_ids: src,
          as_of,
          note: `${total} recorded in the ${yearLabel(latest)}, compared with ${previousTotal} in the ${yearLabel(previousYear)}. The newest year is provisional: the agency extracts it 18 days after the year ends and says counts move between releases, while the earlier year has settled, so this change is not like for like. Small counts also change a lot from year to year.`,
        }),
      );
    } else {
      figures.push(
        gapFigure({
          key: "change_on_previous_year",
          label: `Change in recorded incidents on the ${yearLabel(previousYear)}`,
          source_ids: src,
          as_of,
          note: `The agency lists no incidents for this suburb in the ${yearLabel(previousYear)}, so no change is worked out.`,
        }),
      );
    }

    // The council area rate as published (Observed), one per council area the suburb lies in, each named, against the Victorian rate.
    const byLga = new Map(councilRows.map((c) => [c.lga, c]));
    councils.forEach((lga, i) => {
      const c = byLga.get(lga);
      const key = councils.length === 1 ? "council_rate" : `council_rate_${i + 1}`;
      const label = `Rate for every 100,000 residents, ${lga} council area, ${yearLabel(latest)}`;
      if (!c || c.rate_per_100k === null) {
        figures.push(gapFigure({ key, label, unit: UNIT.per100k, source_ids: src, as_of, note: `The agency publishes no rate for ${lga} in this year.` }));
        return;
      }
      figures.push(
        figure({
          key,
          label,
          value: c.rate_per_100k,
          unit: UNIT.per100k,
          chip: "Observed",
          source_ids: src,
          as_of,
          note: `${withCommas(c.incidents)} incidents recorded in the whole ${lga} council area (${c.police_region}). The rate is for the council area, not the suburb.`,
        }),
      );
    });
    if (victoria) {
      figures.push(
        figure({
          key: "victoria_rate",
          label: `Rate for every 100,000 residents, Victoria, ${yearLabel(latest)}`,
          value: victoria.rate_per_100k,
          unit: UNIT.per100k,
          chip: "Estimated",
          source_ids: src,
          as_of,
          note: `Worked out from the council area rows: all ${victoria.council_areas} council areas combined, excluding incidents at justice institutions and immigration facilities, in unincorporated Victoria and with unknown location. Each area's residents are its incidents divided by its rate, so the top and bottom of the sum match.`,
        }),
      );
    } else {
      figures.push(gapFigure({ key: "victoria_rate", label: `Rate for every 100,000 residents, Victoria, ${yearLabel(latest)}`, unit: UNIT.per100k, source_ids: src, as_of, note: "No council area rates are loaded for this year, so no Victorian rate is worked out." }));
    }

    // The table: each offence subdivision, this year and the year before. Zero in both years is left out.
    const subdivisions = [...new Set([...now, ...before].map((r) => r.subdivision))];
    const table = subdivisions
      .map((subdivision) => {
        const a = now.filter((r) => r.subdivision === subdivision);
        const b = before.filter((r) => r.subdivision === subdivision);
        const division = (a[0] ?? b[0]).division;
        // The agency lists only offences that occurred, so no row in a year is "none listed" (null), the same as a year with no rows at all.
        return { division_key: divisionLetter(division), division, subdivision, latest: a.length > 0 ? sum(a) : null, previous: b.length > 0 ? sum(b) : null };
      })
      .filter((r) => r.latest !== null || r.previous !== null)
      .sort((x, y) => x.subdivision.localeCompare(y.subdivision, "en", { numeric: true }));

    // Totals for the latest five years. A year with no rows is "none listed", not zero: the layer cannot tell a quiet year from a missing one.
    const series = Array.from({ length: SERIES_YEARS }, (_, i) => latest - (SERIES_YEARS - 1) + i)
      .filter((y) => dataset.years.includes(y))
      .map((y) => ({ year_ending: y, total: inYear(y).length > 0 ? sum(inYear(y)) : null }));

    const notices = pickNotices(noteRows);
    return {
      status: "ok",
      figures,
      payload: {
        suburb: { name, postcode: address.postcode },
        year_ending: latest,
        previous_year: before.length > 0 ? previousYear : null,
        councils: councils.map((lga) => {
          const c = byLga.get(lga);
          return { lga, police_region: c?.police_region ?? null, incidents: c?.incidents ?? null, rate_per_100k: c?.rate_per_100k ?? null };
        }),
        victoria: victoria ? { rate_per_100k: victoria.rate_per_100k, council_areas: victoria.council_areas, incidents: victoria.incidents } : null,
        divisions,
        table,
        series,
        notices,
        scope_notes: SCOPE_NOTES,
        meta: { chip: "Estimated", source_ids: src, as_of },
      },
    };
  },
};

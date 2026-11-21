// L06 Short-stay income (layer id L06-shortstay): what the same apartment could earn as a short stay over a year, by the City Retreats CRM's method.
// AirDNA's rentalizer (adapter handed in through the context, never fetched here) gives its own estimate and a set of comparable listings. When AirDNA's
// confidence is High its figure is used; otherwise the estimate is ours, the median of the nearest 15 strong comparable listings, with its 25th to 75th
// percentile range; with no usable comparable listings AirDNA's figure is shown as a labelled fallback. Every figure says which method produced it and
// is Estimated, never Observed. Amounts are Australian dollars.
// The section is shown only when the estimated income is at least 1.4 times the home's long-term rent for a year (the L02 rent for the same bedroom
// count, read from `ctx.siblings`, which is why this is a synthesis layer). Anywhere else, and for a house, a missing rent, no estimate or a vendor
// failure, it is a gap with one plain line, and the report draws that line quietly instead of a section card (AD-9).
// No guarantee or forecast wording: the figure is what similar listings made over the last year.
import type { Figure, LayerResult } from "../../contracts/layer";
import type { ResolvedAddress } from "../../contracts/address";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily, FAMILY } from "../shared/derive";
import { figure, joinNotes, UNIT } from "../shared/figures";
import { type ChosenIncome, chooseIncome, CUTOFF_RATIO, MAX_COMPS, isStrongComp, meetsCutoff, MIN_COMP_REVENUE, MIN_COMP_REVIEWS, MIN_STRONG_COMPS } from "../shared/shortstay";

export const SHORTSTAY_SOURCE = "airdna_rentalizer";
/** `gnaf` is listed because the address and its building come from G-NAF. */
export const L06_SOURCE_IDS = [SHORTSTAY_SOURCE, "gnaf"];

/** The size the report uses for an apartment: the same 2-bedroom size L02 and L05 use for rent and yield. The report has no bedroom choice. */
export const REPORT_BEDROOMS: number = FAMILY.unit.primary_bedrooms;
/** The report has no bathroom figure for a home anywhere; 2 is what AirDNA itself assumes, and the section says it is assumed. */
export const REPORT_BATHROOMS = 2;

export const HOUSE_MESSAGE = "Short-stay estimates are for apartments.";
export const NO_RENT_MESSAGE = "No long-term rent figure to compare with.";
export const UNAVAILABLE_MESSAGE = "Short-stay estimates are not available right now.";
export const NO_ESTIMATE_MESSAGE = "No short-stay estimate is available for this address.";
export const BELOW_CUTOFF_MESSAGE = "Short-stay income is not at least 40% above long-term rent here, so this section is not shown.";

export const SHORTSTAY_NOTES = [
  "An estimate from what AirDNA reports for similar nearby listings over the last 12 months. It is not a promise or a forecast of what this home would earn.",
  "Before costs: platform fees, cleaning, furnishing, utilities, owners corporation fees, rates and tax are not taken off.",
  "This report does not check whether short stays are allowed in the building or by the council.",
];

const WEEKS = 52;

/** The L02 rent for the apartment size the report uses, in cents a week, from the sibling results; null when L02 has no such figure. */
export function weeklyRentFrom(siblings: LayerResult[] | undefined): { cents: number; chip: Figure["chip"]; as_of: string | null; source_ids: string[] } | null {
  const l02 = (siblings ?? []).find((s) => s.layer_id === "L02-rent");
  if (!l02 || l02.status !== "ok") return null;
  const f = l02.figures.find((x) => x.key === `rent_${FAMILY.unit.primary_bedrooms}bed_${FAMILY.unit.rent_noun}`);
  if (!f || typeof f.value !== "number" || !Number.isFinite(f.value) || f.value <= 0) return null;
  return { cents: f.value, chip: f.chip, as_of: f.as_of, source_ids: f.source_ids };
}

/** The address as AirDNA geocodes it (the CRM's buildFullAddress): the displayed address already ends in "VIC 3008" when G-NAF gave a postcode. */
export function airdnaAddress(a: Pick<ResolvedAddress, "display_address" | "locality" | "state" | "postcode">): string {
  if (/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\s+\d{4}\b/i.test(a.display_address)) return `${a.display_address}, Australia`;
  return [a.display_address, a.locality, a.state, a.postcode, "Australia"].filter(Boolean).join(", ");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cents = (dollars: number) => Math.round(dollars) * 100;

/** Which method produced the figure, in words (the section's method line). */
export function methodText(c: ChosenIncome): string {
  const level = c.level;
  if (c.method === "airdna") return "AirDNA estimate, high confidence";
  if (c.method === "own") {
    const n = c.selection.used.length;
    const why = level ? `because AirDNA's confidence is ${level}` : "because AirDNA gave no confidence rating";
    return `Our estimate from ${plural(n, "nearby comparable listing", "nearby comparable listings")}${c.few ? " (few comparable listings)" : ""}, ${why}`;
  }
  return `AirDNA estimate${level ? `, ${level.toLowerCase()} confidence` : ", confidence not stated"} (no usable comparable listings, so there is no estimate of our own)`;
}

export const L06Shortstay: LayerDef = {
  layer_id: "L06-shortstay",
  title: "Short-stay income",
  tier: "free",
  synthesis: true,
  source_ids: L06_SOURCE_IDS,
  // The adapter's own limit is 8 s, and it may wait 1.5 s and try once more, so the layer is given a little longer than the runner's default.
  timeout_ms: 10000,
  teaser: "What an apartment like this could earn as a short stay, set against its long-term rent.",
  async run({ address, siblings, vendors }): Promise<LayerRunOutput> {
    const gap = (message: string): LayerRunOutput => ({ status: "gap", figures: [], payload: {}, message });
    if (dwellingFamily(address) !== "unit") return gap(HOUSE_MESSAGE);
    const rent = weeklyRentFrom(siblings);
    if (!rent) return gap(NO_RENT_MESSAGE);

    const result = await vendors.shortStay({ gnaf_pid: address.gnaf_pid, address: airdnaAddress(address), bedrooms: REPORT_BEDROOMS, bathrooms: REPORT_BATHROOMS });
    if (!result.ok) return gap(UNAVAILABLE_MESSAGE);
    const est = result.data;
    const chosen = chooseIncome(est);
    if (!chosen) return gap(NO_ESTIMATE_MESSAGE);

    const annualCents = cents(chosen.annual);
    const rentAnnualCents = rent.cents * WEEKS;
    if (!meetsCutoff(annualCents, rentAnnualCents)) return gap(BELOW_CUTOFF_MESSAGE);

    const src = [SHORTSTAY_SOURCE];
    const as_of = result.as_of;
    const method = methodText(chosen);
    const bedsText = `Worked for a ${REPORT_BEDROOMS}-bedroom, ${REPORT_BATHROOMS}-bathroom apartment: the report does not know this home's bedrooms or bathrooms, so these are assumed (the ${REPORT_BEDROOMS}-bedroom size used for rent and yield).`;
    const usedDiffers =
      (est.used_bedrooms !== null && est.used_bedrooms !== REPORT_BEDROOMS) || (est.used_bathrooms !== null && est.used_bathrooms !== REPORT_BATHROOMS)
        ? `AirDNA says it used ${est.used_bedrooms ?? "?"} bedrooms and ${est.used_bathrooms ?? "?"} bathrooms.`
        : undefined;
    const ratio = annualCents / rentAnnualCents;

    const figures: Figure[] = [
      figure({
        key: "shortstay_annual",
        label: "Estimated short-stay income, a year",
        value: annualCents,
        unit: UNIT.money,
        chip: "Estimated",
        source_ids: src,
        as_of,
        note: joinNotes(`${method}.`, bedsText, usedDiffers),
      }),
      figure({
        key: "shortstay_monthly",
        label: "Estimated short-stay income, a month",
        value: Math.round(annualCents / 12),
        unit: UNIT.money,
        chip: "Estimated",
        source_ids: src,
        as_of,
        note: "The yearly figure divided by 12, before costs.",
      }),
    ];
    if (chosen.p25 !== null && chosen.p75 !== null) {
      const n = chosen.selection.used.length;
      const rangeNote = `The 25th and 75th percentile of the yearly income of the ${plural(n, "nearby comparable listing", "nearby comparable listings")} used: half of them earned between these two figures.`;
      figures.push(
        figure({ key: "shortstay_annual_p25", label: "Low end of the range, a year", value: cents(chosen.p25), unit: UNIT.money, chip: "Estimated", source_ids: src, as_of, note: rangeNote }),
        figure({ key: "shortstay_annual_p75", label: "High end of the range, a year", value: cents(chosen.p75), unit: UNIT.money, chip: "Estimated", source_ids: src, as_of, note: rangeNote }),
      );
    }
    // Occupancy and the nightly rate are AirDNA's own statistics for the address, so they sit beside AirDNA's figure, not beside ours.
    if (chosen.method !== "own") {
      if (est.occupancy !== null && est.occupancy >= 0 && est.occupancy <= 1) {
        figures.push(figure({ key: "shortstay_occupancy", label: "Share of nights booked", value: est.occupancy, unit: UNIT.fraction, chip: "Estimated", source_ids: src, as_of, note: "AirDNA's estimate for the last 12 months." }));
      }
      if (est.adr !== null && est.adr > 0) {
        figures.push(figure({ key: "shortstay_adr", label: "Average nightly rate", value: cents(est.adr), unit: UNIT.money, chip: "Estimated", source_ids: src, as_of, note: "AirDNA's estimate for the last 12 months, in Australian dollars." }));
      }
    }
    figures.push(
      figure({
        key: "shortstay_comps_used",
        label: "Comparable listings used",
        value: chosen.selection.used.length,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: src,
        as_of,
        note: joinNotes(
          est.total_comps !== null && `AirDNA found ${est.total_comps} comparable listings in all.`,
          chosen.selection.basis === "strong"
            ? `The nearest ${MAX_COMPS} that made at least $${MIN_COMP_REVENUE.toLocaleString("en-AU")} a year and have at least ${MIN_COMP_REVIEWS} reviews.`
            : `Fewer than ${MIN_STRONG_COMPS} listings made at least $${MIN_COMP_REVENUE.toLocaleString("en-AU")} a year with at least ${MIN_COMP_REVIEWS} reviews, so every nearby listing with income is used, including newer or quieter ones.`,
        ),
      }),
      figure({
        key: "longterm_rent_annual",
        label: "Long-term rent for the same home, a year",
        value: rentAnnualCents,
        unit: UNIT.money,
        chip: rent.chip,
        source_ids: rent.source_ids,
        as_of: rent.as_of,
        note: `The suburb median weekly rent for a ${REPORT_BEDROOMS}-bedroom flat times ${WEEKS}, from the rent section. The estimated short-stay income is ${ratio.toFixed(1)} times this.`,
      }),
    );
    const confidence = chosen.level ?? est.confidence_level;
    if (confidence) {
      figures.push(
        figure({
          key: "shortstay_confidence",
          label: "AirDNA's confidence in its own estimate",
          value: confidence,
          chip: "Estimated",
          source_ids: src,
          as_of,
          note: chosen.method === "own" ? "AirDNA's confidence is not High, so its figure is not used; ours is worked from the comparable listings." : undefined,
        }),
      );
    }

    const notes = [...SHORTSTAY_NOTES];
    if (chosen.method === "airdna_fallback") notes.unshift("There were no usable comparable listings to work our own estimate from, so this is AirDNA's own figure and it carries AirDNA's confidence.");
    if (chosen.few) notes.unshift("Few comparable listings: fewer than 5 established listings were found nearby, so this estimate rests on every nearby listing with income. Treat it as indicative.");
    if (chosen.method === "own" && chosen.selection.used.some((c) => !isStrongComp(c))) notes.push("Some listings in the table made less than a full year of income or have few reviews.");

    return {
      status: "ok",
      figures,
      payload: {
        method: chosen.method,
        method_text: method,
        bedrooms: REPORT_BEDROOMS,
        bathrooms: REPORT_BATHROOMS,
        assumed: true,
        confidence_level: est.confidence_level,
        confidence_score: est.confidence_score,
        total_comps: est.total_comps,
        comps_basis: chosen.selection.basis,
        strong_comps: chosen.selection.strong_count,
        few: chosen.few,
        annual_cents: annualCents,
        monthly_cents: Math.round(annualCents / 12),
        rent_annual_cents: rentAnnualCents,
        ratio: Math.round(ratio * 100) / 100,
        cutoff_ratio: CUTOFF_RATIO,
        comps: chosen.selection.used.map((c) => ({
          id: c.id,
          distance_m: c.distance_m,
          bedrooms: c.bedrooms,
          bathrooms: c.bathrooms,
          revenue_cents: c.revenue === null ? null : cents(c.revenue),
          reviews: c.reviews,
          strong: isStrongComp(c),
          link: c.url,
        })),
        notes,
        meta: { chip: "Estimated", source_ids: src, as_of },
      },
    };
  },
};

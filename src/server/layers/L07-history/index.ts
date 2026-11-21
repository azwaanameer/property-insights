// L07 History: how this suburb's prices and rents have moved. Valuer-General annual medians (2015 to the latest year) and Homes
// Victoria June-quarter rents. The 5- and 10-year growth rates are derived, so they are Estimated and name their method.
// They describe change that already happened. They are not a forecast and are never combined into a score (AD-5, AD-10).
import type { Figure } from "../../contracts/layer";
import { listPrices, listRents, RENT_SOURCE, VGV_SOURCE, type PriceRow } from "../../repos/series";
import { currentDataset } from "../../repos/datasets";
import type { LayerDef, LayerRunOutput } from "../types";
import { cagr, dollars, dwellingFamily, FAMILY, monthYear, otherFamily, yearsBefore, type Family } from "../shared/derive";
import { figure, gapFigure, joinNotes, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { annualFor, annualRows, isThinPrice, isThinRent, latestYear, priceThinNote, rentAt } from "../shared/suburb-data";

export const L07_SOURCE_IDS = [VGV_SOURCE, RENT_SOURCE];

function priceGrowth(family: Family, sal: string, rows: PriceRow[], as_of: string): { figures: Figure[]; found: boolean } {
  const noun = FAMILY[family].noun;
  const year = latestYear(rows, sal, family);
  const end = year === null ? null : annualFor(rows, sal, family, year);
  const figures: Figure[] = [];
  let found = false;
  for (const span of [5, 10]) {
    const start = year === null ? null : annualFor(rows, sal, family, year - span);
    const rate = cagr(start?.median_cents, end?.median_cents, span);
    const key = `${noun}_price_cagr_${span}y`;
    const label = `Median ${noun} price growth, ${span}-year annual rate`;
    if (rate === null || !start || !end) {
      figures.push(
        gapFigure({
          key,
          label,
          unit: UNIT.fraction,
          source_ids: [VGV_SOURCE],
          as_of,
          note: end ? `The Valuer-General has no ${noun} median for ${year! - span}, so the ${span}-year rate cannot be worked out.` : `The Valuer-General publishes no ${noun} medians for this suburb.`,
        }),
      );
      continue;
    }
    found = true;
    const carried = [start, end].find((r) => r.carried_forward);
    figures.push(
      figure({
        key,
        label,
        value: rate,
        unit: UNIT.fraction,
        chip: "Estimated",
        source_ids: [VGV_SOURCE],
        as_of,
        note: joinNotes(
          `Derived: (${year} median ${dollars(end.median_cents)} / ${year! - span} median ${dollars(start.median_cents)}) ^ (1/${span}) - 1, from calendar-year medians. Past change only.`,
          carried
            ? `${priceThinNote(carried, noun)} The rate is noisy.`
            : (isThinPrice(start) || isThinPrice(end)) && "An endpoint median rests on fewer than 10 sales, so the rate is noisy.",
        ),
      }),
    );
  }
  return { figures, found };
}

export const L07History: LayerDef = {
  layer_id: "L07-history",
  title: "History",
  tier: "free",
  source_ids: L07_SOURCE_IDS,
  dataset_ids: [VGV_SOURCE],
  teaser: "How prices and rents in this suburb have moved over the last five and ten years.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };
    const prices = await listPrices(db, [sal]);
    if (!prices) return { status: "gap", figures: [], payload: {}, message: "Valuer-General medians are not loaded." };

    const family = dwellingFamily(address);
    const def = FAMILY[family];
    const first = priceGrowth(family, sal, prices.rows, prices.as_of);
    const second = priceGrowth(otherFamily(family), sal, prices.rows, prices.as_of);
    const figures: Figure[] = [...first.figures, ...second.figures];
    let found = first.found || second.found;

    // Rent history: the June quarter of each year, for the size used in the yield.
    const rentDs = await currentDataset(db, RENT_SOURCE);
    const rentPoints: { period: string; median_weekly_rent_cents: number; lettings_count: number | null; low_count: boolean }[] = [];
    if (rentDs) {
      const dates = Array.from({ length: 11 }, (_, i) => yearsBefore(rentDs.as_of, 10 - i));
      const rents = await listRents(db, [sal], dates);
      const noun = `${def.primary_bedrooms}-bedroom ${def.rent_noun}`;
      const at = (date: string) => rentAt(rents?.rows ?? [], sal, family, def.primary_bedrooms, date);
      for (const d of dates) {
        const r = at(d);
        if (r) rentPoints.push({ period: r.period, median_weekly_rent_cents: r.median_weekly_rent_cents, lettings_count: r.lettings_count, low_count: isThinRent(r) });
      }
      const end = at(dates[10]);
      for (const span of [5, 10]) {
        const start = at(dates[10 - span]);
        const key = `rent_cagr_${span}y`;
        const label = `Median rent growth, ${noun}, ${span}-year annual rate`;
        const rate = cagr(start?.median_weekly_rent_cents, end?.median_weekly_rent_cents, span);
        if (rate === null || !start || !end) {
          figures.push(gapFigure({ key, label, unit: UNIT.fraction, source_ids: [RENT_SOURCE], as_of: rentDs.as_of, note: "Homes Victoria has no rent for this size of home in this suburb for both years, so the rate cannot be worked out." }));
          continue;
        }
        found = true;
        figures.push(
          figure({
            key,
            label,
            value: rate,
            unit: UNIT.fraction,
            chip: "Estimated",
            source_ids: [RENT_SOURCE],
            as_of: rentDs.as_of,
            note: joinNotes(
              `Derived: (year to ${monthYear(end.period)} median ${dollars(end.median_weekly_rent_cents)} a week / year to ${monthYear(start.period)} median ${dollars(start.median_weekly_rent_cents)}) ^ (1/${span}) - 1, from moving annual medians. Past change only.`,
              (isThinRent(start) || isThinRent(end)) && "An endpoint median rests on fewer than 10 lettings, so the rate is noisy.",
            ),
          }),
        );
      }
    } else {
      // No published rent dataset: say so with one gap figure rather than leaving the rent history out silently.
      figures.push(gapFigure({ key: "rent_growth", label: "Median rent growth", unit: UNIT.fraction, source_ids: [RENT_SOURCE], as_of: prices.as_of, note: "Homes Victoria rents are not loaded." }));
    }

    const series = (f: Family) =>
      annualRows(prices.rows, sal, f).map((r) => ({ year: Number(r.period.slice(0, 4)), median_cents: r.median_cents, low_count: isThinPrice(r) }));
    return {
      status: found ? "ok" : "gap",
      figures,
      payload: {
        sal_code: sal,
        dwelling_family: family,
        // The annual medians behind the growth rates, for the renderer to draw. Observed, from the Valuer-General.
        price_series: { unit: series("unit"), house: series("house") },
        price_series_meta: { chip: "Observed", source_ids: [VGV_SOURCE], as_of: prices.as_of, unit: UNIT.money },
        rent_series: { bedrooms: def.primary_bedrooms, dwelling: family, points: rentPoints },
        rent_series_meta: { chip: "Observed", source_ids: [RENT_SOURCE], as_of: rentDs?.as_of ?? null, unit: UNIT.weeklyRent },
      },
      message: found ? undefined : "There is no price or rent history for this suburb in the Valuer-General and Homes Victoria files.",
    };
  },
};

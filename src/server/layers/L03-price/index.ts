// L03 Price: what homes in this suburb sell for. Valuer-General Victoria medians, free layer.
// Medians and sales counts are Observed. A median resting on fewer than 10 sales stays, as Estimated with a "few sales" note.
// The year-on-year change is derived, so it is Estimated and says how. No forecast (AD-10).
import type { Figure } from "../../contracts/layer";
import { listPrices, VGV_SOURCE, type PriceRow } from "../../repos/series";
import type { LayerDef, LayerRunOutput } from "../types";
import { dollars, dwellingFamily, FAMILY, otherFamily, quarterLabel, relativeChange, type Family } from "../shared/derive";
import { figure, gapFigure, joinNotes, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { annualFor, isThinPrice, latestQuarter, latestYear, priceThinNote, priorYearQuarter } from "../shared/suburb-data";

export const L03_SOURCE_IDS = [VGV_SOURCE];

function familyFigures(family: Family, sal: string, rows: PriceRow[], as_of: string): { figures: Figure[]; found: boolean } {
  const noun = FAMILY[family].noun;
  const src = [VGV_SOURCE];
  const q = latestQuarter(rows, sal, family);
  if (!q) {
    return {
      found: false,
      figures: [
        gapFigure({
          key: `${noun}_median_price`,
          label: `Median ${noun} price`,
          unit: UNIT.money,
          source_ids: src,
          as_of,
          note: `The Valuer-General publishes no ${noun} median for this suburb: there were no recorded ${noun} sales, or too few to report.`,
        }),
      ],
    };
  }
  const thin = isThinPrice(q);
  const figures: Figure[] = [
    figure({
      key: `${noun}_median_price`,
      label: `Median ${noun} price (${quarterLabel(q.period)})`,
      value: q.median_cents,
      unit: UNIT.money,
      chip: thin ? "Estimated" : "Observed",
      source_ids: src,
      as_of,
      note: joinNotes(priceThinNote(q, noun), `Valuer-General locality "${q.source_name ?? "unknown"}", matched to the ABS suburb by name (${q.sal_match_type}).`),
    }),
  ];
  if (q.sales_count !== null) {
    figures.push(figure({ key: `${noun}_sales_count`, label: `${noun[0].toUpperCase()}${noun.slice(1)} sales in the ${quarterLabel(q.period)}`, value: q.sales_count, unit: UNIT.count, chip: "Observed", source_ids: src, as_of }));
  }
  const prior = priorYearQuarter(rows, q);
  const change = prior ? relativeChange(q.median_cents, prior.median_cents) : null;
  if (prior && change !== null) {
    figures.push(
      figure({
        key: `${noun}_price_change_1y`,
        label: `Change in median ${noun} price, one year`,
        value: change,
        unit: UNIT.fraction,
        chip: "Estimated",
        source_ids: src,
        as_of,
        note: joinNotes(
          `Derived: the ${quarterLabel(q.period)} median (${dollars(q.median_cents)}) against the ${quarterLabel(prior.period)} median (${dollars(prior.median_cents)}). Past change only.`,
          (isThinPrice(q) || isThinPrice(prior)) && "One of the two medians rests on few sales, so the change is noisy.",
        ),
      }),
    );
  }
  const year = latestYear(rows, sal, family);
  const annual = year === null ? null : annualFor(rows, sal, family, year);
  if (annual) {
    const t = isThinPrice(annual);
    figures.push(
      figure({
        key: `${noun}_median_price_year`,
        label: `Median ${noun} price (calendar year ${year})`,
        value: annual.median_cents,
        unit: UNIT.money,
        chip: t ? "Estimated" : "Observed",
        source_ids: src,
        as_of,
        note: priceThinNote(annual, noun),
      }),
    );
  }
  return { figures, found: true };
}

export const L03Price: LayerDef = {
  layer_id: "L03-price",
  title: "Price",
  tier: "free",
  source_ids: L03_SOURCE_IDS,
  dataset_ids: [VGV_SOURCE],
  teaser: "What homes in this suburb have been selling for, from Valuer-General medians.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };
    const prices = await listPrices(db, [sal]);
    if (!prices) return { status: "gap", figures: [], payload: {}, message: "Valuer-General medians are not loaded." };

    const family = dwellingFamily(address);
    const first = familyFigures(family, sal, prices.rows, prices.as_of);
    const second = familyFigures(otherFamily(family), sal, prices.rows, prices.as_of);
    const found = first.found || second.found;
    return {
      status: found ? "ok" : "gap",
      figures: [...first.figures, ...second.figures],
      payload: { sal_code: sal, dwelling_family: family, latest_quarter: latestQuarter(prices.rows, sal, family)?.period ?? latestQuarter(prices.rows, sal, otherFamily(family))?.period ?? null },
      message: found ? undefined : "The Valuer-General publishes no unit or house median for this suburb, so there is no price to show.",
    };
  },
};

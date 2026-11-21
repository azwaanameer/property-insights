// L02 Rent: what a rental here earns. Homes Victoria moving annual median rents, free layer.
// Medians and lettings counts are Observed (Estimated, with a "few lettings" note, when under 10 lettings). Change and gross yield
// are derived, so they are Estimated and name their method. The yield mixes two sources whose geographies differ.
import type { Figure } from "../../contracts/layer";
import { listPrices, listRents, RENT_SOURCE, VGV_SOURCE } from "../../repos/series";
import type { LayerDef, LayerRunOutput } from "../types";
import { dollars, dwellingFamily, FAMILY, grossYield, monthYear, quarterLabel, relativeChange } from "../shared/derive";
import { figure, gapFigure, joinNotes, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { isThinPrice, isThinRent, latestQuarter, rentAt, rentPeriods } from "../shared/suburb-data";

export const L02_SOURCE_IDS = [RENT_SOURCE, VGV_SOURCE];

export const L02Rent: LayerDef = {
  layer_id: "L02-rent",
  title: "Rent",
  tier: "free",
  source_ids: L02_SOURCE_IDS,
  dataset_ids: [RENT_SOURCE],
  teaser: "What new tenants are paying in this suburb, and what that earns against the price.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };
    const rents = await listRents(db, [sal]);
    if (!rents) return { status: "gap", figures: [], payload: {}, message: "Homes Victoria rents are not loaded." };

    const family = dwellingFamily(address);
    const def = FAMILY[family];
    const periods = rentPeriods(rents.as_of);
    const src = [RENT_SOURCE];
    const as_of = rents.as_of;
    const figures: Figure[] = [];
    let found = false;
    let areaName: string | null = null;
    let matchType: string | null = null;

    for (const bedrooms of def.bedrooms) {
      const noun = `${bedrooms}-bedroom ${def.rent_noun}`;
      const key = `rent_${bedrooms}bed_${def.rent_noun}`;
      const now = rentAt(rents.rows, sal, family, bedrooms, periods.latest);
      if (!now) {
        // Only the size used for the yield gets a gap figure; a missing 1- or 3-bedroom size is simply not shown.
        if (bedrooms === def.primary_bedrooms) {
          figures.push(
            gapFigure({
              key,
              label: `Median weekly rent, ${noun}`,
              unit: UNIT.weeklyRent,
              source_ids: src,
              as_of,
              note: "Homes Victoria publishes no rent for this size of home in this suburb, or reports the suburb only as part of a larger area.",
            }),
          );
        }
        continue;
      }
      found = true;
      areaName ??= now.source_name;
      matchType ??= now.sal_match_type;
      const thin = isThinRent(now);
      const thinNote = thin ? `Few lettings: this median rests on ${now.lettings_count ?? "fewer than 10"} new lettings, so treat it as indicative.` : undefined;
      figures.push(
        figure({
          key,
          label: `Median weekly rent, ${noun}`,
          value: now.median_weekly_rent_cents,
          unit: UNIT.weeklyRent,
          chip: thin ? "Estimated" : "Observed",
          source_ids: src,
          as_of,
          note: joinNotes(
            thinNote,
            `Moving annual median: leases that began in the year to ${monthYear(now.period)}. Homes Victoria area "${now.source_name ?? "unknown"}", matched to the ABS suburb by name (${now.sal_match_type}).`,
          ),
        }),
      );
      if (now.lettings_count !== null) {
        figures.push(figure({ key: `${key}_lettings`, label: `New lettings, ${noun}`, value: now.lettings_count, unit: UNIT.count, chip: "Observed", source_ids: src, as_of, note: `Leases that began in the year to ${monthYear(now.period)}.` }));
      }
      const before = rentAt(rents.rows, sal, family, bedrooms, periods.yearAgo);
      const change = before ? relativeChange(now.median_weekly_rent_cents, before.median_weekly_rent_cents) : null;
      if (before && change !== null) {
        figures.push(
          figure({
            key: `${key}_change_1y`,
            label: `Change in median rent, ${noun}, one year`,
            value: change,
            unit: UNIT.fraction,
            chip: "Estimated",
            source_ids: src,
            as_of,
            note: joinNotes(
              `Derived: the year to ${monthYear(now.period)} median (${dollars(now.median_weekly_rent_cents)} a week) against the year to ${monthYear(before.period)} (${dollars(before.median_weekly_rent_cents)} a week). Past change only.`,
              (thin || isThinRent(before)) && "One of the two medians rests on few lettings, so the change is noisy.",
            ),
          }),
        );
      }
    }

    // Gross yield: the primary size's weekly rent x 52 over the suburb's median price for the dwelling kind (Valuer-General, latest quarter).
    const prices = await listPrices(db, [sal]);
    const q = prices ? latestQuarter(prices.rows, sal, family) : null;
    const primary = rentAt(rents.rows, sal, family, def.primary_bedrooms, periods.latest);
    const yieldValue = primary && q ? grossYield(primary.median_weekly_rent_cents, q.median_cents) : null;
    if (primary && q && yieldValue !== null && prices) {
      figures.push(
        figure({
          key: "gross_yield",
          label: `Gross yield, ${def.primary_bedrooms}-bedroom ${def.rent_noun}`,
          value: yieldValue,
          unit: UNIT.fraction,
          chip: "Estimated",
          source_ids: [RENT_SOURCE, VGV_SOURCE],
          as_of: rents.as_of < prices.as_of ? rents.as_of : prices.as_of,
          note: joinNotes(
            `Derived: median weekly rent for ${def.primary_bedrooms}-bedroom ${def.rent_noun}s (${dollars(primary.median_weekly_rent_cents)}) x 52, divided by the ${def.noun} median price for the ${quarterLabel(q.period)} (${dollars(q.median_cents)}).`,
            "The rent and the price come from different files and different groups of homes (lettings of one size in a Homes Victoria area, against all sales in the ABS suburb), so treat the yield as indicative.",
            (isThinRent(primary) || isThinPrice(q)) && "One input rests on few sales or lettings.",
          ),
        }),
      );
    } else if (found) {
      figures.push(
        gapFigure({
          key: "gross_yield",
          label: `Gross yield, ${def.primary_bedrooms}-bedroom ${def.rent_noun}`,
          unit: UNIT.fraction,
          source_ids: [RENT_SOURCE, VGV_SOURCE],
          as_of: rents.as_of,
          note: !primary
            ? "No rent for the size used in the yield."
            : !prices
              ? "Valuer-General medians are not loaded."
              : "The Valuer-General publishes no median price for this kind of home in this suburb, so a yield cannot be worked out.",
        }),
      );
    }

    return {
      status: found ? "ok" : "gap",
      figures,
      payload: { sal_code: sal, dwelling_family: family, rent_area: areaName, rent_area_match_type: matchType, period: periods.latest },
      message: found ? undefined : "Homes Victoria publishes no rent for this suburb, or reports it only as part of a larger area. See the suburb comparison for nearby suburbs.",
    };
  },
};

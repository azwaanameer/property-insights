// L10 Screener: where else could you invest, among the suburbs nearby. "Nearby" is within two suburb boundaries (the G-NAF locality
// neighbour table), so the list is built only from data already loaded. Each suburb shows the Valuer-General median price, the Homes
// Victoria median rent and the gross yield between them. Gross yield is before every cost. A suburb is left out when it lacks a price or
// a rent of its own: Homes Victoria publishes some rents for an area that groups several suburbs, and a grouped area is not matched to
// any one suburb. The conditions rating is shown only where market_validation says it has passed its test (AD-5). The list is ordered by
// gross yield, one measure on its own; it is not a ranking of where to buy and it adds nothing together.
import type { Figure } from "../../contracts/layer";
import { currentDataset } from "../../repos/datasets";
import { listRatings } from "../../repos/rating";
import { listYieldInputs } from "../../repos/screener";
import { RENT_SOURCE, VGV_SOURCE } from "../../repos/series";
import { getMarketValidation } from "../../repos/source";
import { CENSUS_SOURCE, listNearbySuburbs, NEIGHBOUR_SOURCE, SUBURB_SOURCE } from "../../repos/suburb";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily, FAMILY, grossYield } from "../shared/derive";
import { figure, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { isThinPrice, isThinRent } from "../shared/suburb-data";
import { FIFTH_LABELS, RATING_LABEL } from "../L15-conditions";

export const L10_SOURCE_IDS = [NEIGHBOUR_SOURCE, SUBURB_SOURCE, VGV_SOURCE, RENT_SOURCE, CENSUS_SOURCE, "conditions_rating"];

/** Suburbs listed under the one being reported (the highest gross yields of the suburbs nearby that have both a price and a rent). */
export const MAX_LISTED = 15;
/** A ceiling on the suburbs read from the adjacency table, far above any real count (about a hundred within two boundaries). */
const MAX_CANDIDATES = 2_000;

export const SCREENER_NOTE =
  "Gross yield is median weekly rent x 52 / median price, before rates, fees, insurance, vacancy and every other cost. Rent comes from Homes Victoria areas: where an area groups several suburbs it is not matched to any one of them, and those suburbs are left out. Suburbs whose price or rent rests on few sales or lettings (marked *) come after the others; within each group the list is ordered by gross yield alone. It is not a ranking of where to buy and nothing is added together.";

export const L10Screener: LayerDef = {
  layer_id: "L10-screener",
  title: "Screener",
  tier: "free",
  source_ids: L10_SOURCE_IDS,
  dataset_ids: [NEIGHBOUR_SOURCE, SUBURB_SOURCE, VGV_SOURCE, RENT_SOURCE],
  teaser: "Nearby suburbs side by side: price, rent and gross yield.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };

    const nearby = await listNearbySuburbs(db, sal, MAX_CANDIDATES);
    if (!nearby) return { status: "gap", figures: [], payload: {}, message: "Suburb adjacency is not loaded." };
    if (nearby.rows.length === 0) {
      return { status: "gap", figures: [], payload: { sal_code: sal, nearby_count: 0 }, message: "No nearby suburbs are recorded for this suburb, so there is nothing to screen." };
    }
    const family = dwellingFamily(address);
    const def = FAMILY[family];
    const sals = [sal, ...nearby.rows.map((n) => n.sal_code)];
    const inputs = await listYieldInputs(db, sals, def.dwelling, def.primary_bedrooms);
    if (!inputs) return { status: "gap", figures: [], payload: {}, message: "A dataset the screener needs is not loaded." };

    // AD-5: the rating column exists only where the rating has passed its test, and only for the suburbs that were rated.
    const validation = await getMarketValidation(db, address.state, family);
    const validated = validation?.status === "validated" && validation.pairwise_score_low !== null && validation.pairwise_score_high !== null;
    const rated = validated ? await listRatings(db, sals, family) : null;

    const yieldAsOf = inputs.prices_as_of < inputs.rents_as_of ? inputs.prices_as_of : inputs.rents_as_of;
    const nameOf = new Map([[sal, address.sal_name ?? sal], ...nearby.rows.map((n) => [n.sal_code, n.name] as const)]);
    const hopsOf = new Map(nearby.rows.map((n) => [n.sal_code, n.hops]));
    const rows = inputs.rows
      .map((r) => {
        const y = grossYield(r.rent_weekly_cents, r.price_cents);
        const rating = rated?.ratings.get(r.sal_code);
        const thin: string[] = [];
        if (isThinPrice({ low_count: r.price_low_count, carried_forward: r.price_carried_forward, sales_count: r.sales_count })) thin.push("price_cents", "gross_yield");
        if (isThinRent({ low_count: r.rent_low_count, lettings_count: r.lettings_count })) thin.push("rent_weekly_cents", ...(thin.includes("gross_yield") ? [] : ["gross_yield"]));
        return {
          sal_code: r.sal_code,
          name: nameOf.get(r.sal_code) ?? r.sal_code,
          is_subject: r.sal_code === sal,
          hops: r.sal_code === sal ? 0 : (hopsOf.get(r.sal_code) ?? 2),
          values: { price_cents: r.price_cents, rent_weekly_cents: r.rent_weekly_cents, gross_yield: y },
          thin,
          conditions: validated ? (rating ? { fifth: rating.fifth, label: FIFTH_LABELS[rating.fifth - 1], position: rating.position, of: rating.of } : null) : undefined,
        };
      })
      .filter((r) => r.values.gross_yield !== null);
    const subject = rows.find((r) => r.is_subject) ?? null;
    // Solid rows first, then those resting on a thin sample; each group by gross yield, highest first.
    const others = rows
      .filter((r) => !r.is_subject)
      .sort((a, b) => Number(a.thin.length > 0) - Number(b.thin.length > 0) || (b.values.gross_yield ?? 0) - (a.values.gross_yield ?? 0) || a.name.localeCompare(b.name));
    const shown = others.slice(0, MAX_LISTED);
    if (shown.length === 0) {
      return {
        status: "gap",
        figures: [],
        payload: { sal_code: sal, nearby_count: nearby.total },
        message: "None of the nearby suburbs has both a published median price and a median rent of its own, so there is nothing to put side by side.",
      };
    }

    const figures: Figure[] = [
      figure({
        key: "nearby_suburbs",
        label: "Suburbs within two boundaries",
        value: nearby.total,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: [NEIGHBOUR_SOURCE, SUBURB_SOURCE],
        as_of: nearby.as_of,
        note: `Suburbs that share a boundary with this one, or with one that does, in the G-NAF locality neighbour table, matched to ABS suburbs by name.${nearby.total > nearby.rows.length ? ` Only the first ${nearby.rows.length} were screened.` : ""}`,
      }),
      figure({
        key: "suburbs_with_price_and_rent",
        label: `Of those, suburbs with a median ${def.noun} price and a rent`,
        value: others.length,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: [VGV_SOURCE, RENT_SOURCE],
        as_of: yieldAsOf,
        note: `Counted: the suburbs left out have no ${def.noun} median from the Valuer-General or no rent of their own from Homes Victoria. ${others.length > shown.length ? `The first ${shown.length} are listed: solid figures first, then by gross yield.` : "All are listed."}`,
      }),
    ];

    const columns = [
      { key: "price_cents", label: `Median ${def.noun} price`, unit: UNIT.money, chip: "Observed", source_ids: [VGV_SOURCE], as_of: inputs.prices_as_of, note: "Valuer-General median for the latest quarter." },
      { key: "rent_weekly_cents", label: `Median weekly rent, ${def.primary_bedrooms}-bedroom ${def.rent_noun}`, unit: UNIT.weeklyRent, chip: "Observed", source_ids: [RENT_SOURCE], as_of: inputs.rents_as_of, note: "Homes Victoria moving annual median." },
      { key: "gross_yield", label: "Gross yield, before costs", unit: UNIT.fraction, chip: "Estimated", source_ids: [RENT_SOURCE, VGV_SOURCE], as_of: yieldAsOf, note: "Derived: weekly rent x 52 / median price." },
    ];
    const ratingMeta = validated && rated ? { label: RATING_LABEL, chip: "Estimated", source_ids: ["conditions_rating", CENSUS_SOURCE, VGV_SOURCE], as_of: rated.as_of } : null;
    return {
      status: "ok",
      figures,
      payload: {
        sal_code: sal,
        dwelling_family: family,
        nearby_count: nearby.total,
        screened_count: others.length,
        note: SCREENER_NOTE,
        table: {
          columns,
          rating_column: ratingMeta,
          rows: [...(subject ? [subject] : []), ...shown],
        },
      },
    };
  },
};

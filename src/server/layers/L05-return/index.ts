// L05 Return: what a rental here could earn, with a calculator the reader sets. Free layer.
// The layer supplies the suburb medians as starting values and says where each one came from; every other starting value is a round
// placeholder labelled "placeholder, set your own". The calculator is an illustration of the reader's own numbers (AD-10): growth starts
// at 0%, and the suburb's past 5-year growth is shown as history only, never used as an input.
import { calcReturn, placeholderDefaults, RETURN_FIELDS, type ReturnInputKey } from "../../../calc/return";
import type { Figure } from "../../contracts/layer";
import { currentDataset } from "../../repos/datasets";
import { listPrices, listRents, RENT_SOURCE, VGV_SOURCE } from "../../repos/series";
import type { LayerDef, LayerRunOutput } from "../types";
import { dollars, dwellingFamily, FAMILY, quarterLabel, monthYear } from "../shared/derive";
import { figure, gapFigure, joinNotes, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { isThinPrice, isThinRent, latestQuarter, priceThinNote, rentAt, snapshot } from "../shared/suburb-data";

export const L05_SOURCE_IDS = [VGV_SOURCE, RENT_SOURCE];

export const PLACEHOLDER_BASIS = "placeholder, set your own";
export const CALCULATOR_LABEL = "An illustration with your own numbers, not a promise of what this home will earn or sell for.";

export const L05Return: LayerDef = {
  layer_id: "L05-return",
  title: "Return",
  tier: "free",
  source_ids: L05_SOURCE_IDS,
  dataset_ids: L05_SOURCE_IDS,
  teaser: "What a rental here could earn against the price, in a calculator you set yourself.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };

    const rentDs = await currentDataset(db, RENT_SOURCE);
    const [prices, rents] = await Promise.all([listPrices(db, [sal]), rentDs ? listRents(db, [sal], [rentDs.as_of]) : Promise.resolve(null)]);
    if (!prices || !rents) return { status: "gap", figures: [], payload: {}, message: "A dataset the calculator needs is not loaded." };

    const family = dwellingFamily(address);
    const def = FAMILY[family];
    const q = latestQuarter(prices.rows, sal, family);
    const rent = rentAt(rents.rows, sal, family, def.primary_bedrooms, rents.as_of);
    const rentNoun = `${def.primary_bedrooms}-bedroom ${def.rent_noun}`;
    if (!q && !rent) {
      return {
        status: "gap",
        figures: [],
        payload: { sal_code: sal, dwelling_family: family, needs_input: ["price", "rent"] },
        message: `Neither the Valuer-General nor Homes Victoria publishes a median ${def.noun} price or a rent for ${rentNoun}s in this suburb, so there is nothing to start the calculator from.`,
      };
    }

    const figures: Figure[] = [];
    const needs_input: ("price" | "rent")[] = [];

    if (q) {
      figures.push(
        figure({
          key: "median_price",
          label: `Median ${def.noun} price (${quarterLabel(q.period)})`,
          value: q.median_cents,
          unit: UNIT.money,
          chip: isThinPrice(q) ? "Estimated" : "Observed",
          source_ids: [VGV_SOURCE],
          as_of: prices.as_of,
          note: joinNotes(priceThinNote(q, def.noun), "The suburb median, not the price of this home."),
        }),
      );
    } else {
      needs_input.push("price");
      figures.push(
        gapFigure({ key: "median_price", label: `Median ${def.noun} price`, unit: UNIT.money, source_ids: [VGV_SOURCE], as_of: prices.as_of, note: `The Valuer-General publishes no ${def.noun} median for this suburb. Enter a price in the calculator.` }),
      );
    }

    if (rent) {
      const thin = isThinRent(rent);
      figures.push(
        figure({
          key: "weekly_rent",
          label: `Median weekly rent, ${rentNoun}`,
          value: rent.median_weekly_rent_cents,
          unit: UNIT.weeklyRent,
          chip: thin ? "Estimated" : "Observed",
          source_ids: [RENT_SOURCE],
          as_of: rents.as_of,
          note: joinNotes(
            thin && `Few lettings: this median rests on ${rent.lettings_count ?? "fewer than 10"} new lettings, so treat it as indicative.`,
            `The suburb median for leases that began in the year to ${monthYear(rent.period)}, not the rent of this home.`,
          ),
        }),
      );
    } else {
      needs_input.push("rent");
      figures.push(
        gapFigure({
          key: "weekly_rent",
          label: `Median weekly rent, ${rentNoun}`,
          unit: UNIT.weeklyRent,
          source_ids: [RENT_SOURCE],
          as_of: rents.as_of,
          note: "Homes Victoria publishes no rent for this size of home in this suburb, or reports the suburb only as part of a larger area. Enter a rent in the calculator.",
        }),
      );
    }

    const start = calcReturn({ price: q?.median_cents, weekly_rent: rent?.median_weekly_rent_cents });
    if (q && rent && start.gross_yield !== null) {
      figures.push(
        figure({
          key: "gross_yield",
          label: `Gross yield, ${rentNoun}`,
          value: start.gross_yield,
          unit: UNIT.fraction,
          chip: "Estimated",
          source_ids: [RENT_SOURCE, VGV_SOURCE],
          as_of: rents.as_of < prices.as_of ? rents.as_of : prices.as_of,
          note: joinNotes(
            `Derived: median weekly rent (${dollars(rent.median_weekly_rent_cents)}) x 52, divided by the ${def.noun} median price for the ${quarterLabel(q.period)} (${dollars(q.median_cents)}). Before any costs.`,
            "The rent and the price come from different files and different groups of homes, so treat the yield as indicative.",
            (isThinRent(rent) || isThinPrice(q)) && "One input rests on few sales or lettings.",
          ),
        }),
      );
    } else {
      figures.push(
        gapFigure({
          key: "gross_yield",
          label: `Gross yield, ${rentNoun}`,
          unit: UNIT.fraction,
          source_ids: [RENT_SOURCE, VGV_SOURCE],
          as_of: rents.as_of,
          note: `Needs both a price and a rent, and the ${!rent ? "rent" : "price"} is missing. Enter it in the calculator to see the yield.`,
        }),
      );
    }

    // History only: the calculator never reads this.
    const snap = snapshot(sal, family, prices.rows, rents.rows, rents.as_of);
    if (snap.price_cagr_5y !== null) {
      figures.push(
        figure({
          key: "price_cagr_5y",
          label: `Median ${def.noun} price growth, past 5-year annual rate (history only)`,
          value: snap.price_cagr_5y,
          unit: UNIT.fraction,
          chip: "Estimated",
          source_ids: [VGV_SOURCE],
          as_of: prices.as_of,
          note: "Derived from calendar-year medians. Past change only: the calculator does not use it, and its own growth starts at 0%.",
        }),
      );
    }

    const sourced: Partial<Record<ReturnInputKey, { default: number | null; basis: string }>> = {
      price: {
        default: q?.median_cents ?? null,
        basis: q ? `Valuer-General median ${def.noun} price for the ${quarterLabel(q.period)}, for the suburb, not this home` : "No median for this suburb: enter a price",
      },
      weekly_rent: {
        default: rent?.median_weekly_rent_cents ?? null,
        basis: rent ? `Homes Victoria median for ${rentNoun}s, year to ${monthYear(rent.period)}, for the suburb, not this home` : "No median for this suburb: enter a rent",
      },
    };
    const placeholders = placeholderDefaults(family);
    const inputs = RETURN_FIELDS.map((f) => {
      const s = sourced[f.key];
      return {
        key: f.key,
        label: f.label,
        unit: f.unit,
        ...(f.help ? { help: f.help } : {}),
        default: s ? s.default : placeholders[f.key as keyof typeof placeholders],
        basis: s ? s.basis : PLACEHOLDER_BASIS,
        placeholder: !s,
      };
    });

    return {
      status: "ok",
      figures,
      payload: {
        sal_code: sal,
        dwelling_family: family,
        needs_input,
        price_thin: snap.price_thin,
        rent_thin: snap.rent_thin,
        sales_count: snap.sales_count,
        lettings_count: snap.lettings_count,
        calculator: {
          label: CALCULATOR_LABEL,
          sources: [
            { key: "price", source_ids: [VGV_SOURCE], as_of: prices.as_of },
            { key: "weekly_rent", source_ids: [RENT_SOURCE], as_of: rents.as_of },
          ],
          inputs,
          history: { price_cagr_5y: snap.price_cagr_5y, source_ids: [VGV_SOURCE], as_of: prices.as_of },
        },
      },
    };
  },
};

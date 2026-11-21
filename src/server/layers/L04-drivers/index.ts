// L04 What makes an apartment's sale price higher or lower (layer id L04-drivers): the effect of bedrooms, bathrooms, a car space and the floor,
// and of the suburb, on the price apartments sold for, from a model fitted on the sold listings of every harvested suburb pooled
// (pipeline/derive/price-drivers.mjs; ordinary least squares on log sale price with suburb fixed effects). The model reads the loaded tables only.
// These are ASSOCIATIONS in past reported sales, not causes: the section says so beside the numbers, with the window and the number of sales.
// It gives no valuation or estimated price for this property and no forecast (AD-10). Layout medians appear only where a suburb has at least 20
// sales of that layout. The section is a gap for an address outside the harvested suburbs, for a house, and when nothing is loaded.
import type { Figure } from "../../contracts/layer";
import { DRIVERS_SOURCE, getDriverModel, listLayoutMedians, type DriverRow, type LayoutMedianRow } from "../../repos/drivers";
import { getSalesDataset, SALES_SOURCE } from "../../repos/sale";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily, roundFraction } from "../shared/derive";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { coverageMessage, MODEL_NOT_LOADED_MESSAGE, NOT_MATCHED_MESSAGE, REPORTED_BY, SALES_CREDIT, SALES_NOT_LOADED_MESSAGE } from "../shared/sold";

/** `gnaf` is listed because the suburb comes from the G-NAF address. */
export const L04_SOURCE_IDS = [SALES_SOURCE, DRIVERS_SOURCE, "gnaf"];
/** A suburb's layout median is shown only with at least this many sales of the layout (the build plane stores no thinner cell). */
export const MIN_LAYOUT_SALES = 20;

export const HOUSE_MESSAGE = "The price-driver model covers apartments only, and this address is a house, so no drivers are shown.";

/** The pooled drivers in the order shown, with how each is worded. */
export const DRIVER_LABELS: Record<string, string> = {
  bed_2: "Sale price difference, 2 bedrooms compared with 1",
  bed_3: "Sale price difference, 3 bedrooms compared with 1",
  bath_2plus: "Sale price difference, 2 or more bathrooms compared with 1",
  car_space: "Sale price difference, with a car space",
  floor_10_19: "Sale price difference, floors 10 to 19 compared with floors 1 to 9",
  floor_20_29: "Sale price difference, floors 20 to 29 compared with floors 1 to 9",
  floor_30plus: "Sale price difference, floor 30 and above compared with floors 1 to 9",
};
const ORDER = Object.keys(DRIVER_LABELS);

export const ASSOCIATION_NOTE =
  "These are associations in past reported sales, not causes. They do not say what a change would add to or take from the price of this property, and they leave out the building's quality, views, age, condition, aspect and the date of sale.";

const withCommas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "2 bed, 2 or more bath, with a car space" for a layout median row. "No car space" means the listing recorded zero; a sale with no parking count is not in any layout. */
export function layoutLabel(l: Pick<LayoutMedianRow, "beds" | "baths" | "has_car">): string {
  return `${l.beds} bed, ${l.baths === 2 ? "2 or more bath" : "1 bath"}, ${l.has_car ? "with a car space" : "no car space"}`;
}

const driverNote = (d: DriverRow) =>
  `Standard error ${d.se_pct.toFixed(1)} percentage points. ${withCommas(d.n_group)} of the ${withCommas(d.n_used)} sales used have this characteristic. An association in past reported sales with the other drivers and the suburb held fixed, not a cause.`;

export const L04Drivers: LayerDef = {
  layer_id: "L04-drivers",
  title: "Price drivers",
  tier: "free",
  source_ids: L04_SOURCE_IDS,
  teaser: "How apartment sale prices differ by bedrooms, bathrooms, car space, floor and suburb, as associations in past sales.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sales = await getSalesDataset(db);
    if (!sales) return { status: "gap", figures: [], payload: {}, message: SALES_NOT_LOADED_MESSAGE };
    if (address.state !== "VIC") return { status: "gap", figures: [], payload: {}, message: coverageMessage(sales) };
    if (!address.sal_code) return { status: "gap", figures: [], payload: {}, message: NOT_MATCHED_MESSAGE };
    if (!sales.suburbs.some((s) => s.sal_code === address.sal_code)) return { status: "gap", figures: [], payload: {}, message: coverageMessage(sales) };
    if (dwellingFamily(address) === "house") return { status: "gap", figures: [], payload: {}, message: HOUSE_MESSAGE };
    const model = await getDriverModel(db);
    if (!model) return { status: "gap", figures: [], payload: {}, message: MODEL_NOT_LOADED_MESSAGE };

    const src = [SALES_SOURCE, DRIVERS_SOURCE];
    const as_of = model.as_of;
    const pooled = ORDER.map((k) => model.drivers.find((d) => d.driver === k)).filter((d): d is DriverRow => !!d);
    const fit = model.drivers[0];
    if (pooled.length === 0 || !fit) return { status: "gap", figures: [], payload: {}, message: MODEL_NOT_LOADED_MESSAGE };

    const figures: Figure[] = pooled.map((d) =>
      figure({ key: `effect_${d.driver}`, label: DRIVER_LABELS[d.driver], value: roundFraction(d.effect_pct / 100), unit: UNIT.fraction, chip: "Estimated", source_ids: src, as_of, note: driverNote(d) }),
    );

    // This address's suburb against the reference suburb. The reference suburb has no effect of its own; a suburb the model could not carry says so.
    const reference = model.drivers.find((d) => d.is_reference) ?? null;
    const mine = model.drivers.find((d) => d.sal_code === address.sal_code) ?? null;
    const suburbName = mine?.suburb_name ?? sales.suburbs.find((s) => s.sal_code === address.sal_code)?.name ?? address.locality;
    let suburb: Record<string, unknown>;
    if (mine && !mine.is_reference && reference) {
      figures.push(
        figure({
          key: "effect_suburb",
          label: `Sale price difference, ${suburbName} compared with ${reference.suburb_name}`,
          value: roundFraction(mine.effect_pct / 100),
          unit: UNIT.fraction,
          chip: "Estimated",
          source_ids: src,
          as_of,
          note: `Standard error ${mine.se_pct.toFixed(1)} percentage points, from ${withCommas(mine.n_group)} sales in ${suburbName}. The same bedrooms, bathrooms, car space and floor in each suburb; an association, not a cause.`,
        }),
      );
      suburb = { name: suburbName, sal_code: address.sal_code, reference: reference.suburb_name, is_reference: false, effect_pct: mine.effect_pct, se_pct: mine.se_pct, n: mine.n_group };
    } else if (mine?.is_reference) {
      suburb = { name: suburbName, sal_code: address.sal_code, reference: reference?.suburb_name ?? suburbName, is_reference: true, effect_pct: 0, se_pct: 0, n: mine.n_group };
    } else {
      figures.push(
        gapFigure({
          key: "effect_suburb",
          label: `Sale price difference, ${suburbName} compared with ${reference?.suburb_name ?? "the reference suburb"}`,
          source_ids: src,
          as_of,
          note: `${suburbName} has fewer than 20 usable apartment sales (a tower unit number, a price between $150,000 and $2,500,000), so the model gives it no effect of its own.`,
        }),
      );
      suburb = { name: suburbName, sal_code: address.sal_code, reference: reference?.suburb_name ?? null, is_reference: false, effect_pct: null, se_pct: null, n: null };
    }

    figures.push(
      figure({
        key: "sales_used",
        label: "Sales behind these effects",
        value: fit.n_used,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: src,
        as_of,
        note: `Used ${withCommas(fit.n_used)} of ${withCommas(fit.n_total)} apartment sales reported as sold ${fit.window_from} to ${fit.window_to}. A sale is left out when its unit number has fewer than three digits (the floor comes from the unit number), its price is outside $150,000 to $2,500,000, the listing gave no parking count, or its suburb has fewer than 20 usable sales.`,
      }),
    );

    const layouts = (await listLayoutMedians(db, address.sal_code)).filter((l) => l.n >= MIN_LAYOUT_SALES);
    const notes = [
      ASSOCIATION_NOTE,
      `Based on ${withCommas(fit.n_used)} of ${withCommas(fit.n_total)} apartment sales as reported on ${REPORTED_BY}, sold ${fit.window_from} to ${fit.window_to}, across ${sales.suburbs.length} suburbs. Each effect holds the other drivers and the suburb fixed. The typical unexplained spread in a sale price is about ${Math.round(fit.residual_pct)}%.`,
      "The standard error is in percentage points, on the same scale as the difference in sale price beside it. The floor is read from the unit number (2105 is floor 21), which not every building follows.",
      layouts.length > 0
        ? `Layout medians are the middle reported sale price of apartments of that layout in ${suburbName} ("no car space" means the listing recorded none; a sale with no parking count is left out), shown only where the suburb has at least ${MIN_LAYOUT_SALES} such sales. They describe past sales, not this property.`
        : `No layout has ${MIN_LAYOUT_SALES} or more reported sales in ${suburbName}, so no layout median is shown.`,
    ];
    return {
      status: "ok",
      figures,
      payload: {
        drivers: pooled.map((d) => ({ key: d.driver, label: DRIVER_LABELS[d.driver], effect_pct: d.effect_pct, se_pct: d.se_pct, n_group: d.n_group, n_used: d.n_used })),
        suburb,
        layouts: layouts.map((l) => ({ beds: l.beds, baths: l.baths, has_car: l.has_car, label: layoutLabel(l), median_cents: l.median_price * 100, n: l.n })),
        model: {
          n_used: fit.n_used,
          n_total: fit.n_total,
          window_from: fit.window_from,
          window_to: fit.window_to,
          suburbs: sales.suburbs.length,
          reference: reference?.suburb_name ?? null,
          r_squared: fit.r_squared,
          residual_pct: fit.residual_pct,
        },
        notes,
        association: true,
        credit: SALES_CREDIT,
        meta: { chip: "Estimated", source_ids: src, as_of },
      },
    };
  },
};

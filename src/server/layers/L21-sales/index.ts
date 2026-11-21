// L21 Reported recent sales (layer id L21-sales): sales of homes in the same building (an apartment) or on the same street (a house), most
// recent first, up to 8, from the sold listings loaded as a dataset (pipeline/ingest/rp-sold.mjs; no call to the listing site is made at request
// time). Every sale is shown as REPORTED by realestate.com.au (AD-11): its sale date, price, bedrooms, bathrooms, car spaces, address and a link
// to its listing page, never as verified and never as a Victorian title record. A field the listing did not give is "not listed". There is no
// valuation or estimated price for this property, no forecast (AD-10), and no agent, agency or phone data anywhere.
// The section is a gap for an address outside the harvested suburbs, a building or street with no sale in the dataset, and when no dataset is loaded.
import type { Figure } from "../../contracts/layer";
import { BUILDING_TYPES, getSalesDataset, listBuildingSales, listStreetSales, SALES_SOURCE, STREET_TYPES, type ReportedSale } from "../../repos/sale";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily } from "../shared/derive";
import { figure, UNIT } from "../shared/figures";
import { coverageMessage, listingLink, NOT_MATCHED_MESSAGE, REPORTED_BY, SALES_CREDIT, SALES_NOT_LOADED_MESSAGE } from "../shared/sold";
import { suburbKey } from "../shared/suburb-key";

/** `gnaf` is listed because the building and street come from the G-NAF address. */
export const L21_SOURCE_IDS = [SALES_SOURCE, "gnaf"];
/** The most sales shown. */
export const MAX_SALES = 8;

export const NO_BUILDING_MESSAGE = "This address is not matched to a building, so sales in the same building cannot be listed.";
export const NO_STREET_MESSAGE = "This address has no street name, so sales on the same street cannot be listed.";

export const SCOPE_NOTES = [
  "Each sale is a listing-site record as reported on realestate.com.au. It is not checked, and it is not a Victorian title record. The price, date and details are as that site gave them.",
];

const noSaleMessage = (scope: "building" | "street", where: string, from: string, to: string, suburbs: number) =>
  `No sale ${scope === "building" ? "in this building" : `on ${where}`} is in the reported sales dataset (${suburbs} suburbs, sold ${from} to ${to}). That does not mean none happened: the dataset holds only the sales its listings gave.`;

/** One sale as the section shows it. Money is integer cents; a count the listing did not give is null ("not listed"). */
function shape(s: ReportedSale) {
  return {
    listing_id: s.listing_id,
    sold_on: s.sold_on,
    price_cents: s.price_aud * 100,
    address: s.address_text,
    bed: s.bed,
    bath: s.bath,
    park: s.park,
    property_type: s.property_type,
    reported_by: REPORTED_BY,
    link: listingLink(s.url),
  };
}

export const L21Sales: LayerDef = {
  layer_id: "L21-sales",
  title: "Reported recent sales",
  tier: "free",
  source_ids: L21_SOURCE_IDS,
  teaser: "Recent sales of homes in the same building or on the same street, as reported by listing sites.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const dataset = await getSalesDataset(db);
    if (!dataset) return { status: "gap", figures: [], payload: {}, message: SALES_NOT_LOADED_MESSAGE };
    if (address.state !== "VIC" || !address.sal_code) {
      return { status: "gap", figures: [], payload: {}, message: address.state !== "VIC" ? coverageMessage(dataset) : NOT_MATCHED_MESSAGE };
    }
    if (!dataset.suburbs.some((s) => s.sal_code === address.sal_code)) return { status: "gap", figures: [], payload: {}, message: coverageMessage(dataset) };

    const scope = dwellingFamily(address) === "unit" ? "building" : "street";
    let found: { total: number; rows: ReportedSale[] };
    let where = "";
    if (scope === "building") {
      if (!address.building_id) return { status: "gap", figures: [], payload: {}, message: NO_BUILDING_MESSAGE };
      found = await listBuildingSales(db, address.building_id, BUILDING_TYPES, MAX_SALES);
      where = address.building_name ?? address.display_address;
    } else {
      if (!address.street || !address.postcode) return { status: "gap", figures: [], payload: {}, message: NO_STREET_MESSAGE };
      // The street key is the street as the build plane writes it: upper case, apostrophes and full stops dropped, other punctuation a space.
      const street_key = suburbKey(address.street).toUpperCase();
      found = await listStreetSales(db, { street_key, suburb_key: suburbKey(address.locality), postcode: address.postcode }, STREET_TYPES, MAX_SALES);
      where = address.street;
    }
    if (found.total === 0) {
      return { status: "gap", figures: [], payload: {}, message: noSaleMessage(scope, where, dataset.window_from, dataset.window_to, dataset.suburbs.length) };
    }

    const sales = found.rows.map(shape);
    const src = [SALES_SOURCE];
    const newest = found.rows[0];
    const figures: Figure[] = [
      figure({
        key: "reported_sales_count",
        label: scope === "building" ? "Reported sales in this building" : "Reported sales on this street",
        value: found.total,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: src,
        as_of: dataset.as_of,
        note: `Counted from the sold listings in the dataset (sold ${dataset.window_from} to ${dataset.window_to}), as reported on ${REPORTED_BY}. Not a title record.`,
      }),
      figure({
        key: "latest_reported_sale",
        label: "Most recent reported sale",
        value: newest.price_aud * 100,
        unit: UNIT.money,
        chip: "Estimated",
        source_ids: src,
        as_of: dataset.as_of,
        note: `Sold ${newest.sold_on}: ${newest.address_text}, as reported on ${REPORTED_BY}. Not checked, and not a title record.`,
      }),
    ];

    const notes = [...SCOPE_NOTES];
    if (found.total > sales.length) notes.push(`Showing the ${sales.length} most recent of ${found.total} reported sales ${scope === "building" ? "in this building" : `on ${where}`}.`);
    if (scope === "street") notes.push("Sales on this street are houses, townhouses and villas as listed; apartments are not included.");
    return {
      status: "ok",
      figures,
      payload: {
        scope,
        place: scope === "building" ? { building: address.building_name, address: address.display_address } : { street: address.street, suburb: address.locality },
        total: found.total,
        shown: sales.length,
        sales,
        window: { from: dataset.window_from, to: dataset.window_to },
        harvested_on: dataset.as_of,
        suburbs: dataset.suburbs.length,
        notes,
        credit: SALES_CREDIT,
        meta: { chip: "Estimated", source_ids: src, as_of: dataset.as_of },
      },
    };
  },
};

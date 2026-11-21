// Wording and helpers the two sold-listings sections (L21 reported sales, L04 price drivers) share. Both read data harvested from realestate.com.au
// listings: it is always "as reported", never verified, and never a Victorian title record (AD-11).
import type { SalesDataset } from "../../repos/sale";

/** The credit the source row carries (migration 0011) and every section shows. */
export const SALES_CREDIT = "Recent sales as reported on realestate.com.au listings, retrieved by VicProp.";
export const REPORTED_BY = "realestate.com.au";
/** A listing's stored `url` is a path on this site. */
export const LISTING_BASE = "https://www.realestate.com.au/";

export const SALES_NOT_LOADED_MESSAGE = "Reported sales are not loaded.";
export const MODEL_NOT_LOADED_MESSAGE = "The price-driver model is not loaded.";
export const NOT_MATCHED_MESSAGE = "The suburb of this address could not be matched to one ABS suburb, so reported sales are not shown.";

/** The full link to a listing page. The path is encoded so a space or odd character cannot break the link. */
export function listingLink(url: string): string {
  return `${LISTING_BASE}${encodeURI(url)}`;
}

/** The honest gap for an address outside the harvested suburbs: it names how many suburbs the dataset covers, and which. */
export function coverageMessage(dataset: SalesDataset): string {
  const names = dataset.suburbs.map((s) => s.name);
  return `Reported sales are loaded for ${names.length} suburbs only (${names.join(", ")}), and this address is not in one of them.`;
}

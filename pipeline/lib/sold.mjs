// Pure helpers for the reported-sales pipeline (rp-sold.mjs loads the sales, derive/price-drivers.mjs fits the model on them).
// The price and floor parsing is the parsing of scripts/23-price-drivers.mjs, copied exactly so the model reads a listing the way the
// 2026-11-11 analysis did. Nothing here touches a database or a file.
import { normName } from "./normalise.mjs";

/** A listing's stored `url` is a path on this site; the report links to BASE + url. */
export const REA_BASE = "https://www.realestate.com.au/";

/** Dwelling types the model treats as an apartment (the script's /apartment|unit|flat/ without "unitblock"). */
export const APARTMENT_TYPES = new Set(["apartment", "unit", "flat"]);
/** Types the report treats as apartment-like when it looks for sales in a building (a studio is one too). */
export const BUILDING_TYPES = ["apartment", "unit", "flat", "studio"];
/** Types the report treats as a house when it looks for sales on a street. */
export const STREET_TYPES = ["house", "townhouse", "villa", "duplex/semi-detached"];

/** "$560,000" -> 560000. The first number in the text, as the script read it; null when there is none. */
export function parsePrice(s) {
  const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * The floor of a tower apartment from its unit number: "2105/628 Flinders Street" -> 21. Only a number of at least three digits (with at most
 * one trailing letter, "303B") counts: a unit "12/30 Foo Street" has no floor. The unit number is the one parseSaleAddress reads, so a prefix
 * such as "Apt 514/", "Unit 103/" or "M-City 815/" is handled the same way in both. Null when there is no such number.
 */
export function floorOf(address) {
  const unit = parseSaleAddress(address)?.unit_no;
  const m = /^(\d{3,})[A-Z]?$/.exec(unit ?? "");
  return m ? Math.floor(+m[1] / 100) : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "10 Nov 2026" -> "2026-11-10". Null for anything that is not a real calendar date. */
export function parseSoldDate(s) {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** The street types of G-NAF, spelled out. Listings often abbreviate the last word of the street ("Flinders St"). */
const TYPE_WORD = {
  ST: "STREET", RD: "ROAD", AVE: "AVENUE", AV: "AVENUE", DR: "DRIVE", CT: "COURT", PL: "PLACE", CRES: "CRESCENT",
  HWY: "HIGHWAY", PDE: "PARADE", BLVD: "BOULEVARD", BVD: "BOULEVARD", TCE: "TERRACE", LN: "LANE", CL: "CLOSE", GR: "GROVE",
  CCT: "CIRCUIT", ESP: "ESPLANADE", PKWY: "PARKWAY", SQ: "SQUARE", WY: "WAY", GDNS: "GARDENS",
};

/** The normalised street of an address's street text: upper case, no apostrophes, the last word's abbreviation spelled out, "MT" as "MOUNT". */
export function streetKeyOf(text) {
  const tokens = normName(text).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length > 1) {
    const last = tokens.length - 1;
    if (TYPE_WORD[tokens[last]]) tokens[last] = TYPE_WORD[tokens[last]];
    if (tokens[0] === "MT") tokens[0] = "MOUNT";
  }
  return tokens.join(" ");
}

const UNIT_WORDS = /^(?:unit|apt|apartment|suite|flat|shop|lot|villa|townhouse|level)\s+/i;

/**
 * A listing address -> { unit_no, street_no, street_key }, or null when no street number followed by a street can be read.
 *   "2105/628 Flinders Street"          unit 2105, number 628, street FLINDERS STREET
 *   "Apt 1406/265 Exhibition Street"    unit 1406
 *   "G04/74 Queens Road"                unit G04
 *   "403/11-17 Cohen Place"             number 11-17
 *   "Penthouse, 101 River Street"       no unit, number 101
 *   "14 Elizabeth Court"                no unit
 * The street number keeps a range as "11-17" and a letter as "19A".
 */
export function parseSaleAddress(address) {
  let rest = String(address ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return null;
  let unit = null;
  const comma = rest.indexOf(",");
  if (comma >= 0) {
    const lead = rest.slice(0, comma).trim();
    rest = rest.slice(comma + 1).trim();
    const m = /^(?:unit|apt|apartment|suite|flat|shop|villa|townhouse)\s+(\S+)$/i.exec(lead);
    if (m) unit = m[1].toUpperCase();
  }
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    let u = rest.slice(0, slash).trim().replace(UNIT_WORDS, "");
    rest = rest.slice(slash + 1).trim();
    if (!/&/.test(u) && /\s/.test(u)) u = u.split(" ").at(-1);
    if (u) unit = u.toUpperCase();
  }
  const m = /^(\d+[A-Za-z]?)(?:\s*-\s*(\d+[A-Za-z]?))?\s+(.+)$/.exec(rest);
  if (!m) return null;
  const street_key = streetKeyOf(m[3]);
  if (!street_key) return null;
  return { unit_no: unit, street_no: m[2] ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : m[1].toUpperCase(), street_key };
}

/** "11-17" -> { first: "11", last: "17" }; "628" -> { first: "628", last: null }. */
export function splitStreetNo(streetNo) {
  const [first, last] = String(streetNo ?? "").split("-");
  return { first: first || null, last: last || null };
}

/** The median of a list of numbers (the mean of the two middle ones for an even count). Null for an empty list. */
export function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

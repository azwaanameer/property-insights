// Harvest recently sold apartments for the biggest rated Victorian apartment suburbs, through the RapidAPI realty-in-au wrapper.
// One-off dataset for the price-driver model (L04). Free plan: 500 calls a month, 30 listings a call, so this stops before the quota
// runs out and can be run again after the quota resets: suburbs already harvested are skipped and every call is cached on disk.
// Only property facts are kept: no agent, agency or phone fields.
// Run: node --env-file=<file holding RAPIDAPI_KEY> scripts/27-sold-harvest.mjs [maxCalls]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rp } from "./rp.mjs";

const OUT = "data/rp_sold_harvest.json";
const PRIORITY = JSON.parse(readFileSync("data/rp_suburb_priority.json", "utf8"));
// Already harvested by scripts/06-rp-harvest.mjs (newest 150 sales each).
const DONE_BEFORE = new Set(["Melbourne", "Southbank", "Docklands", "St Kilda", "South Yarra", "Port Melbourne"]);
const TARGET_LISTINGS = 225; // about 150 usable sales: a third of listings have no price shown or no unit number
const MAX_PAGES = 8;
const RESERVE = Number(process.env.RP_RESERVE ?? 25); // quota units left unspent (cached pages carry stale counters, so 0 is used to re-read the cache)
const maxCalls = Number(process.argv[2] ?? 1000);

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { retrieved: new Date().toISOString().slice(0, 10), suburbs: {} };
const isVic = (pc) => /^(3|8)\d{3}$/.test(String(pc ?? ""));
const pick = (x) => ({
  listingId: x.listingId,
  address: x.address?.streetAddress,
  suburb: x.address?.suburb,
  postcode: x.address?.postcode,
  lat: x.address?.location?.latitude,
  lon: x.address?.location?.longitude,
  price: x.price?.display,
  type: x.propertyType,
  bed: x.generalFeatures?.bedrooms?.value ?? x.features?.general?.bedrooms,
  bath: x.generalFeatures?.bathrooms?.value ?? x.features?.general?.bathrooms,
  park: x.generalFeatures?.parkingSpaces?.value ?? x.features?.general?.parkingSpaces,
  dateSold: x.dateSold?.display ?? x.dateSold,
  url: x.prettyUrl,
});

let calls = 0;
let remaining = null;
const save = () => writeFileSync(OUT, JSON.stringify(out));

for (const s of PRIORITY) {
  // Only finished suburbs are skipped: one that stopped on an error is tried again (its pages are cached, so the repeat is cheap).
  if (DONE_BEFORE.has(s.name) || ["ok", "mixed states"].includes(out.suburbs[s.name]?.status)) continue;
  const rows = [];
  let total = null;
  let status = "ok";
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (calls >= maxCalls || (remaining !== null && remaining <= RESERVE)) { status = null; break; }
    const r = await rp("/properties/list", { channel: "sold", searchLocation: s.name, searchLocationSubtext: "Suburb", type: "suburb", pageSize: "30", page: String(page), surroundingSuburbs: "false" });
    if (!r.cached) { calls++; await new Promise((res) => setTimeout(res, 300)); }
    if (r.remaining !== null && r.remaining !== undefined) remaining = Number(r.remaining);
    if (r.status !== 200) { status = `error ${r.status}`; break; }
    total = r.body?.totalResultsCount ?? total;
    const got = (r.body?.tieredResults ?? []).flatMap((t) => t.results ?? []).map(pick);
    rows.push(...got);
    if (got.length < 30 || rows.length >= TARGET_LISTINGS || (total !== null && rows.length >= total)) break;
  }
  if (status === null) break; // out of budget mid-suburb: leave it unrecorded so the next run redoes it from the cache
  const vic = rows.filter((x) => isVic(x.postcode));
  out.suburbs[s.name] = { sal_code: s.sal_code, units: s.units, total, fetched: rows.length, victorian: vic.length, status: vic.length < rows.length ? "mixed states" : status, rows: vic };
  save();
  console.log(s.name.padEnd(24), "total", String(total).padStart(5), "kept", String(vic.length).padStart(4), "/", rows.length, out.suburbs[s.name].status, "| calls", calls, "remaining", remaining);
}
save();
console.log("done: new API calls", calls, "| quota remaining", remaining, "| suburbs recorded", Object.keys(out.suburbs).length);

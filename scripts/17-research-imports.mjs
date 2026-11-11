// Saves this project's own retrieved data as evidence files inside the research run folder.
import { readFileSync, writeFileSync } from "node:fs";

const D = "_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11";
const J = JSON.parse(readFileSync("data/rp_joined.json", "utf8"));
const inB = (r) => /\/628 Flinders/i.test(r.address || "");
const sold = J.filter((r) => r.ch === "sold" && inB(r)).sort((a, b) => new Date(b.dateSold) - new Date(a.dateSold));

let md = `# Import: our REA harvest for 628 Flinders St (project retrieval, this run)

Provenance: realestate.com.au data via the RapidAPI wrapper realty-in-au, retrieved 2026-11-11 by this project (scripts/06-rp-harvest.mjs; raw in data/rp_harvest.json). Covers the newest 150 sold listings in Docklands (window 2026-05-05 to 2026-11-10) and every current rental. Project retrieval of a public listing feed; rights to this data are unestablished.

## Sold listings found for 628 Flinders St (${sold.length})
| Unit | Price | Sold date | Beds/Baths/Car |
|---|---|---|---|
`;
for (const r of sold) md += `| ${r.address.split("/")[0]} | ${r.price} | ${r.dateSold} | ${r.bed}/${r.bath}/${r.park ?? 0} |\n`;
md += `
## Comparison with the Domain Building Profile (imports/domain-building-profile-628-flinders-2026-11-11.md)
- Present in both with identical price: 3203 $760k, 2715 $510k, 3318 $495,888, 1212 $360k, 2416 $500k, 1309 $370k (6 of 6 compared). Dates agree for 5; 1309 differs (Domain 12 Aug 2026, REA 26 Aug 2026).
- On Domain's list but NOT in our REA harvest: 413 (9 Nov 2026; $445k from the growth table, list price N/A), 1914 (15 Oct 2026, price N/A, also in the For Sale list so it may not be a completed sale), 3402 ($688k, 21 Aug 2026, 2 bed 2 bath 1 car), 1412 ($376k, 17 Aug 2026). Three of the four carry a price.
- Like-for-like set used in the mock-up (2 bed, 1 bath, 0 car, same building): 2715 $510,000; 3318 $495,888; 2416 $500,000; 3614 $525,000; 2015 $532,000. Median $510,000, range $495,888 to $532,000. Adding 413 ($445,000) gives six values and a median of $505,000. Sample is tiny.
`;
writeFileSync(`${D}/imports/our-rea-harvest-vs-domain-628-flinders.md`, md);

const S = JSON.parse(readFileSync("data/suburb_context.json", "utf8"));
let m2 = `# Import: Homes Victoria moving annual median rent by suburb, June quarter 2026 (primary file, own retrieval)

Provenance: xlsx downloaded 2026-11-11 from https://www.dffh.vic.gov.au/sites/default/files/documents/202610/Moving%20annual%20median%20rent%20by%20suburb%20and%20town%20-%20June%20Quarter%202026.xlsx (sheet "2 bedroom flat", columns Jun 2026 and Jun 2025; saved at data/raw/dffh/). Publisher: Department of Families, Fairness and Housing (Homes Victoria); file dated Oct 2026.

| Suburb | Median weekly rent Jun 2026 | New leases (year) | Median Jun 2025 | Change |
|---|---|---|---|---|
`;
for (const [k, v] of Object.entries(S.dffh)) m2 += `| ${k} | $${v.median_weekly} | ${v.lettings.toLocaleString("en-AU")} | $${v.median_year_ago} | ${v.change_pct >= 0 ? "+" : ""}${v.change_pct.toFixed(1)}% |\n`;
writeFileSync(`${D}/imports/homes-victoria-jun2026-2bed-flat.md`, m2);

const cat = JSON.parse(readFileSync("data/raw/vgv/search.json", "utf8")).result.results.filter((p) => /median-unit-by-suburb$|moving-annual-rents/.test(p.name));
let m3 = `# Import: DataVic catalogue records (CKAN API), licence fields

Provenance: https://discover.data.vic.gov.au/api/3/action/package_search, retrieved 2026-11-11 (saved at data/raw/vgv/search.json). Records:

`;
for (const p of cat) m3 += `- ${p.title} | publisher: ${p.organization?.title} | licence: ${p.license_title} (${p.license_url}) | record modified ${p.metadata_modified?.slice(0, 10)} | latest resource listed: ${p.resources[p.resources.length - 1].name}\n`;
writeFileSync(`${D}/imports/datavic-licence-records.md`, m3);
console.log(m3);

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
const require = createRequire(import.meta.url); const X = require("xlsx");
const wb = X.readFile("data/raw/dffh/moving_annual_rent_jun2026.xlsx");
const rows = X.utils.sheet_to_json(wb.Sheets["2 bedroom flat"], { header: 1, defval: "" });
const hdr = rows[1]; const cols = hdr.map((h, i) => ({ h, i })).filter((c) => c.h);
const last = 213; // last populated column = Jun 2026 median (verified)
const periodAt = (i) => hdr[i];
console.log("latest header:", periodAt(last), "| prior-year:", periodAt(last - 8));
const want = { Docklands: "Docklands", Southbank: "Southbank", "Melbourne CBD": "CBD-St Kilda Rd", "St Kilda": "St Kilda", "South Yarra": "South Yarra", "Port Melbourne": "Port Melbourne" };
const out = { dffh: {}, period: periodAt(last) };
for (const [k, name] of Object.entries(want)) {
  const r = rows.find((x) => String(x[1]).trim() === name); if (!r) continue;
  const med = +r[last], cnt = +r[last - 1], medPY = +r[last - 8 + 0], cntPY = +r[last - 9];
  out.dffh[k] = { median_weekly: med, lettings: cnt, median_year_ago: medPY, change_pct: medPY ? ((med - medPY) / medPY) * 100 : null };
}
console.table(out.dffh);
// REA suburb snapshot (from harvest)
const H = JSON.parse(readFileSync("data/rp_harvest.json", "utf8"));
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const med = (a) => { const s = a.filter(Boolean).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
out.rea = {};
for (const sub of Object.keys(want)) {
  const rent2 = H.rent.filter((r) => r.crm_suburb === sub && r.bed === 2 && /apartment|unit/i.test(r.type ?? "")).map((r) => num(r.price));
  const sold2 = H.sold.filter((r) => r.crm_suburb === sub && r.bed === 2 && /apartment|unit/i.test(r.type ?? "")).map((r) => num(r.price));
  const allRent = H.rent.filter((r) => r.crm_suburb === sub).length;
  out.rea[sub] = { rent_listings_all: allRent, rent2_n: rent2.length, rent2_median: med(rent2), sold2_n: sold2.length, sold2_median: med(sold2), gross_yield: med(rent2) && med(sold2) ? (med(rent2) * 52 / med(sold2)) * 100 : null };
}
console.table(out.rea);
// AirDNA market listings (CRM) per suburb
const sql = neon(process.env.DATABASE_URL);
const cur = await sql`select currency, count(*)::int n from airdna_market_listings group by 1`; console.log("currency", cur);
const subs = await sql`select suburb_queried s, count(*)::int n from airdna_market_listings group by 1 order by 2 desc limit 12`; console.log(subs);
const ad = await sql`select suburb_queried s, bedrooms, revenue_ltm, occupancy_rate_ltm, adr_ltm, listing_type from airdna_market_listings where revenue_ltm is not null and revenue_ltm > 0 and bedrooms = 2`;
const by = {}; ad.forEach((r) => (by[r.s] ??= []).push(r));
const [fxRow] = await sql`select fx_aud_per_usd from property_estimates where fx_aud_per_usd is not null order by computed_at desc limit 1`; out.fx = +fxRow.fx_aud_per_usd; console.log('fx AUD per USD', out.fx);
out.airdna = Object.fromEntries(Object.entries(by).map(([s, v]) => [s, { n: v.length, rev_median: med(v.map((x) => +x.revenue_ltm)), occ_median: med(v.map((x) => +x.occupancy_rate_ltm)), adr_median_usd: med(v.map((x) => +x.adr_ltm)), adr_median_aud: med(v.map((x) => +x.adr_ltm)) * out.fx }]));
console.table(out.airdna);
// pipeline
const dev = JSON.parse(readFileSync("data/raw/suburb/com_dev_800m.json", "utf8")).results;
out.pipeline = {}; dev.forEach((r) => { const s = (out.pipeline[r.status] ??= { projects: 0, dwellings: 0 }); s.projects++; s.dwellings += r.resi_dwellings || 0; });
out.pipeline_top = dev.filter((r) => r.resi_dwellings > 0).sort((a, b) => b.resi_dwellings - a.resi_dwellings).slice(0, 6);
console.log(out.pipeline);
writeFileSync("data/suburb_context.json", JSON.stringify(out, null, 1));

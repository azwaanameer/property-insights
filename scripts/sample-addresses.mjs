// Read-only: pick a stratified benchmark sample of CRM apartments.
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select id, address, suburb, postcode, bedrooms, bathrooms, parking, property_type,
         price as weekly_rent_ask, monthly_rent, source, listed_date,
         airdna_monthly_income, own_income_monthly, airbnb_building_id, airbnb_building_listings
  from properties
  where address ~ '^[0-9A-Za-z]+/[0-9]+' and suburb is not null`;
const norm = (r) => {
  // "5805/260 City Road, Southbank VIC 3006" -> unit, streetNo, street
  const m = r.address.match(/^([0-9A-Za-z]+)\/(\d+[A-Za-z]?)\s+([^,]+)/);
  return m ? { ...r, unit: m[1], street_no: m[2], street: m[3].trim(),
    building_key: `${m[2]} ${m[3].trim()}`.toLowerCase().replace(/\bstreet\b/,"st").replace(/\broad\b/,"rd") } : null;
};
const all = rows.map(norm).filter(Boolean);
const bySub = {}; const byBld = {};
for (const r of all) { (bySub[r.suburb] ??= []).push(r); byBld[r.building_key] = (byBld[r.building_key]??0)+1; }
console.log("parsed", all.length, "of", rows.length, "| buildings:", Object.keys(byBld).length);
// deterministic pseudo-random pick
let seed = 42; const rnd = () => (seed = (seed*1664525+1013904223)%4294967296)/4294967296;
const quota = {"Melbourne CBD":16,"Southbank":12,"Docklands":10,"St Kilda":4,"South Yarra":4,"Port Melbourne":4};
const picked = [];
for (const [sub,q] of Object.entries(quota)) {
  const pool = (bySub[sub]??[]).sort(()=>rnd()-0.5);
  const seen = new Set();
  // prefer distinct buildings, but also take 2 same-building pairs in CBD/Southbank for same-building comp testing
  for (const r of pool) { if (picked.filter(p=>p.suburb===sub).length>=q) break; if (seen.has(r.building_key)) continue; seen.add(r.building_key); picked.push(r); }
}
// add same-building pairs: 3 buildings with many CRM units
const big = Object.entries(byBld).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
for (const b of big) { const u = all.filter(r=>r.building_key===b && !picked.includes(r)).slice(0,2); picked.push(...u); }
writeFileSync("data/benchmark_addresses.json", JSON.stringify(picked,null,2));
console.log("picked", picked.length, "| big buildings:", big.map(b=>b+" ("+byBld[b]+")").join("; "));
console.table(picked.slice(0,50).map(r=>({addr:r.address, ask:r.weekly_rent_ask, bed:r.bedrooms})));

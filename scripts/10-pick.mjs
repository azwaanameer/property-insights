import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { parseAddr } from "./lib.mjs";
const sql = neon(process.env.DATABASE_URL);
const bk = (p) => `${p.num}${p.sfx}|${p.street}`;
const sold = JSON.parse(readFileSync("data/rp_joined.json", "utf8")).filter((r) => r.ch === "sold");
const rent = JSON.parse(readFileSync("data/rp_joined.json", "utf8")).filter((r) => r.ch === "rent");
const soldB = {}, rentB = {};
for (const r of sold) { const p = parseAddr((r.address ?? "").replace(/\s*\/\s*/g, "/")); if (p) (soldB[bk(p)] ??= []).push(r); }
for (const r of rent) { const p = parseAddr((r.address ?? "").replace(/\s*\/\s*/g, "/")); if (p) (rentB[bk(p)] ??= []).push(r); }
const match = JSON.parse(readFileSync("data/vicmap_match.json", "utf8")); const planning = JSON.parse(readFileSync("data/vicmap_planning.json", "utf8"));
const rows = await sql`
  select p.id, p.address, p.suburb, p.bedrooms, p.bathrooms, p.parking, p.price ask, p.status, p.airdna_monthly_income, p.airdna_occupancy, p.airdna_adr, p.airdna_confidence_level, p.own_income_monthly, p.own_income_comps, p.airbnb_building_id, p.airbnb_building_listings, p.airbnb_building_distance_m, p.airbnb_building_source,
         (select count(*)::int from property_listing_details d where d.property_id::text=p.id::text) has_detail,
         (select count(*)::int from airdna_market_listings l where l.property_id::text=p.id::text) comps
  from properties p where p.airdna_monthly_income is not null and p.own_income_monthly is not null and p.airbnb_building_id is not null`;
const out = [];
for (const r of rows) {
  const p = parseAddr(r.address); if (!p) continue; const k = bk(p); const m = match.find((x) => x.id === r.id);
  const hasPlan = m?.lon && planning[`${m.lon},${m.lat}`]?.zone?.length;
  out.push({ ...r, sold_in_bldg: (soldB[k] ?? []).length, rent_in_bldg: (rentB[k] ?? []).length, status_vm: m?.status, hasPlan: !!hasPlan, in_rea_rent: (rentB[k] ?? []).some((x) => parseAddr(x.address.replace(/\s*\/\s*/g, "/"))?.unit === p.unit) });
}
const good = out.filter((r) => r.status_vm === "exact_unit" && r.hasPlan && r.sold_in_bldg >= 3 && r.has_detail && r.comps >= 5);
console.log("candidates with everything:", good.length, "of", out.length);
console.table(good.sort((a, b) => b.sold_in_bldg - a.sold_in_bldg).slice(0, 12).map((r) => ({ addr: r.address, status: r.status, ask: r.ask, airdna: Math.round(r.airdna_monthly_income), own: Math.round(r.own_income_monthly), sold: r.sold_in_bldg, rentBldg: r.rent_in_bldg, comps: r.comps, abnb: r.airbnb_building_listings, inREA: r.in_rea_rent, id: r.id.slice(0, 8) })));
const c = (f) => out.filter(f).length;
console.log({ total: out.length, exact: c((r) => r.status_vm === "exact_unit"), plan: c((r) => r.hasPlan), sold3: c((r) => r.sold_in_bldg >= 3), detail: c((r) => r.has_detail), comps5: c((r) => r.comps >= 5), comps_any: c((r)=>r.comps>0) });
const relaxed = out.filter((r) => r.status_vm === "exact_unit" && r.sold_in_bldg >= 3);
console.table(relaxed.sort((a, b) => b.sold_in_bldg - a.sold_in_bldg).slice(0, 12).map((r) => ({ addr: r.address, status: r.status, ask: r.ask, airdna: Math.round(r.airdna_monthly_income), own: Math.round(r.own_income_monthly), sold: r.sold_in_bldg, rentB: r.rent_in_bldg, comps: r.comps, det: r.has_detail, plan: r.hasPlan, abnb: r.airbnb_building_listings, inREA: r.in_rea_rent })));

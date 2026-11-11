// Match every CRM apartment to an official Vicmap unit address; derive building/parcel/mesh-block links.
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
import { wfs, cached, parseAddr, LOCALITY, unitKey, sleep } from "./lib.mjs";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select id, address, suburb, postcode, bedrooms, price as weekly_rent_ask, listed_date from properties where suburb is not null`;
const bld = new Map();
const items = [];
for (const r of rows) {
  const p = parseAddr(r.address); const loc = LOCALITY[r.suburb];
  if (!p || !loc) { items.push({ ...r, parsed: null }); continue; }
  const key = `${p.num}|${loc}`; if (!bld.has(key)) bld.set(key, { num: p.num, loc });
  items.push({ ...r, parsed: p, key });
}
console.log("rows", rows.length, "unique building queries", bld.size);
const feats = {}; let i = 0;
for (const [key, b] of bld) {
  feats[key] = await cached(`vm_addr_${b.num}_${b.loc.replace(/ /g,"_")}`, async () => {
    const f = await wfs("address", `house_number_1=${b.num} AND locality_name='${b.loc}'`);
    await sleep(150); return f?.map((x) => ({ ...x.properties, lon: x.geometry.coordinates[0], lat: x.geometry.coordinates[1] }));
  });
  if (++i % 50 === 0) console.log("fetched", i);
}
const out = [];
for (const it of items) {
  const base = { id: it.id, address: it.address, suburb: it.suburb, weekly_rent_ask: +it.weekly_rent_ask, listed_date: it.listed_date };
  if (!it.parsed) { out.push({ ...base, status: "unparseable" }); continue; }
  let all = feats[it.key];
  if (!all) { out.push({ ...base, status: "api_error" }); continue; }
  const { unit, sfx, street, streetWord } = it.parsed;
  const match = (list) => list.filter((f) => {
    const rn = (f.road_name ?? "").replace(/['’. ]/g, "").toUpperCase();
    return (rn === street || street.startsWith(rn) || rn.startsWith(street)) && (f.house_suffix_1 ?? "") === sfx;
  });
  let sameStreet = match(all);
  let fallback = false;
  if (!sameStreet.length) { // wrong/missing suburb label in CRM: search any locality by number + street word
    const fb = await cached(`vm_fb_${it.parsed.num}_${streetWord}`, async () => { const f = await wfs("address", `house_number_1=${it.parsed.num} AND road_name LIKE '${streetWord}%'`); await sleep(150); return f?.map((x) => ({ ...x.properties, lon: x.geometry.coordinates[0], lat: x.geometry.coordinates[1] })) ?? []; });
    sameStreet = match(fb.filter((f) => ["MELBOURNE","SOUTHBANK","DOCKLANDS","SOUTH WHARF","WEST MELBOURNE","SOUTH MELBOURNE","ST KILDA","ST KILDA WEST","ST KILDA EAST","SOUTH YARRA","PORT MELBOURNE","PRAHRAN","CARLTON","EAST MELBOURNE","ELWOOD","ALBERT PARK","WINDSOR","TOORAK","MIDDLE PARK"].includes(f.locality_name)));
    fallback = sameStreet.length > 0;
  }
  if (!sameStreet.length) { out.push({ ...base, status: "no_building_match", building_records: 0 }); continue; }
  const unitRecs = sameStreet.filter((f) => ["UNIT","APT","SHOP","SUITE","FLAT","OFFICE","VILLA","TOWNHOUSE"].includes(f.blg_unit_type) || f.blg_unit_id_1 != null);
  const hit = sameStreet.find((f) => unitKey(f) === unit);
  const props = new Set(sameStreet.map((f) => f.property_pfi));
  const first = hit ?? sameStreet[0];
  out.push({ ...base, status: hit ? "exact_unit" : "building_only", via_fallback: fallback, vicmap_locality: first.locality_name, building_records: sameStreet.length, building_unit_records: unitRecs.length,
    property_pfis_in_building: props.size, property_pfi: hit?.property_pfi ?? null, ezi_address: hit?.ezi_address ?? null,
    lga_code: first.lga_code, mesh_block: first.mesh_block, lon: first.lon, lat: first.lat, postcode: first.postcode });
}
writeFileSync("data/vicmap_match.json", JSON.stringify(out, null, 1));
const c = {}; out.forEach((o) => (c[o.status] = (c[o.status] ?? 0) + 1));
console.log(c);
const bySub = {}; out.forEach((o) => { const s = (bySub[o.suburb] ??= {}); s[o.status] = (s[o.status] ?? 0) + 1; });
console.table(bySub);
console.log("sample unmatched:", out.filter((o) => o.status !== "exact_unit").slice(0, 15).map((o) => `${o.address} [${o.status}]`));

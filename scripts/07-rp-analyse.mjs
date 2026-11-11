import { readFileSync, writeFileSync } from "node:fs";
import { wfs, cached, parseAddr, unitKey, sleep, LOCALITY } from "./lib.mjs";
const H = JSON.parse(readFileSync("data/rp_harvest.json", "utf8"));
const crm = JSON.parse(readFileSync("data/vicmap_match.json", "utf8"));
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "n/a");
const pd = (s) => { const d = new Date(s); return isNaN(d) ? null : d; };

// ---- 1. Field completeness
for (const ch of ["rent", "sold"]) {
  const rows = H[ch]; const hasUnit = rows.filter((r) => r.address && /^[0-9A-Za-z]+\s*\/\s*\d/.test(r.address));
  console.log(`\n== ${ch}: ${rows.length} rows | unit-level address ${pct(hasUnit.length, rows.length)} | price ${pct(rows.filter(r=>num(r.price)).length, rows.length)} | beds ${pct(rows.filter(r=>r.bed!=null).length, rows.length)} | parking ${pct(rows.filter(r=>r.park!=null).length, rows.length)} | coords ${pct(rows.filter(r=>r.lat).length, rows.length)} | agent phone ${pct(rows.filter(r=>r.agentPhone).length, rows.length)}` + (ch==="rent" ? ` | bond ${pct(rows.filter(r=>r.bond).length, rows.length)}` : ` | dateSold ${pct(rows.filter(r=>r.dateSold).length, rows.length)}`));
  const bySub = {}; rows.forEach((r) => { const s = (bySub[r.crm_suburb] ??= { n: 0, unit: 0 }); s.n++; if (/^[0-9A-Za-z]+\s*\/\s*\d/.test(r.address ?? "")) s.unit++; });
  console.table(Object.fromEntries(Object.entries(bySub).map(([k, v]) => [k, { rows: v.n, unit_level: pct(v.unit, v.n) }])));
}
// sold depth (dates covered by newest 150 per suburb)
const sd = {}; H.sold.forEach((r) => { const d = pd(r.dateSold); if (!d) return; const s = (sd[r.crm_suburb] ??= { newest: d, oldest: d, n: 0, prices: [] }); if (d > s.newest) s.newest = d; if (d < s.oldest) s.oldest = d; s.n++; const p = num(r.price); if (p) s.prices.push(p); });
console.log("\n== sold date window of newest 150 per suburb");
console.table(Object.fromEntries(Object.entries(sd).map(([k, v]) => [k, { n: v.n, newest: v.newest.toISOString().slice(0, 10), oldest: v.oldest.toISOString().slice(0, 10), days: Math.round((v.newest - v.oldest) / 864e5), median_price: v.prices.sort((a,b)=>a-b)[Math.floor(v.prices.length/2)] }])));
const soldPriceMissing = H.sold.filter((r) => !num(r.price)).length; console.log("sold rows with undisclosed price:", soldPriceMissing, pct(soldPriceMissing, H.sold.length));

// ---- 2. Join harvested listings to Vicmap units (property_pfi) + to CRM
const keyOf = (p) => `${p.num}${p.sfx}|${p.unit}|${p.street}`;
const crmIdx = new Map(); // from CRM via re-parse
const props = JSON.parse(readFileSync("data/benchmark_addresses.json", "utf8")); // not used for index
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const all = await sql`select id, address, suburb, price as ask, status, source, listed_date, created_at, agent_id from properties`;
for (const r of all) { const p = parseAddr(r.address); if (p) crmIdx.set(keyOf(p), r); }
let vmHit = 0, vmTry = 0, inCrm = 0, priceCmp = [], newToCrm = [];
const bcache = new Map();
async function building(p, loc) {
  const k = `${p.num}|${loc}`; if (bcache.has(k)) return bcache.get(k);
  const f = await cached(`vm_addr_${p.num}_${loc.replace(/ /g, "_")}`, async () => { const x = await wfs("address", `house_number_1=${p.num} AND locality_name='${loc}'`); await sleep(120); return x?.map((y) => ({ ...y.properties })); });
  bcache.set(k, f ?? []); return f ?? [];
}
const locMap = { "Melbourne CBD": "MELBOURNE", Southbank: "SOUTHBANK", Docklands: "DOCKLANDS", "St Kilda": "ST KILDA", "South Yarra": "SOUTH YARRA", "Port Melbourne": "PORT MELBOURNE" };
const joined = [];
for (const ch of ["rent", "sold"]) {
  let t = 0, h = 0;
  for (const r of H[ch]) {
    const p = parseAddr((r.address ?? "").replace(/\s*\/\s*/g, "/")); if (!p) continue; t++;
    const fs = await building(p, locMap[r.crm_suburb]);
    const hit = fs.find((f) => unitKey(f) === p.unit && (f.house_suffix_1 ?? "") === p.sfx && (f.road_name ?? "").replace(/['’. ]/g, "").toUpperCase().startsWith(p.street.slice(0, 5)));
    if (hit) { h++; r.property_pfi = hit.property_pfi; }
    if (ch === "rent") { const c = crmIdx.get(keyOf(p)); if (c) { inCrm++; r.in_crm = true; const a = num(r.price), b = +c.ask; if (a && b) priceCmp.push({ addr: r.address, rea: a, crm: b, diff: a - b }); } else newToCrm.push(r); }
    joined.push({ ch, ...r });
  }
  console.log(`\nVicmap unit join (${ch}): ${h}/${t} = ${pct(h, t)}`);
}
const rentWithUnit = H.rent.filter((r) => parseAddr((r.address ?? "").replace(/\s*\/\s*/g, "/")));
console.log(`\n== REA rent vs CRM: ${rentWithUnit.length} unit-level rent listings | already in CRM: ${inCrm} (${pct(inCrm, rentWithUnit.length)}) | NOT in CRM: ${newToCrm.length}`);
const ex = priceCmp.filter((x) => x.diff === 0).length, within = priceCmp.filter((x) => Math.abs(x.diff) <= 25).length;
console.log(`price compare on ${priceCmp.length} overlapping units: identical ${pct(ex, priceCmp.length)} | within $25/wk ${pct(within, priceCmp.length)} | median diff ${priceCmp.map(x=>x.diff).sort((a,b)=>a-b)[Math.floor(priceCmp.length/2)]}`);
console.log("biggest diffs:", priceCmp.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5).map((x) => `${x.addr}: REA ${x.rea} vs CRM ${x.crm}`));
// new listings by suburb
const nb = {}; newToCrm.forEach((r) => (nb[r.crm_suburb] = (nb[r.crm_suburb] ?? 0) + 1)); console.log("not-in-CRM by suburb:", nb);
// CRM listings that are not in current REA feed: what status are they?
const reaKeys = new Set(rentWithUnit.map((r) => keyOf(parseAddr(r.address.replace(/\s*\/\s*/g, "/")))));
const crmNotRea = all.filter((r) => { const p = parseAddr(r.address); return p && locMap[r.suburb] && !reaKeys.has(keyOf(p)); });
const st = {}; crmNotRea.forEach((r) => (st[r.status] = (st[r.status] ?? 0) + 1)); console.log("CRM rows not in REA rent feed by status:", st, "| CRM rows total:", all.length);
const recent = all.filter((r) => r.listed_date && (Date.now() - new Date(r.listed_date)) / 864e5 <= 30); const recentIn = recent.filter((r) => { const p = parseAddr(r.address); return p && reaKeys.has(keyOf(p)); });
console.log(`CRM listings with listed_date in last 30d: ${recent.length}; found in REA feed: ${recentIn.length} (${pct(recentIn.length, recent.length)})`);
writeFileSync("data/rp_joined.json", JSON.stringify(joined));
writeFileSync("data/rp_new_to_crm.json", JSON.stringify(newToCrm));

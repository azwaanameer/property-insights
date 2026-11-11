import { readFileSync } from "node:fs";
import { parseAddr } from "./lib.mjs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const J = JSON.parse(readFileSync("data/rp_joined.json", "utf8")).filter((r) => r.ch === "rent");
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const key = (p) => `${p.num}${p.sfx}|${p.unit}|${p.street}`;
const crm = await sql`select address, status, price, listed_date, created_at from properties`;
const idx = new Map(); crm.forEach((r) => { const p = parseAddr(r.address); if (p) idx.set(key(p), r); });
const elig = J.filter((r) => r.bed === 2 && num(r.price) && num(r.price) <= 1000 && /apartment|unit/i.test(r.type ?? "") );
const withUnit = elig.filter((r) => parseAddr(r.address.replace(/\s*\/\s*/g, "/")));
const hit = withUnit.filter((r) => idx.has(key(parseAddr(r.address.replace(/\s*\/\s*/g, "/")))));
console.log(`REA rent listings: ${J.length} | match CRM filter (2bed, <=$1000, apt/unit): ${elig.length} | with unit address: ${withUnit.length}`);
console.log(`of those, already in CRM (any status): ${hit.length} (${(100*hit.length/withUnit.length).toFixed(1)}%) | NOT in CRM: ${withUnit.length-hit.length}`);
const st = {}; hit.forEach((r) => { const s = idx.get(key(parseAddr(r.address.replace(/\s*\/\s*/g, "/")))).status; st[s] = (st[s] ?? 0) + 1; }); console.log("CRM status of matched:", st);
const miss = withUnit.filter((r) => !hit.includes(r)); const bs = {}; miss.forEach((r) => (bs[r.crm_suburb] = (bs[r.crm_suburb] ?? 0) + 1)); console.log("missing from CRM by suburb:", bs);
console.log("sample missing:", miss.slice(0, 8).map((r) => `${r.address} ${r.price} (${r.agency})`));
// How many matched were first seen in CRM before REA availability? (not knowable) -> just report REA freshness
const d = J.map((r) => r.dateAvailable).filter(Boolean).slice(0, 3); console.log("dateAvailable sample:", d, "modified sample:", J.slice(0,2).map(r=>r.modified));

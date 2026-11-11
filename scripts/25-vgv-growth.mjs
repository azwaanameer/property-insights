// Suburb unit-price growth from Valuer-General medians (annual 2015-2025 + quarterly to Mar 2026).
import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
// annual series
const a = XLSX.utils.sheet_to_json(XLSX.readFile("data/raw/vgv/units-by-suburb-2015-2025.xlsx").Sheets.Sheet1, { header: 1, defval: "" });
const hdr = a.find((r) => r[0] === "Locality");
const years = []; hdr.forEach((v, i) => { if (/^\d{4}$/.test(String(v))) years.push([+v, i]); });
const ann = {};
for (const r of a) { if (!r[0] || r[0] === "Locality" || !/[A-Z]/.test(r[0])) continue; ann[r[0]] = Object.fromEntries(years.map(([y, i]) => [y, num(r[i])])); }
// quarterly (5 quarters to Mar 2026)
const q = XLSX.utils.sheet_to_json(XLSX.readFile("data/raw/vgv/median-unit-march-quarter-2026.xls").Sheets.Sheet1, { header: 1, defval: "" });
const qs = {};
for (const r of q.slice(7)) { if (!r[0] || !/[A-Z]/.test(r[0])) continue; qs[r[0]] = { q: [1, 3, 5, 7, 9].map((i) => num(r[i])), sales_q1_26: num(r[11]), yoy_pct: num(r[13]), qoq_pct: num(r[14]) }; }
const cagr = (p0, p1, n) => (p0 && p1 && p0 > 0 ? (Math.pow(p1 / p0, 1 / n) - 1) * 100 : null);
const out = {};
for (const [k, s] of Object.entries(ann)) {
  const y = (yr) => s[yr];
  // smooth endpoints: 2-yr average to damp noisy medians
  const avg2 = (yr) => (y(yr) && y(yr - 1) ? (y(yr) + y(yr - 1)) / 2 : null);
  out[k] = { latest_2025: y(2025), y2020: y(2020), y2015: y(2015), cagr5: cagr(y(2020), y(2025), 5), cagr10: cagr(y(2015), y(2025), 10), cagr3: cagr(y(2022), y(2025), 3), cagr5_smoothed: cagr(avg2(2020), avg2(2025), 5), series: s, ...(qs[k] ?? {}) };
}
writeFileSync("data/vgv_unit_growth.json", JSON.stringify(out, null, 1));
const f = (v, d = 1) => (v == null ? "  n/a" : v.toFixed(d).padStart(6));
const crm = ["MELBOURNE", "SOUTHBANK", "DOCKLANDS", "ST KILDA", "SOUTH YARRA", "PORT MELBOURNE"];
console.log("suburbs:", Object.keys(out).length, "| years", years.map((y) => y[0]).join(","));
console.log("\nCRM suburbs: 2025 median | 3y 5y 10y CAGR% | 5y smoothed | Mar-26 sales | Mar-26 YoY% | 5 quarters");
for (const k of crm) { const o = out[k]; console.log(k.padEnd(15), String(o.latest_2025).padStart(8), f(o.cagr3), f(o.cagr5), f(o.cagr10), f(o.cagr5_smoothed), String(o.sales_q1_26 ?? "").padStart(5), f(o.yoy_pct), JSON.stringify(o.q)); }
const big = Object.entries(out).filter(([, o]) => (o.sales_q1_26 ?? 0) >= 60 && o.cagr5 != null).sort((x, y) => y[1].cagr5 - x[1].cagr5);
console.log("\nTop 15 by 5y CAGR (>=60 sales in Mar-26 qtr):"); big.slice(0, 15).forEach(([k, o]) => console.log(k.padEnd(20), String(o.latest_2025).padStart(8), f(o.cagr5), f(o.cagr10), String(o.sales_q1_26).padStart(5), f(o.yoy_pct)));
console.log("\nBottom 8:"); big.slice(-8).forEach(([k, o]) => console.log(k.padEnd(20), String(o.latest_2025).padStart(8), f(o.cagr5), f(o.cagr10), String(o.sales_q1_26).padStart(5), f(o.yoy_pct)));
console.log("\nliquid suburbs (>=60 sales):", big.length);

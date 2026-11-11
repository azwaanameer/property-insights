// Indicative screener: VG unit growth + Homes Victoria flat rents -> gross yield and rent growth.
import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync("data/vgv_unit_growth.json", "utf8"));
const wb = XLSX.readFile("data/raw/dffh/moving_annual_rent_jun2026.xlsx");
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const rents = {};
for (const sheet of ["1 bedroom flat", "2 bedroom flat"]) {
  const r = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
  const head = r[1];
  const medCols = head.map((h, i) => [h, i]).filter(([h, i]) => i >= 2 && r[2][i] === "Median");
  const last = medCols.at(-1), yrAgo = medCols.at(-5), y5 = medCols.at(-21);
  if (sheet === "1 bedroom flat") console.log("rent columns: latest", last[0], "| prior year", yrAgo[0], "| 5y ago", y5[0]);
  for (const row of r.slice(3)) {
    const sub = String(row[1] || "").toUpperCase().trim(); if (!sub) continue;
    (rents[sub] ??= {})[sheet] = { now: num(row[last[1]]), ago1: num(row[yrAgo[1]]), ago5: num(row[y5[1]]) };
  }
}
const rows = [];
for (const [k, g] of Object.entries(G)) {
  const rr = rents[k]; if (!rr?.["1 bedroom flat"]?.now || !rr?.["2 bedroom flat"]?.now) continue;
  const a = rr["1 bedroom flat"], b = rr["2 bedroom flat"];
  const rentNow = (a.now + b.now) / 2, rent5 = a.ago5 && b.ago5 ? (a.ago5 + b.ago5) / 2 : null;
  rows.push({ sub: k, price: g.latest_2025, sales: g.sales_q1_26 ?? 0, cagr5: g.cagr5, cagr10: g.cagr10, yoy: g.yoy_pct, rent_wk: rentNow, yield: (rentNow * 52 / g.latest_2025) * 100, rent_cagr5: rent5 ? (Math.pow(rentNow / rent5, 1 / 5) - 1) * 100 : null });
}
writeFileSync("data/screen_indicative.json", JSON.stringify(rows, null, 1));
const f = (v, d = 1, w = 6) => (v == null ? "n/a" : v.toFixed(d)).padStart(w);
const show = (title, list) => { console.log("\n" + title); console.log("suburb".padEnd(20), "price".padStart(8), "sales", " g5%", "g10%", " rent/wk", "yield%", "rent g5%"); list.forEach((o) => console.log(o.sub.padEnd(20), String(o.price).padStart(8), String(o.sales).padStart(5), f(o.cagr5), f(o.cagr10), f(o.rent_wk, 0, 8), f(o.yield, 1, 6), f(o.rent_cagr5, 1, 8))); };
console.log("matched suburbs:", rows.length);
const liquid = rows.filter((o) => o.sales >= 60);
show("Our six suburbs", rows.filter((o) => ["MELBOURNE", "SOUTHBANK", "DOCKLANDS", "ST KILDA", "SOUTH YARRA", "PORT MELBOURNE"].includes(o.sub)));
// simple composite: rank-average of 5y growth and yield
const rank = (arr, key) => { const s = [...arr].sort((x, y) => y[key] - x[key]); s.forEach((o, i) => (o["r_" + key] = i / (arr.length - 1))); };
const L = liquid.filter((o) => o.cagr5 != null); rank(L, "cagr5"); rank(L, "yield");
L.forEach((o) => (o.score = 1 - (o.r_cagr5 + o.r_yield) / 2));
show("Top 12 liquid suburbs by growth+yield rank (>=60 sales)", [...L].sort((x, y) => y.score - x.score).slice(0, 12));

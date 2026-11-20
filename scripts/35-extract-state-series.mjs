// Extract annual suburb series for backtesting from official state files (SA house prices, SA rents, QLD rents).
// Outputs: data/series_sa_house_price.json, data/series_sa_rent.json, data/series_qld_rent.json
import XLSX from "xlsx";
import { readdirSync, writeFileSync } from "node:fs";
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const rows = (f, sheet) => { const wb = XLSX.readFile(f); return XLSX.utils.sheet_to_json(wb.Sheets[sheet ?? wb.SheetNames[0]], { header: 1, defval: "" }); };

// ---- SA house prices: file Qn_YYYY holds (sales, median) for quarter n of YYYY-1 and YYYY. Annual = sales-weighted mean of quarterly medians (>=3 quarters).
const dirP = "data/raw/sa/sales-median-house/";
const q = {}; // suburb -> year -> quarter -> [median, sales]
for (const f of readdirSync(dirP).filter((x) => x.endsWith(".xlsx"))) {
  const m = f.match(/Q(\d)_(\d{4})/); if (!m) continue; const n = +m[1], Y = +m[2];
  for (const r of rows(dirP + f)) {
    const sub = String(r[1] ?? "").trim().toUpperCase(); if (!sub || sub === "SUBURB") continue;
    const s0 = num(r[2]), m0 = num(r[3]), s1 = num(r[4]), m1 = num(r[5]);
    for (const [yr, s, md] of [[Y - 1, s0, m0], [Y, s1, m1]]) { if (s && md) { ((q[sub] ??= {})[yr] ??= {})[n] = [md, s]; } }
  }
}
const price = {};
for (const [sub, ys] of Object.entries(q)) for (const [y, qs] of Object.entries(ys)) {
  const v = Object.values(qs); if (v.length < 3) continue;
  const S = v.reduce((a, b) => a + b[1], 0); (price[sub] ??= {})[y] = { p: v.reduce((a, b) => a + b[0] * b[1], 0) / S, n: S };
}
writeFileSync("data/series_sa_house_price.json", JSON.stringify(price));
console.log("SA house price suburbs:", Object.keys(price).length);

// ---- SA rents: per quarterly report, "Total Flats" and "Total Houses" median by suburb. Annual = mean of available quarterly medians (>=3).
const dirR = "data/raw/sa/rents/";
const rq = {};
for (const f of readdirSync(dirR).filter((x) => /Private_Rental_Report_(\d{4})-(\d\d)\.xls/.test(x))) {
  const [, Y, M] = f.match(/(\d{4})-(\d\d)/); if (+Y < 2013) continue;
  let data; try { const wb = XLSX.readFile(dirR + f); const sn = wb.SheetNames.find((s) => /suburb/i.test(s)) ?? wb.SheetNames[0]; data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" }); } catch { continue; }
  // header row = the row with several "Median" cells; group/bedroom labels sit in the two rows above (forward-filled)
  const hi = data.findIndex((r) => r.filter((c) => /^median$/i.test(String(c).trim())).length >= 4); if (hi < 0) continue;
  const ff = (row) => { let last = ""; return row.map((c) => { const t = String(c).trim(); if (t) last = t; return last; }); };
  const l1 = ff(data[hi - 1] ?? []), l2 = ff(data[hi - 2] ?? []);
  const flatCols = [], houseCols = [];
  data[hi].forEach((c, i) => {
    if (!/^median$/i.test(String(c).trim())) return;
    const t = (l2[i] + " " + l1[i]).toLowerCase();
    if (/flat|unit/.test(t) && /(^|\D)[12]\s*(br|bed)/.test(t)) flatCols.push(i);
    if (/house/.test(t) && /(^|\D)3\s*(br|bed)/.test(t)) houseCols.push(i);
  });
  const si = (data[hi - 1] ?? []).findIndex((c) => /^Suburb$/i.test(String(c).trim())); const sc = si >= 0 ? si : 0;
  for (const r of data.slice(hi + 1)) {
    const sub = String(r[sc] ?? "").trim().toUpperCase(); if (!sub || sub === "METRO" || /REST OF/.test(sub)) continue;
    const fv = flatCols.map((i) => num(r[i])).filter(Boolean), hv = houseCols.map((i) => num(r[i])).filter(Boolean);
    const t = ((rq[sub] ??= {})[Y] ??= { flat: [], house: [] });
    if (fv.length) t.flat.push(mean(fv)); if (hv.length) t.house.push(mean(hv));
  }
}
const rent = {};
for (const [sub, ys] of Object.entries(rq)) for (const [y, t] of Object.entries(ys)) {
  const o = {}; if (t.flat.length >= 3) o.flat = mean(t.flat); if (t.house.length >= 3) o.house = mean(t.house);
  if (Object.keys(o).length) (rent[sub] ??= {})[y] = o;
}
writeFileSync("data/series_sa_rent.json", JSON.stringify(rent));
console.log("SA rent suburbs:", Object.keys(rent).length);

// ---- QLD rents (RTA suburb sheet): quarterly median new-tenancy rent. Annual = mean of the four quarters of a year (>=3). Flat = mean of Flat 1 and Flat 2; House = House 3.
const a = rows("data/raw/qld/rents-rta/rta-bond-statistics.xlsx", "4 sub-rents");
const hi = a.findIndex((r) => String(r[1]) === "Suburb"); const qrow = a[hi + 1], yrow = a[hi + 2];
const cols = []; for (let c = 3; c < qrow.length; c++) if (yrow[c]) cols.push([c, +yrow[c]]);
const qr = {};
for (const r of a.slice(hi + 4)) {
  const sub = String(r[1] ?? "").trim().toUpperCase(); const dw = String(r[2]); if (!sub) continue;
  const kind = dw === "Flat 1" ? "f1" : dw === "Flat 2" ? "f2" : dw === "House 3" ? "house" : null; if (!kind) continue;
  for (const [c, y] of cols) { const v = num(r[c]); if (v) (((qr[sub] ??= {})[y] ??= {})[kind] ??= []).push(v); }
}
const qld = {};
for (const [sub, ys] of Object.entries(qr)) for (const [y, t] of Object.entries(ys)) {
  const o = {};
  if (t.f1?.length >= 3 && t.f2?.length >= 3) o.flat = (mean(t.f1) + mean(t.f2)) / 2; else if (t.f2?.length >= 3) o.flat = mean(t.f2);
  if (t.house?.length >= 3) o.house = mean(t.house);
  if (Object.keys(o).length) (qld[sub] ??= {})[y] = o;
}
writeFileSync("data/series_qld_rent.json", JSON.stringify(qld));
console.log("QLD rent suburbs:", Object.keys(qld).length, "years", [...new Set(cols.map((c) => c[1]))].join(","));

// Extract (1) ABS geography names for SAL 2021 / SSC 2016, (2) DFFH Dec-quarter moving annual flat rents by area, 2008-2025.
import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
const names = {};
for (const [y, st, sheet] of [["2021", "SAL", "2021_ASGS_Non_ABS_Structures"], ["2016", "SSC", "2016_ASGS_Non-ABS_Structures"]]) {
  const wb = XLSX.readFile(`data/raw/national/abs-geography/${y}_geog.xlsx`);
  const r = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
  names[y] = {};
  for (const row of r) if (row[0] === st) names[y][String(row[1]).replace(/\D/g, "")] = String(row[3]);
  console.log(y, st, Object.keys(names[y]).length, Object.entries(names[y]).slice(0, 3));
}
const wb = XLSX.readFile("data/raw/vic/rents-homes-victoria/moving_annual_rent_jun2026.xlsx");
const rent = {};
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
for (const sheet of ["1 bedroom flat", "2 bedroom flat"]) {
  const r = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
  const head = r[1];
  const cols = {};
  head.forEach((h, i) => { const m = /^Dec (\d{4})$/.exec(String(h)); if (m && r[2][i] === "Count") cols[m[1]] = i; });
  for (const row of r.slice(3)) {
    const sub = String(row[1] || "").trim(); if (!sub) continue;
    for (const [yr, i] of Object.entries(cols)) {
      const n = num(row[i]), med = num(row[i + 1]);
      if (med) ((rent[sub] ??= {})[yr] ??= {})[sheet] = { n, med };
    }
  }
}
writeFileSync("data/abs_names.json", JSON.stringify(names));
writeFileSync("data/dffh_flat_rent_dec.json", JSON.stringify(rent));
console.log("rent areas:", Object.keys(rent).length, "sample", Object.keys(rent).slice(0, 12));

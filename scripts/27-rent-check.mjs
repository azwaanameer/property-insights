import XLSX from "xlsx";
const wb = XLSX.readFile("data/raw/dffh/moving_annual_rent_jun2026.xlsx");
for (const s of ["1 bedroom flat", "2 bedroom flat"]) {
  const r = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: "" });
  const h = r[1], t = r[2], med = [];
  h.forEach((x, i) => { if (i >= 2 && t[i] === "Median") med.push(i); });
  const L = med.at(-1), Y = med.at(-5), F = med.at(-21);
  console.log(s, "| latest", h[L], "| yr ago", h[Y], "| 5y ago", h[F]);
  for (const row of r) if (/^(frankston|noble park|dandenong|docklands|southbank)$/i.test(row[1])) console.log("  ", String(row[1]).padEnd(14), "leases", row[L - 1], "median", row[L], "| yr ago", row[Y], "| 5y ago", row[F]);
}

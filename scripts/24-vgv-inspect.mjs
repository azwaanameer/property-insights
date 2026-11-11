import XLSX from "xlsx";
for (const f of process.argv.slice(2)) {
  const wb = XLSX.readFile(f);
  console.log("\n#####", f, wb.SheetNames);
  for (const n of wb.SheetNames.slice(0, 3)) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" });
    console.log("--- sheet", n, rows.length, "rows");
    rows.slice(0, 9).forEach((r) => console.log(JSON.stringify(r.slice(0, 16))));
    const hit = rows.filter((r) => /docklands|southbank|melbourne|st kilda|south yarra|port melbourne/i.test(String(r[0] ?? r[1]))).slice(0, 8);
    hit.forEach((r) => console.log("HIT", JSON.stringify(r.slice(0, 16))));
  }
}

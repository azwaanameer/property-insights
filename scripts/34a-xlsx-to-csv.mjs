// Convert xls/xlsx files to CSV (one CSV per sheet) so stdlib Python can read them.
// usage: node scripts/34a-xlsx-to-csv.mjs <outDir> <file...>
import XLSX from "xlsx";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
const [out, ...files] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const f of files) {
  const tag = basename(f).replace(/\.[^.]+$/, "");
  try {
    const wb = XLSX.readFile(f, { cellDates: false, raw: true });
    wb.SheetNames.forEach((n, i) => {
      const dest = `${out}/${tag}__${i}.csv`;
      if (existsSync(dest)) return;
      writeFileSync(dest, `#sheet=${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { rawNumbers: true }));
    });
  } catch (e) { console.error("FAIL", f, e.message.slice(0, 80)); }
}

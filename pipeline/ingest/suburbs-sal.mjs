// Victorian suburbs (ABS SAL 2021) -> ref_suburb under a new dataset version, then publish.
//
//   npm run pipeline:sal -- --pglite              in-memory dry run (applies migrations first)
//   DATABASE_URL=... npm run pipeline:sal         load and publish into your database
//
// The SAL list lives in sheet `2021_ASGS_Non_ABS_Structures` of 2021_geog.xlsx (the spec names the MAIN_Structures sheet, which has
// SA1 to STE only and no SAL rows). The ABS file has no mesh-block allocation, so G-NAF localities are matched to SAL by name in
// gnaf-load.mjs and the match type is stored.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyMigrations } from "../../db/migrate.mjs";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { openFromCli } from "../lib/db.mjs";
import { SalRow } from "../lib/schemas.mjs";
import { minRows, publish, rowCountMatchesDeclared } from "../publish/publish.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_XLSX = path.join(root, "data", "raw", "national", "abs-geography", "2021_geog.xlsx");
export const SAL_SHEET = "2021_ASGS_Non_ABS_Structures";
export const SAL_AS_OF = "2021-07-01"; // ASGS Edition 3 effective date
const NON_GEOGRAPHIC = /^(no usual address|migratory)/i;

/** Read Victorian SAL rows (codes 2xxxx) from the ABS workbook. */
export async function readVicSals(xlsxPath = DEFAULT_XLSX) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(await readFile(xlsxPath), { sheets: SAL_SHEET });
  const sheet = wb.Sheets[SAL_SHEET];
  if (!sheet) throw new Error(`sheet ${SAL_SHEET} not found in ${xlsxPath}`);
  const out = [];
  for (const r of XLSX.utils.sheet_to_json(sheet, { header: 1 })) {
    if (r[0] !== "SAL") continue;
    const code = String(r[2]);
    if (!/^2\d{4}$/.test(code)) continue;
    const raw_name = String(r[3]);
    if (NON_GEOGRAPHIC.test(raw_name)) continue;
    const area = Number(r[4]);
    out.push(
      SalRow.parse({
        sal_code: code,
        name: raw_name.replace(/\s*\((?:vic\.?|victoria)\)\s*$/i, "").trim(),
        raw_name,
        area_sqkm: Number.isFinite(area) ? area : null,
      }),
    );
  }
  return out;
}

export async function loadSuburbs(db, { sals, file_sha256 = null, retrieved_at = new Date().toISOString(), minimum = 1, log = () => {} }) {
  const id = await createDatasetVersion(db, {
    source_id: "abs_asgs_2021",
    retrieved_at,
    file_sha256,
    as_of: SAL_AS_OF,
    row_count: sals.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(
      db,
      "ref_suburb",
      [
        { name: "sal_code", type: "text" },
        { name: "name", type: "text" },
        { name: "state", type: "text" },
        { name: "area_sqkm", type: "double precision" },
      ],
      id,
    );
    await insert(sals.map((s) => [s.sal_code, s.name, "VIC", s.area_sqkm]));
    log(`loaded ${await countRows(db, "ref_suburb", id)} suburbs`);
    await publish(db, {
      source_id: "abs_asgs_2021",
      dataset_version_id: id,
      checks: [rowCountMatchesDeclared("ref_suburb"), minRows("ref_suburb", minimum)],
    });
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
  return id;
}

async function main() {
  const { db, close, kind } = await openFromCli();
  try {
    if (kind === "pglite") await applyMigrations(db);
    const sals = await readVicSals();
    const sha = createHash("sha256").update(await readFile(DEFAULT_XLSX)).digest("hex");
    // Victoria has roughly 3,000 suburbs and localities; far fewer means the wrong file or sheet.
    const id = await loadSuburbs(db, { sals, file_sha256: sha, minimum: 2500, log: (m) => console.log(m) });
    console.log(`published abs_asgs_2021 dataset version ${id} (${sals.length} suburbs, ${kind})`);
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

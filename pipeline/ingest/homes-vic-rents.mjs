// Homes Victoria moving annual median rent by suburb and town -> series_rent, then publish (AD-7).
//
//   node pipeline/ingest/homes-vic-rents.mjs --pglite            in-memory dry run (applies migrations, loads suburbs first)
//   node --env-file=.env pipeline/ingest/homes-vic-rents.mjs      load and publish into the database named by DATABASE_URL
//
// One sheet per dwelling type in data/raw/vic/rents-homes-victoria/moving_annual_rent_jun2026.xlsx. Row 1 holds the quarter
// ("Jun 2026", twice per quarter), row 2 says Count then Median, rows from 3 hold one area each (column 0 is the region, column 1
// the suburb or town; "Group Total" rows are skipped). A Count is the number of new lettings in the 12 months to the quarter end.
// Parsing is ported from scripts/30-census-names.mjs and scripts/27-rent-check.mjs.
//
// Areas are matched to SAL codes here by name. Many areas are groups of suburbs ("Carlton-Parkville"); those do not match a
// single suburb and are counted and listed, never guessed. Only quarters from `from` (default 2015-06-30) are loaded.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { monthEnd, newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { mapNamesToSal, recordUnmatched } from "../lib/sal-map.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { RentRow } from "../lib/schemas.mjs";
import { loadAndPublish, runCli, suburbChecks } from "../lib/suburb-run.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_FILE = path.join(root, "data", "raw", "vic", "rents-homes-victoria", "moving_annual_rent_jun2026.xlsx");
export const SHEETS = {
  "1 bedroom flat": { dwelling_type: "unit", bedrooms: 1 },
  "2 bedroom flat": { dwelling_type: "unit", bedrooms: 2 },
  "3 bedroom flat": { dwelling_type: "unit", bedrooms: 3 },
  "2 bedroom house": { dwelling_type: "house", bedrooms: 2 },
  "3 bedroom house": { dwelling_type: "house", bedrooms: 3 },
  "4 bedroom house": { dwelling_type: "house", bedrooms: 4 },
  "All properties": { dwelling_type: "all", bedrooms: 0 },
};
const SOURCE_ID = "homes_victoria_rents";
const MONTH = { Mar: 3, Jun: 6, Sep: 9, Dec: 12 };
export const DEFAULT_FROM = "2015-06-30";

const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Parse one sheet grid. Returns { quarters: string[] (ISO quarter ends), areas: { area, values: { period, median, count }[] }[] }.
 * Exported for tests, which pass a small grid instead of the whole workbook.
 */
export function parseRentGrid(grid, { from = DEFAULT_FROM } = {}) {
  const header = grid[1] ?? [];
  const kind = grid[2] ?? [];
  const cols = [];
  for (let i = 2; i < header.length - 1; i++) {
    const m = /^(Mar|Jun|Sep|Dec) (\d{4})$/.exec(String(header[i]).trim());
    if (m && kind[i] === "Count" && kind[i + 1] === "Median") {
      const period = monthEnd(Number(m[2]), MONTH[m[1]]);
      if (period >= from) cols.push({ i, period });
    }
  }
  if (cols.length === 0) throw new Error("no Count/Median quarter columns found in the rent sheet");
  const areas = [];
  for (const r of grid.slice(3)) {
    const area = String(r[1] ?? "").trim();
    if (!area || area === "Group Total") continue;
    const values = [];
    for (const c of cols) {
      const median = num(r[c.i + 1]);
      if (median === null || median <= 0) continue;
      values.push({ period: c.period, median, count: num(r[c.i]) });
    }
    areas.push({ area, values });
  }
  return { quarters: cols.map((c) => c.period), areas };
}

export async function parseRents(file = DEFAULT_FILE, opts = {}) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(await readFile(file));
  const out = {};
  for (const sheet of Object.keys(SHEETS)) {
    if (!wb.Sheets[sheet]) throw new Error(`sheet "${sheet}" not found in ${file}`);
    out[sheet] = parseRentGrid(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" }), opts);
  }
  return out;
}

const COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "dwelling_type", type: "text" },
  { name: "bedrooms", type: "smallint" },
  { name: "period_type", type: "text" },
  { name: "period", type: "date" },
  { name: "median_weekly_rent_cents", type: "bigint" },
  { name: "lettings_count", type: "integer" },
  { name: "low_count", type: "boolean" },
  { name: "source_name", type: "text" },
  { name: "sal_match_type", type: "text" },
];

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} rent row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

export async function loadHomesVicRents(db, { file = DEFAULT_FILE, sals, from = DEFAULT_FROM, retrieved_at, log = () => {} }) {
  const index = buildSalIndex(sals);
  const sheets = await parseRents(file, { from });
  const name = path.basename(file);

  const rows = [];
  const files = [];
  const bad = [];
  let as_of = null;
  for (const [sheet, def] of Object.entries(SHEETS)) {
    const parsed = sheets[sheet];
    as_of = [as_of, ...parsed.quarters].filter(Boolean).sort().at(-1);
    const { matched, unmatched } = mapNamesToSal(index, parsed.areas, (a) => a.area, `${name} [${sheet}]`);
    files.push({ file: `${name} [${sheet}]`, records: parsed.areas.length, matched: matched.length, unmatched });
    for (const m of matched) {
      for (const v of m.rec.values) {
        const count = v.count === null ? null : Math.round(v.count);
        if (v.median < 20 || v.median > 20_000) {
          files.at(-1).unmatched.push({ file: `${name} [${sheet}]`, source_name: m.name, reason: "out_of_range", detail: `${v.period}: $${v.median} a week` });
          continue;
        }
        const row = {
          sal_code: m.sal_code,
          dwelling_type: def.dwelling_type,
          bedrooms: def.bedrooms,
          period_type: "moving_year",
          period: v.period,
          median_weekly_rent_cents: Math.round(v.median * 100),
          lettings_count: count,
          low_count: count !== null && count < 10,
          source_name: m.name,
          sal_match_type: m.match_type,
        };
        const ok = RentRow.safeParse(row);
        if (ok.success) rows.push(ok.data);
        else bad.push(`${m.name} ${sheet} ${row.period}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
      }
    }
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));

  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: retrieved_at ?? (await newestMtimeIso([file])),
    file_sha256: await sha256Of(file),
    as_of,
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "series_rent", COLUMNS, id);
    for (let i = 0; i < rows.length; i += 5000) {
      await insert(
        rows.slice(i, i + 5000).map((r) => [
          r.sal_code, r.dwelling_type, r.bedrooms, r.period_type, r.period, r.median_weekly_rent_cents,
          r.lettings_count, r.low_count, r.source_name, r.sal_match_type,
        ]),
      );
    }
    await recordUnmatched(db, id, files.flatMap((f) => f.unmatched));
    log(`loaded ${await countRows(db, "series_rent", id)} rent rows`);
    return { dataset_version_id: id, source_id: SOURCE_ID, rows: rows.length, files, as_of };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

export const rentChecks = (minimum = 5_000) =>
  suburbChecks({
    table: "series_rent",
    minimum,
    ranges: [
      {
        message: "series_rent has a median outside $20 to $20,000 a week or a negative lettings count",
        sql: `SELECT NOT EXISTS (SELECT 1 FROM series_rent WHERE dataset_version_id = $1
                AND (median_weekly_rent_cents NOT BETWEEN 2000 AND 2000000 OR COALESCE(lettings_count, 0) < 0)) AS ok`,
      },
    ],
  });

/**
 * @param {any} db
 * @param {{ file?: string, sals?: any[], minimum?: number, from?: string, log?: (m: string) => void }} [opts]
 */
export async function runHomesVicRents(db, { file, sals, minimum = 5_000, from, log } = {}) {
  const s = sals ?? (await readVicSals());
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: rentChecks(minimum),
    load: () => loadHomesVicRents(db, { file, sals: s, from, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli((db, { log }) => runHomesVicRents(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

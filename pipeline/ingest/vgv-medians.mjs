// Valuer-General Victoria median prices by suburb -> series_price, then publish (AD-7).
//
//   node pipeline/ingest/vgv-medians.mjs --pglite            in-memory dry run (applies migrations, loads suburbs first)
//   node --env-file=.env pipeline/ingest/vgv-medians.mjs      load and publish into the database named by DATABASE_URL
//
// Four files in data/raw/vic/sales-valuer-general: annual medians 2015 to 2025 and the March-quarter 2026 file (five quarters, with
// the sales count of the latest quarter), each for units and houses. Parsing is ported from scripts/25-vgv-growth.mjs and
// scripts/33-vgv-house-growth.mjs. Locality names are matched to SAL codes here, the match type is stored, and names that do not
// match a single suburb are counted and listed, never guessed.
//
// Cell flags in the source: "^" = fewer than 10 sales (kept as low_count), "*" = no sales, an earlier median carried forward
// (kept as carried_forward). The "Prelim 2026" column in the annual files is a part-year and is not loaded.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { monthEnd, newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { mapNamesToSal, recordUnmatched } from "../lib/sal-map.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { PriceRow } from "../lib/schemas.mjs";
import { loadAndPublish, runCli, suburbChecks } from "../lib/suburb-run.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "raw", "vic", "sales-valuer-general");
export const FILES = {
  unit: { annual: "units-by-suburb-2015-2025.xlsx", quarterly: "median-unit-march-quarter-2026.xls" },
  house: { annual: "houses-by-suburb-2015-2025.xlsx", quarterly: "median-house-march-quarter-2026.xls" },
};
const QUARTER_END = { "Jan-Mar": [3, 31], "Apr-Jun": [6, 30], "Jul-Sep": [9, 30], "Oct-Dec": [12, 31] };
const SOURCE_ID = "vgv_medians";
// A locality row is an upper-case name, optionally followed by a council in brackets. Footnotes and header text fail this test.
const LOCALITY = /^[A-Z][A-Z0-9 '().&-]*$/;

const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const flagOf = (cell) => String(cell ?? "").trim();

async function readSheet(file) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(await readFile(file));
  const sheet = wb.Sheets.Sheet1;
  if (!sheet) throw new Error(`sheet Sheet1 not found in ${file}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/**
 * Annual medians. Returns { years: number[], rows: { name, values: { year, median, low_count, carried_forward }[] }[] }.
 * The header row is the one whose first cell is "Locality"; each year column is followed by its flag column.
 */
export async function parseAnnual(file) {
  const grid = await readSheet(file);
  const header = grid.find((r) => r[0] === "Locality");
  if (!header) throw new Error(`no "Locality" header row in ${file}`);
  const cols = [];
  header.forEach((v, i) => {
    if (/^\d{4}$/.test(String(v))) cols.push({ year: Number(v), i });
  });
  if (cols.length < 5) throw new Error(`fewer than five year columns in ${file}`);
  const rows = [];
  for (const r of grid) {
    const name = String(r[0] ?? "").trim();
    if (!name || name === "Locality" || !LOCALITY.test(name)) continue;
    const values = [];
    for (const c of cols) {
      const median = num(r[c.i]);
      if (median === null || median <= 0) continue;
      const flag = flagOf(r[c.i + 1]);
      values.push({ year: c.year, median, low_count: flag === "^", carried_forward: flag === "*" });
    }
    rows.push({ name, values });
  }
  return { years: cols.map((c) => c.year), rows };
}

/**
 * Quarterly medians. The two header rows give "Jan-Mar" / 2025 for each quarter column; the "No. of Sales" column belongs to the
 * latest quarter. Returns { quarters: { end, label }[], latest_end, rows: { name, values: { end, median, low_count, carried_forward, sales_count }[] }[] }.
 */
export async function parseQuarterly(file) {
  const grid = await readSheet(file);
  const labels = grid[0];
  const years = grid[1];
  const cols = [];
  for (let i = 1; i < labels.length; i++) {
    const m = QUARTER_END[String(labels[i]).trim()];
    if (m && /^\d{4}$/.test(String(years[i]))) cols.push({ i, end: monthEnd(Number(years[i]), m[0]), label: `${String(labels[i]).trim()} ${years[i]}` });
  }
  if (cols.length === 0) throw new Error(`no quarter columns in ${file}`);
  // The sales-count column sits under the "No. of Sales" heading; it is the count for the latest quarter.
  const salesCol = labels.findIndex((l) => String(l).trim() === "No. of Sales");
  if (salesCol < 0) throw new Error(`no "No. of Sales" column in ${file}`);
  const latest = cols[cols.length - 1];
  const rows = [];
  for (const r of grid.slice(2)) {
    const name = String(r[0] ?? "").trim();
    if (!name || !LOCALITY.test(name)) continue;
    const values = [];
    for (const c of cols) {
      const median = num(r[c.i]);
      if (median === null || median <= 0) continue;
      const flag = flagOf(r[c.i + 1]);
      const sales = c === latest ? num(r[salesCol]) : null;
      values.push({
        end: c.end,
        median,
        low_count: flag === "^" || (sales !== null && sales < 10),
        carried_forward: flag === "*",
        sales_count: sales === null ? null : Math.round(sales),
      });
    }
    rows.push({ name, values });
  }
  return { quarters: cols.map((c) => ({ end: c.end, label: c.label })), latest_end: latest.end, rows };
}

const COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "dwelling_type", type: "text" },
  { name: "period_type", type: "text" },
  { name: "period", type: "date" },
  { name: "median_cents", type: "bigint" },
  { name: "sales_count", type: "integer" },
  { name: "low_count", type: "boolean" },
  { name: "carried_forward", type: "boolean" },
  { name: "source_name", type: "text" },
  { name: "sal_match_type", type: "text" },
];

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} price row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

/**
 * Parse the four files, map names to SAL, validate with zod and insert under a new dataset version (status `loading`).
 * @returns {{ dataset_version_id: string, source_id: string, rows: number, files: object[], as_of: string }}
 */
export async function loadVgvMedians(db, { dir = DEFAULT_DIR, sals, retrieved_at, log = () => {} }) {
  const index = buildSalIndex(sals);
  const paths = [];
  const parsed = [];
  for (const [dwelling, f] of Object.entries(FILES)) {
    for (const kind of ["annual", "quarterly"]) {
      const file = path.join(dir, f[kind]);
      paths.push(file);
      parsed.push({ dwelling, kind, file: f[kind], data: kind === "annual" ? await parseAnnual(file) : await parseQuarterly(file) });
    }
  }

  const rows = [];
  const files = [];
  const bad = [];
  for (const p of parsed) {
    const { matched, unmatched } = mapNamesToSal(index, p.data.rows, (r) => r.name, p.file);
    files.push({ file: p.file, records: p.data.rows.length, matched: matched.length, unmatched });
    for (const m of matched) {
      for (const v of m.rec.values) {
        // A source value outside the plausible range (a $7,000 unit median) is set aside and listed, not loaded and not guessed.
        if (v.median < 20_000 || v.median > 50_000_000) {
          files.at(-1).unmatched.push({
            file: p.file,
            source_name: m.name,
            reason: "out_of_range",
            detail: `${p.dwelling} ${p.kind === "annual" ? v.year : v.end}: $${v.median}`,
          });
          continue;
        }
        const row = {
          sal_code: m.sal_code,
          dwelling_type: p.dwelling,
          period_type: p.kind === "annual" ? "year" : "quarter",
          period: p.kind === "annual" ? monthEnd(v.year, 12) : v.end,
          median_cents: Math.round(v.median * 100),
          sales_count: v.sales_count ?? null,
          low_count: v.low_count,
          carried_forward: v.carried_forward,
          source_name: m.name,
          sal_match_type: m.match_type,
        };
        const ok = PriceRow.safeParse(row);
        if (ok.success) rows.push(ok.data);
        else bad.push(`${m.name} ${p.dwelling} ${row.period}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
      }
    }
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));

  const latestEnds = parsed.filter((p) => p.kind === "quarterly").map((p) => p.data.latest_end);
  const as_of = latestEnds.sort().at(-1);
  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: retrieved_at ?? (await newestMtimeIso(paths)),
    file_sha256: await sha256Of(paths),
    as_of,
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "series_price", COLUMNS, id);
    for (let i = 0; i < rows.length; i += 5000) {
      await insert(
        rows.slice(i, i + 5000).map((r) => [
          r.sal_code, r.dwelling_type, r.period_type, r.period, r.median_cents, r.sales_count,
          r.low_count, r.carried_forward, r.source_name, r.sal_match_type,
        ]),
      );
    }
    await recordUnmatched(db, id, files.flatMap((f) => f.unmatched));
    log(`loaded ${await countRows(db, "series_price", id)} price rows`);
    return { dataset_version_id: id, source_id: SOURCE_ID, rows: rows.length, files, as_of };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

export const vgvChecks = (minimum = 10_000) =>
  suburbChecks({
    table: "series_price",
    minimum,
    ranges: [
      {
        message: "series_price has a median outside $20,000 to $50,000,000 or a negative sales count",
        sql: `SELECT NOT EXISTS (SELECT 1 FROM series_price WHERE dataset_version_id = $1
                AND (median_cents NOT BETWEEN 2000000 AND 5000000000 OR COALESCE(sales_count, 0) < 0)) AS ok`,
      },
      {
        message: "series_price has no unit rows or no house rows",
        sql: `SELECT (EXISTS (SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND dwelling_type = 'unit')
                  AND EXISTS (SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND dwelling_type = 'house')) AS ok`,
      },
    ],
  });

/** Load and publish. `minimum` is the least number of price rows a real Victorian load should have. */
/**
 * @param {any} db
 * @param {{ dir?: string, sals?: any[], minimum?: number, log?: (m: string) => void }} [opts]
 */
export async function runVgvMedians(db, { dir, sals, minimum = 10_000, log } = {}) {
  const s = sals ?? (await readVicSals());
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: vgvChecks(minimum),
    load: () => loadVgvMedians(db, { dir, sals: s, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli((db, { log }) => runVgvMedians(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

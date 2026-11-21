// ABS 2021 Census General Community Profile, suburbs and localities (SAL 2021) -> fact_suburb_marker, then publish (AD-7).
//
//   node pipeline/ingest/census-sal.mjs --pglite            in-memory dry run (applies migrations, loads suburbs first)
//   node --env-file=.env pipeline/ingest/census-sal.mjs      load and publish into the database named by DATABASE_URL
//
// Reads four tables from data/raw/national/census-2021/2021_GCP_SAL_VIC.zip (through the python zip helper): G01 population,
// G02 medians, G36 dwelling structure and occupancy, G37 tenure by structure. The table and column choices follow
// scripts/36-backtest-multistate.py. Census files are already keyed by SAL 2021 code ("SAL20766"), so there is no name matching
// and the stored match type is "code". Codes that are not in the published suburb list are counted and listed.
//
// Markers (shares are fractions 0..1, money is integer cents):
//   population, dwellings, owner_share, flat_share, unoccupied_share, median_age,
//   median_household_income_weekly_cents, median_rent_weekly_cents, median_mortgage_monthly_cents
//   owner_share      = (owned outright + owned with mortgage) / (owned + rented), only where that base is above 20 households
//   flat_share       = households in flats or apartments / households in the tenure table
//   unoccupied_share = unoccupied private dwellings / private dwellings
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { parseDelimited } from "../lib/csv.mjs";
import { newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { recordUnmatched } from "../lib/sal-map.mjs";
import { MarkerRow } from "../lib/schemas.mjs";
import { loadAndPublish, runCli, suburbChecks } from "../lib/suburb-run.mjs";
import { readZipMembers } from "../lib/zip.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_ZIP = path.join(root, "data", "raw", "national", "census-2021", "2021_GCP_SAL_VIC.zip");
export const CENSUS_AS_OF = "2021-08-10"; // Census night
const SOURCE_ID = "abs_census_2021";
const TABLES = { G01: /G01_VIC_SAL\.csv$/, G02: /G02_VIC_SAL\.csv$/, G36: /G36_VIC_SAL\.csv$/, G37: /G37_VIC_SAL\.csv$/ };

export const MARKER_KEYS = [
  "population",
  "dwellings",
  "owner_share",
  "flat_share",
  "unoccupied_share",
  "median_age",
  "median_household_income_weekly_cents",
  "median_rent_weekly_cents",
  "median_mortgage_monthly_cents",
];

const code = (row) => String(row.SAL_CODE_2021 ?? "").replace(/^SAL/, "");
const n = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const positive = (v) => (v !== null && v > 0 ? v : null);
const cents = (v) => (v === null ? null : Math.round(v * 100));
const ratio = (a, b) => (a !== null && b !== null && b > 0 ? a / b : null);

/**
 * Build marker rows from the four tables' CSV text. A marker the Census does not give for a suburb (zero or blank) is left out,
 * never filled in. A share above 1 (the ABS adds random noise to small cells, so a tiny suburb can show more unoccupied dwellings
 * than dwellings) is set aside in `out_of_range`, not clamped. Returns { rows, out_of_range, codes }.
 */
export function buildCensusMarkers(texts) {
  const by = (name) => new Map(parseDelimited(texts[name]).map((r) => [code(r), r]));
  const g01 = by("G01");
  const g02 = by("G02");
  const g36 = by("G36");
  const g37 = by("G37");
  const codes = [...new Set([...g01.keys(), ...g02.keys(), ...g36.keys(), ...g37.keys()])].sort();
  const rows = [];
  const out_of_range = [];
  for (const sal_code of codes) {
    const a = g01.get(sal_code) ?? {};
    const b = g02.get(sal_code) ?? {};
    const c = g36.get(sal_code) ?? {};
    const d = g37.get(sal_code) ?? {};
    const own = (n(d.O_OR_Total) ?? 0) + (n(d.O_MTG_Total) ?? 0);
    const rent = n(d.R_Tot_Total) ?? 0;
    const markers = {
      population: n(a.Tot_P_P),
      dwellings: n(c.Total_PDs_Dwellings),
      owner_share: own + rent > 20 ? own / (own + rent) : null,
      flat_share: ratio(n(d.Total_DS_Flat_apart), n(d.Total_Total)),
      unoccupied_share: ratio(n(c.Unoccupied_PDs_Dwgs), n(c.Total_PDs_Dwellings)),
      median_age: positive(n(b.Median_age_persons)),
      median_household_income_weekly_cents: cents(positive(n(b.Median_tot_hhd_inc_weekly))),
      median_rent_weekly_cents: cents(positive(n(b.Median_rent_weekly))),
      median_mortgage_monthly_cents: cents(positive(n(b.Median_mortgage_repay_monthly))),
    };
    for (const [marker_key, value] of Object.entries(markers)) {
      if (value === null) continue;
      if (marker_key.endsWith("_share") && (value < 0 || value > 1)) {
        out_of_range.push({ sal_code, marker_key, value });
        continue;
      }
      rows.push({ sal_code, marker_key, value, flag: null });
    }
  }
  return { rows, out_of_range, codes };
}

export function readCensusZip(zipPath = DEFAULT_ZIP) {
  const found = readZipMembers(zipPath, Object.values(TABLES).map((r) => r.source));
  return Object.fromEntries(Object.entries(TABLES).map(([name, re]) => [name, found[re.source]]));
}

export const MARKER_COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "marker_key", type: "text" },
  { name: "value", type: "double precision" },
  { name: "flag", type: "text" },
];

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} marker row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

/** Shared by the Census and SEIFA loaders: validate marker rows, split off codes not in the suburb list, insert, record. */
export async function insertMarkers(db, { source_id, rows, out_of_range = [], sals, file, as_of, file_sha256, retrieved_at, log }) {
  const known = new Set(sals.map((s) => s.sal_code));
  const unmatchedCodes = new Map();
  const keep = [];
  const bad = [];
  for (const r of rows) {
    if (!known.has(r.sal_code)) {
      if (/^2\d{4}$/.test(r.sal_code)) unmatchedCodes.set(r.sal_code, "not_in_suburb_list");
      else unmatchedCodes.set(r.sal_code, "outside_vic");
      continue;
    }
    const ok = MarkerRow.safeParse(r);
    if (ok.success) keep.push(ok.data);
    else bad.push(`${r.sal_code} ${r.marker_key}: ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));
  const unmatched = [
    ...[...unmatchedCodes].map(([c, reason]) => ({ file, source_name: c, reason, detail: "SAL code is not in the published suburb list" })),
    ...out_of_range
      .filter((r) => known.has(r.sal_code))
      .map((r) => ({ file, source_name: r.sal_code, reason: "out_of_range", detail: `${r.marker_key} = ${r.value}` })),
  ];
  const suburbs = new Set(keep.map((r) => r.sal_code)).size;

  const id = await createDatasetVersion(db, { source_id, retrieved_at, file_sha256, as_of, row_count: keep.length, states: ["VIC"] });
  try {
    const insert = makeBatchInserter(db, "fact_suburb_marker", MARKER_COLUMNS, id);
    for (let i = 0; i < keep.length; i += 5000) {
      await insert(keep.slice(i, i + 5000).map((r) => [r.sal_code, r.marker_key, r.value, r.flag]));
    }
    await recordUnmatched(db, id, unmatched);
    log?.(`loaded ${await countRows(db, "fact_suburb_marker", id)} marker rows for ${suburbs} suburbs`);
    return { dataset_version_id: id, source_id, rows: keep.length, files: [{ file, records: new Set(rows.map((r) => r.sal_code)).size, matched: suburbs, unmatched }], as_of };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

export async function loadCensus(db, { zip = DEFAULT_ZIP, texts, sals, retrieved_at, log = () => {} }) {
  const t = texts ?? readCensusZip(zip);
  const { rows, out_of_range } = buildCensusMarkers(t);
  return insertMarkers(db, {
    source_id: SOURCE_ID,
    rows,
    out_of_range,
    sals,
    file: path.basename(zip),
    as_of: CENSUS_AS_OF,
    file_sha256: texts ? null : await sha256Of(zip),
    retrieved_at: retrieved_at ?? (texts ? new Date().toISOString() : await newestMtimeIso([zip])),
    log,
  });
}

export const censusChecks = (minimum = 15_000) =>
  suburbChecks({
    table: "fact_suburb_marker",
    minimum,
    ranges: [
      {
        message: "fact_suburb_marker has a share outside 0 to 1, a negative count, or an implausible median age",
        sql: `SELECT NOT EXISTS (SELECT 1 FROM fact_suburb_marker WHERE dataset_version_id = $1 AND (
                (marker_key LIKE '%\\_share' AND (value < 0 OR value > 1))
                OR (marker_key IN ('population', 'dwellings') AND value < 0)
                OR (marker_key = 'median_age' AND (value <= 0 OR value > 120)))) AS ok`,
      },
    ],
  });

/**
 * @param {any} db
 * @param {{ zip?: string, texts?: Record<string, string>, sals?: any[], minimum?: number, log?: (m: string) => void }} [opts]
 */
export async function runCensus(db, { zip, texts, sals, minimum = 15_000, log } = {}) {
  const s = sals ?? (await readVicSals());
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: censusChecks(minimum),
    load: () => loadCensus(db, { zip, texts, sals: s, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli((db, { log }) => runCensus(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

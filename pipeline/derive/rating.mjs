// Conditions rating for Victorian apartment suburbs -> derived_rating, then publish (AD-5, AD-7, AD-8).
//
//   node pipeline/derive/rating.mjs --pglite            in-memory dry run on the real files (loads suburbs, Valuer-General medians and
//                                                      the Census first), prints the fifths and the regression result
//   node --env-file=.env pipeline/derive/rating.mjs      derive from the published Census and Valuer-General datasets in DATABASE_URL
//
// The method is exactly the a-priori composite of scripts/36-backtest-multistate.py, fixed before its results were seen:
//   score = z(owner share) - z(flat share) - z(unoccupied share)
// z-scored across the eligible suburbs: at least 300 private dwellings, all three Census markers, and an annual unit median in every
// year 2015 to 2025 (the same completeness test the backtest used). It is a rating of CONDITIONS, never a price forecast (AD-10).
//
// Output: one derived_rating row per rated suburb (dwelling_type 'unit', score, band '1' to '5' where '1' is the top fifth). The
// position ("212 of 440") is not stored: the serve plane counts it from the scores of the same dataset version.
//
// Publish checks (a failed check keeps the old rating live): row count, minimum, no big shrink, every suburb in the suburb list,
// bands 1 to 5 in score order, and the REGRESSION: the published scores, set against the loaded Valuer-General series, must still
// have the top fifth outgrow the bottom fifth at least 70% of the time in both 2021-origin windows (the backtest read 75% and 80%).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { openForSuburbData, suburbChecks } from "../lib/suburb-run.mjs";
import { publish } from "../publish/publish.mjs";
import { runCensus } from "../ingest/census-sal.mjs";
import { runVgvMedians } from "../ingest/vgv-medians.mjs";
import { readVicSals } from "../ingest/suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RATING_SOURCE = "conditions_rating";
export const CENSUS_SOURCE = "abs_census_2021";
export const VGV_SOURCE = "vgv_medians";
export const DWELLING_TYPE = "unit";
/** Eligibility, as in the backtest (min_dw=300 and a full 2015 to 2025 annual series). */
export const MIN_DWELLINGS = 300;
export const HISTORY_FIRST_YEAR = 2015;
export const HISTORY_LAST_YEAR = 2025;
/** The a-priori signs, set before any results (backtest-multistate-2026-11-14.md). */
export const SIGNS = { owner_share: +1, flat_share: -1, unoccupied_share: -1 };
/** The 2021-origin windows of the backtest: Census 2021, growth to 2024 (3 years) and to 2025 (4 years). */
export const REGRESSION = { origin: 2021, forwards: [3, 4], floor: 0.7, minRows: 25 };

// ---------------------------------------------------------------- pure maths (ported from scripts/36-backtest-multistate.py)

/** Population z-scores. A flat column (standard deviation 0) divides by 1, as the backtest did. */
export function zscores(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return values.map((v) => (v - mean) / sd);
}

/**
 * Score every row: sum of sign x z(marker) across the given rows. Returns new rows with `score`.
 * @param {{ sal_code: string, owner_share: number, flat_share: number, unoccupied_share: number }[]} rows
 */
export function scoreRows(rows) {
  if (rows.length === 0) return [];
  const z = Object.fromEntries(Object.keys(SIGNS).map((m) => [m, zscores(rows.map((r) => r[m]))]));
  return rows.map((r, i) => ({ ...r, score: Object.entries(SIGNS).reduce((sum, [m, sign]) => sum + sign * z[m][i], 0) }));
}

/** Position from the top (1 + the number strictly higher, so a tie shares a place) and the fifth it falls in (1 = top). */
export function assignFifths(scored) {
  const n = scored.length;
  return scored.map((r) => {
    const position = 1 + scored.filter((o) => o.score > r.score).length;
    return { ...r, position, fifth: Math.min(5, Math.floor(((position - 1) * 5) / n) + 1) };
  });
}

/**
 * Chance that a random suburb from the top fifth by score outgrew a random one from the bottom fifth (a tie counts half).
 * 50% is no skill. Same construction as the backtest: q = max(n // 5, 3), stable ascending sort by score.
 * @param {{ score: number, growth: number }[]} rows
 */
export function pairwise(rows) {
  const idx = rows.map((_, i) => i).sort((a, b) => rows[a].score - rows[b].score);
  const q = Math.max(Math.floor(rows.length / 5), 3);
  const top = idx.slice(-q).map((i) => rows[i].growth);
  const bottom = idx.slice(0, q).map((i) => rows[i].growth);
  let wins = 0;
  for (const t of top) for (const u of bottom) wins += t > u ? 1 : t === u ? 0.5 : 0;
  return wins / (top.length * bottom.length);
}

/** Annual growth in percent between two 2-year-smoothed medians, as the backtest measured it. */
export function smoothedGrowth(series, origin, forward) {
  const sm = (y) => (series[y] + series[y - 1]) / 2;
  const need = [origin - 1, origin, origin + forward - 1, origin + forward];
  if (!need.every((y) => series[y] > 0)) return null;
  return ((sm(origin + forward) / sm(origin)) ** (1 / forward) - 1) * 100;
}

// ---------------------------------------------------------------- reading the inputs from the current datasets (AD-7)

const MARKER_KEYS = ["dwellings", ...Object.keys(SIGNS)];
const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Suburb inputs from the CURRENT Census and Valuer-General datasets. Returns the eligible suburbs, the ones left out with the reason,
 * and the dataset ids and dates the rating rests on.
 */
export async function readRatingInputs(db) {
  const census = await db.query(
    `SELECT c.dataset_version_id::text AS id, to_char(v.as_of, 'YYYY-MM-DD') AS as_of
     FROM src_dataset_current c JOIN src_dataset_version v ON v.dataset_version_id = c.dataset_version_id WHERE c.source_id = $1`,
    [CENSUS_SOURCE],
  );
  const vgv = await db.query(`SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = $1`, [VGV_SOURCE]);
  if (census.length === 0) throw new Error("no published Census dataset (abs_census_2021). Run `npm run pipeline:census` first.");
  if (vgv.length === 0) throw new Error("no published Valuer-General dataset (vgv_medians). Run `npm run pipeline:vgv` first.");

  const markers = await db.query(
    `SELECT m.sal_code, m.marker_key, m.value::float8 AS value
     FROM fact_suburb_marker m JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = m.dataset_version_id
     WHERE m.marker_key = ANY($2::text[]) AND m.value IS NOT NULL`,
    [CENSUS_SOURCE, MARKER_KEYS],
  );
  const history = await db.query(
    `SELECT p.sal_code, EXTRACT(YEAR FROM p.period)::int AS year, p.median_cents::float8 AS median
     FROM series_price p JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
     WHERE p.dwelling_type = $2 AND p.period_type = 'year' AND p.median_cents > 0`,
    [VGV_SOURCE, DWELLING_TYPE],
  );

  const bySal = new Map();
  for (const m of markers) {
    const row = bySal.get(m.sal_code) ?? { sal_code: m.sal_code };
    row[m.marker_key] = m.value;
    bySal.set(m.sal_code, row);
  }
  const series = new Map();
  for (const h of history) {
    const s = series.get(h.sal_code) ?? {};
    s[h.year] = h.median;
    series.set(h.sal_code, s);
  }

  const years = Array.from({ length: HISTORY_LAST_YEAR - HISTORY_FIRST_YEAR + 1 }, (_, i) => HISTORY_FIRST_YEAR + i);
  const eligible = [];
  const left_out = { too_few_dwellings: 0, missing_marker: 0, no_price_history: 0 };
  for (const row of bySal.values()) {
    if (row.dwellings === undefined || row.dwellings < MIN_DWELLINGS) left_out.too_few_dwellings += 1;
    else if (Object.keys(SIGNS).some((k) => row[k] === undefined)) left_out.missing_marker += 1;
    else if (!years.every((y) => series.get(row.sal_code)?.[y] > 0)) left_out.no_price_history += 1;
    else eligible.push({ ...row, series: series.get(row.sal_code) });
  }
  eligible.sort((a, b) => a.sal_code.localeCompare(b.sal_code));
  return { as_of: census[0].as_of, census_version: census[0].id, vgv_version: vgv[0].id, eligible, left_out };
}

/** Score and place every eligible suburb. */
export function buildRating(eligible) {
  return assignFifths(scoreRows(eligible));
}

// ---------------------------------------------------------------- the regression check

/**
 * The published scores of one dataset version against the loaded Valuer-General series, for each 2021-origin window.
 * Returns [{ origin, forward, n, pairwise }]; `pairwise` is null when fewer than `minRows` suburbs have the outcome.
 */
export async function evaluateRegression(db, datasetVersionId, { origin, forwards, minRows } = REGRESSION) {
  const scores = await db.query(
    `SELECT sal_code, score::float8 AS score FROM derived_rating WHERE dataset_version_id = $1 AND dwelling_type = $2`,
    [datasetVersionId, DWELLING_TYPE],
  );
  const history = await db.query(
    `SELECT p.sal_code, EXTRACT(YEAR FROM p.period)::int AS year, p.median_cents::float8 AS median
     FROM series_price p JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = p.dataset_version_id
     WHERE p.dwelling_type = $2 AND p.period_type = 'year' AND p.median_cents > 0`,
    [VGV_SOURCE, DWELLING_TYPE],
  );
  const series = new Map();
  for (const h of history) {
    const s = series.get(h.sal_code) ?? {};
    s[h.year] = h.median;
    series.set(h.sal_code, s);
  }
  return forwards.map((forward) => {
    const rows = [];
    for (const s of scores) {
      const growth = series.has(s.sal_code) ? smoothedGrowth(series.get(s.sal_code), origin, forward) : null;
      if (growth !== null) rows.push({ score: s.score, growth });
    }
    return { origin, forward, n: rows.length, pairwise: rows.length >= minRows ? pairwise(rows) : null };
  });
}

/** Publish check: every window must read at least `floor`. `sink` receives the windows so the caller can print them. */
export function regressionCheck(options = REGRESSION, sink = []) {
  const opts = { ...REGRESSION, ...options };
  return async (db, ctx) => {
    const windows = await evaluateRegression(db, ctx.dataset_version_id, opts);
    sink.splice(0, sink.length, ...windows);
    if (windows.length === 0) return "regression has no windows to check, so it cannot confirm the rating still holds";
    const thin = windows.filter((w) => w.pairwise === null);
    if (thin.length > 0) {
      return `regression could not run: ${thin.map((w) => `${w.origin} to ${w.origin + w.forward} has ${w.n} suburbs`).join(", ")} (needs ${opts.minRows})`;
    }
    const low = windows.filter((w) => w.pairwise < opts.floor);
    return low.length === 0
      ? null
      : `regression: ${low.map((w) => `${w.origin} to ${w.origin + w.forward} reads ${(w.pairwise * 100).toFixed(1)}%`).join(", ")}, below the ${Math.round(opts.floor * 100)}% floor`;
  };
}

// ---------------------------------------------------------------- load and publish

export const RATING_COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "dwelling_type", type: "text" },
  { name: "score", type: "double precision" },
  { name: "band", type: "text" },
];

export function ratingChecks({ minimum = 300 } = {}) {
  return [
    ...suburbChecks({
      table: "derived_rating",
      minimum,
      previousRatio: 0.8,
      ranges: [
        {
          message: "derived_rating has a row that is not a unit rating, or a band outside 1 to 5",
          sql: `SELECT NOT EXISTS (SELECT 1 FROM derived_rating WHERE dataset_version_id = $1 AND (dwelling_type <> 'unit' OR band IS NULL OR band NOT IN ('1','2','3','4','5'))) AS ok`,
        },
        {
          message: "derived_rating does not use all five fifths",
          sql: `SELECT (count(*) < 5 OR count(DISTINCT band) = 5) AS ok FROM derived_rating WHERE dataset_version_id = $1`,
        },
        {
          message: "derived_rating has a fifth holding under a tenth of the suburbs",
          sql: `SELECT NOT EXISTS (SELECT 1 FROM derived_rating WHERE dataset_version_id = $1 GROUP BY band
                  HAVING count(*) < 0.1 * (SELECT count(*) FROM derived_rating WHERE dataset_version_id = $1)) AS ok`,
        },
        {
          message: "derived_rating has a suburb in a higher fifth with a lower or equal score than one in a lower fifth",
          sql: `SELECT NOT EXISTS (
                  SELECT 1 FROM derived_rating a JOIN derived_rating b
                    ON b.dataset_version_id = a.dataset_version_id AND a.dwelling_type = b.dwelling_type AND a.band::int < b.band::int AND a.score <= b.score
                  WHERE a.dataset_version_id = $1) AS ok`,
        },
      ],
    }),
  ];
}

/**
 * Derive the rating from the current Census and Valuer-General datasets and publish it.
 * `regression: false` skips the backtest check (tests on tiny fixtures only); otherwise it must pass.
 * Returns the usual loader summary plus `fifths` (rows per fifth), `left_out` and `regression` (the windows that were checked).
 */
export async function runRating(db, { minimum = 300, regression = {}, log = () => {} } = {}) {
  const inputs = await readRatingInputs(db);
  const rated = buildRating(inputs.eligible);
  const fifths = [1, 2, 3, 4, 5].map((f) => rated.filter((r) => r.fifth === f).length);
  const windows = [];
  const checks = [...ratingChecks({ minimum }), ...(regression === false ? [] : [regressionCheck(regression, windows)])];

  const body = rated.map((r) => `${r.sal_code}|${r.score}|${r.fifth}`).join("\n");
  const id = await createDatasetVersion(db, {
    source_id: RATING_SOURCE,
    retrieved_at: new Date().toISOString(),
    file_sha256: sha(`census:${inputs.census_version}\nvgv:${inputs.vgv_version}\n${body}`),
    as_of: inputs.as_of,
    row_count: rated.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "derived_rating", RATING_COLUMNS, id);
    for (let i = 0; i < rated.length; i += 2000) {
      await insert(rated.slice(i, i + 2000).map((r) => [r.sal_code, DWELLING_TYPE, r.score, String(r.fifth)]));
    }
    log(`derived ${rated.length} ratings; left out: ${JSON.stringify(inputs.left_out)}`);
    await publish(db, { source_id: RATING_SOURCE, dataset_version_id: id, checks });
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
  return { source_id: RATING_SOURCE, dataset_version_id: id, rows: rated.length, as_of: inputs.as_of, files: [], fifths, left_out: inputs.left_out, regression: windows, rated };
}

// ---------------------------------------------------------------- CLI

function backtestReference() {
  const file = path.join(root, "data", "backtest_multistate_results.json");
  if (!existsSync(file)) return {};
  const w = JSON.parse(readFileSync(file, "utf8")).windows ?? {};
  return Object.fromEntries([3, 4].map((f) => [f, w[`apriori|VIC unit price|2021|${f}`]]));
}

export function printRating(summary, log = console.log) {
  log(`published ${summary.source_id} dataset version ${summary.dataset_version_id}: ${summary.rows} suburbs rated (Census as at ${summary.as_of})`);
  log(`  left out: ${summary.left_out.too_few_dwellings} under ${MIN_DWELLINGS} dwellings, ${summary.left_out.missing_marker} missing a marker, ${summary.left_out.no_price_history} without a full unit price history`);
  const label = ["top", "second", "third", "fourth", "bottom"];
  log(`  fifths: ${summary.fifths.map((n, i) => `${label[i]} ${n}`).join(", ")}`);
  const ref = backtestReference();
  for (const w of summary.regression) {
    const b = ref[w.forward];
    log(`  regression ${w.origin} to ${w.origin + w.forward}: ${(w.pairwise * 100).toFixed(1)}% on ${w.n} suburbs (floor ${Math.round(REGRESSION.floor * 100)}%${b ? `; backtest file ${(b.pair * 100).toFixed(1)}% on ${b.n}` : ""})`);
  }
}

async function main() {
  const log = (m) => console.log(m);
  const opened = await openForSuburbData({ log });
  try {
    const { db, kind } = opened;
    if (kind === "pglite") {
      const sals = await readVicSals();
      await runVgvMedians(db, { sals, log });
      await runCensus(db, { sals, log });
    } else {
      const src = await db.query("SELECT 1 FROM src_source WHERE source_id = $1", [RATING_SOURCE]);
      if (src.length === 0) throw new Error("migration 0006 has not been applied. Run `node --env-file=.env db/migrate.mjs` first.");
    }
    const summary = await runRating(db, { log });
    printRating(summary, log);
    if (kind === "pglite") {
      const docklands = summary.rated.find((r) => r.sal_code === "20766");
      if (docklands) log(`  example: Docklands is ${docklands.position} of ${summary.rows}, fifth ${docklands.fifth}`);
    }
    log(`(${kind})`);
  } finally {
    await opened.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

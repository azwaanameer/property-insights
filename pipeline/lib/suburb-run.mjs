// Shared plumbing for the Victorian suburb-data loaders (vgv-medians, homes-vic-rents, census-sal, seifa-sal, locality-neighbours).
//
// Every loader follows the same shape: parse files -> map to SAL -> create a dataset version -> insert rows -> record unmatched ->
// publish with checks (AD-7). On any error the version is marked failed, its rows are deleted and the pointer is unchanged.
//
// CLI: `node pipeline/ingest/<loader>.mjs --pglite` is a self-contained in-memory dry run (applies migrations, loads suburbs first).
//      `node --env-file=.env pipeline/ingest/<loader>.mjs` loads into the database named by DATABASE_URL (never printed).
import { applyMigrations } from "../../db/migrate.mjs";
import { DEFAULT_XLSX, loadSuburbs, readVicSals } from "../ingest/suburbs-sal.mjs";
import { markFailed } from "./dataset.mjs";
import { openFromCli } from "./db.mjs";
import { sha256Of } from "./files.mjs";
import { notMuchSmallerThanPrevious, minRows, publish, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";

/**
 * Open the database for a loader run and make sure its prerequisites exist.
 *  - PGlite: migrations are applied and the suburb list is loaded, so a dry run needs nothing else.
 *  - A real database: migration 0004 must have been applied and the suburb list published (`npm run pipeline:sal`).
 */
export async function openForSuburbData({ argv = process.argv, env = process.env, log = () => {} } = {}) {
  const opened = await openFromCli(argv, env);
  const { db, kind } = opened;
  try {
    if (kind === "pglite") {
      await applyMigrations(db);
      const sals = await readVicSals();
      await loadSuburbs(db, { sals, file_sha256: await sha256Of(DEFAULT_XLSX), minimum: 2500 });
      log(`pglite: migrations applied, ${sals.length} suburbs loaded`);
    } else {
      const tables = await db.query("SELECT to_regclass('public.fact_suburb_marker') AS t");
      if (!tables[0]?.t) throw new Error("migration 0004 has not been applied. Run `node --env-file=.env db/migrate.mjs` first.");
      const cur = await db.query("SELECT 1 FROM src_dataset_current WHERE source_id = 'abs_asgs_2021'");
      if (cur.length === 0) throw new Error("no published suburb list. Run `node --env-file=.env pipeline/ingest/suburbs-sal.mjs` first.");
    }
  } catch (err) {
    await opened.close();
    throw err;
  }
  return opened;
}

/**
 * Publish checks every suburb dataset shares: row count equals the declared count, a minimum, no big shrink against the previous
 * version, every SAL code exists in the current suburb list. Extra `ranges` are `{ message, sql }` where sql returns one row with
 * boolean `ok` and takes the dataset version id as $1.
 */
export function suburbChecks({ table, salColumns = ["sal_code"], minimum, previousRatio = 0.8, ranges = [] }) {
  const salCheck = (column) =>
    sqlCheck(
      `${table}.${column} has codes that are not in the published suburb list`,
      `SELECT NOT EXISTS (
         SELECT 1 FROM ${table} t
         WHERE t.dataset_version_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM ref_suburb s JOIN src_dataset_current c ON c.source_id = 'abs_asgs_2021' AND c.dataset_version_id = s.dataset_version_id
             WHERE s.sal_code = t.${column})) AS ok`,
    );
  return [
    rowCountMatchesDeclared(table),
    minRows(table, minimum),
    notMuchSmallerThanPrevious(previousRatio),
    ...salColumns.map(salCheck),
    ...ranges.map((r) => sqlCheck(r.message, r.sql)),
  ];
}

/** Run `load` (which returns the new version id) and publish it; any failure marks the version failed. */
export async function loadAndPublish(db, { source_id, checks, load }) {
  const loaded = await load();
  try {
    await publish(db, { source_id, dataset_version_id: loaded.dataset_version_id, checks });
  } catch (err) {
    await markFailed(db, loaded.dataset_version_id);
    throw err;
  }
  return loaded;
}

/** Print the summary a loader returns, in the shape the implementation notes record. */
export function printSummary(summary, log = console.log) {
  log(`published ${summary.source_id} dataset version ${summary.dataset_version_id}: ${summary.rows} rows`);
  for (const f of summary.files ?? []) {
    log(`  ${f.file}: ${f.records} records, ${f.matched} matched, ${f.unmatched.length} set aside`);
  }
  // The same name is often set aside in several files; list each name once, with how many files it was missing from.
  const distinct = new Map();
  for (const u of (summary.files ?? []).flatMap((f) => f.unmatched)) {
    const key = `${u.source_name}|${u.reason}|${u.reason === "out_of_range" ? u.detail : ""}`;
    const cur = distinct.get(key) ?? { ...u, files: 0 };
    cur.files += 1;
    distinct.set(key, cur);
  }
  if (distinct.size) {
    log(`  set aside, ${distinct.size} distinct (unmatched names, ambiguous names, out-of-range values):`);
    for (const u of distinct.values()) log(`    ${u.source_name} (${u.reason}${u.detail ? `: ${u.detail}` : ""}) in ${u.files} file(s)`);
  }
}

/** Standard main wrapper: open, run, print, close; non-zero exit on failure. Never prints connection details. */
export async function runCli(run, { argv = process.argv } = {}) {
  const log = (m) => console.log(m);
  const opened = await openForSuburbData({ argv, log });
  try {
    const summary = await run(opened.db, { log, argv });
    printSummary(summary, log);
    log(`(${opened.kind})`);
  } finally {
    await opened.close();
  }
}

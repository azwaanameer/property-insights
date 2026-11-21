// Shared plumbing for the batch-2 loaders (gtfs-stops, school-zones, com-buildings). Unlike the suburb loaders they need no suburb list:
// rows are keyed by stop, school or property, and located by coordinates.
//
// CLI: `node pipeline/ingest/<loader>.mjs --pglite` is a self-contained in-memory dry run (migrations applied, nothing else needed).
//      `node --env-file=.env pipeline/ingest/<loader>.mjs` loads into the database named by DATABASE_URL (never printed).
import { applyMigrations } from "../../db/migrate.mjs";
import { openFromCli } from "./db.mjs";
import { printSummary } from "./suburb-run.mjs";

/** Open the database for a loader run. A real database must already have migration 0007 (the batch-2 tables). */
export async function openForPoints({ argv = process.argv, env = process.env, log = () => {} } = {}) {
  const opened = await openFromCli(argv, env);
  try {
    if (opened.kind === "pglite") {
      await applyMigrations(opened.db);
      log("pglite: migrations applied");
    } else {
      const t = await opened.db.query("SELECT to_regclass('public.ref_transit_stop') AS t");
      if (!t[0]?.t) throw new Error("migration 0007 has not been applied. Run `node --env-file=.env db/migrate.mjs` first.");
    }
  } catch (err) {
    await opened.close();
    throw err;
  }
  return opened;
}

/** Standard main wrapper: open, run, print, close; non-zero exit on failure. Never prints connection details. */
export async function runPointCli(run, { argv = process.argv } = {}) {
  const log = (m) => console.log(m);
  const opened = await openForPoints({ argv, log });
  try {
    const summaries = [].concat(await run(opened.db, { log, argv, kind: opened.kind }));
    for (const s of summaries) printSummary(s, log);
    log(`(${opened.kind})`);
  } finally {
    await opened.close();
  }
}

/** Value of `--name VALUE` on the command line, or the default. */
export function cliArg(argv, name, fallback = undefined) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

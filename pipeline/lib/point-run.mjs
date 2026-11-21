// Shared plumbing for the batch-2 loaders (gtfs-stops, school-zones, com-buildings). Unlike the suburb loaders they need no suburb list:
// rows are keyed by stop, school or property, and located by coordinates.
//
// CLI: `node pipeline/ingest/<loader>.mjs --pglite` is a self-contained in-memory dry run (migrations applied, nothing else needed).
//      `node --env-file=.env pipeline/ingest/<loader>.mjs` loads into the database named by DATABASE_URL (never printed).
import { applyMigrations } from "../../db/migrate.mjs";
import { openFromCli } from "./db.mjs";
import { printSummary } from "./suburb-run.mjs";

/** The table and migration a real database must already have. Batch 2 loaders need 0007; the crime loader names its own (0008). */
const BATCH2 = { table: "ref_transit_stop", migration: "0007" };

/** Open the database for a loader run. A real database must already have the migration that creates `require.table` (default: 0007, the batch-2 tables). */
export async function openForPoints({ argv = process.argv, env = process.env, log = () => {}, require = BATCH2 } = {}) {
  const opened = await openFromCli(argv, env);
  try {
    if (opened.kind === "pglite") {
      await applyMigrations(opened.db);
      log("pglite: migrations applied");
    } else {
      const t = await opened.db.query("SELECT to_regclass($1) AS t", [`public.${require.table}`]);
      if (!t[0]?.t) throw new Error(`migration ${require.migration} has not been applied. Run \`node --env-file=.env db/migrate.mjs\` first.`);
    }
  } catch (err) {
    await opened.close();
    throw err;
  }
  return opened;
}

/** Standard main wrapper: open, run, print, close; non-zero exit on failure. Never prints connection details. */
export async function runPointCli(run, { argv = process.argv, require } = {}) {
  const log = (m) => console.log(m);
  const opened = await openForPoints({ argv, log, ...(require ? { require } : {}) });
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

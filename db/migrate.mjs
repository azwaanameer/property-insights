// Plain-SQL migration runner. Applies db/migrations/*.sql in filename order, once each, recorded in schema_migrations.
//
//   node db/migrate.mjs --pglite     apply to an in-memory PGlite database (verification, no network)
//   DATABASE_URL=postgres://... node db/migrate.mjs     apply to that database
//
// Refuses to touch a remote database unless DATABASE_URL has been set by the user.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(here, "migrations");
export const DEV_SEED_FILE = path.join(here, "dev-seed.sql");

/** Development and test data only: clears gnaf and switches L01 on. Callers must have checked the target is not production. */
export async function applyDevSeed(db) {
  const sql = await readFile(DEV_SEED_FILE, "utf8");
  await (db.exec ?? ((s) => db.query(s)))(sql);
}

/** True for a localhost database URL. */
export function isLocalDatabaseUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/** @param {{ query: (text: string, params?: unknown[]) => Promise<unknown[]>, exec?: (sql: string) => Promise<unknown> }} db */
export async function applyMigrations(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const run = db.exec ?? ((sql) => db.query(sql));
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = new Set((await db.query("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    // One transaction per migration file: a failed file leaves nothing half applied.
    await run("BEGIN");
    try {
      await run(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await run("COMMIT");
    } catch (err) {
      await run("ROLLBACK");
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}

async function main() {
  const usePglite = process.argv.includes("--pglite");
  if (usePglite) {
    const { openPglite } = await import("../pipeline/lib/db.mjs");
    const { db, close } = await openPglite();
    const ran = await applyMigrations(db, { log: (m) => console.log(m) });
    await applyDevSeed(db);
    const tables = await db.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    console.log(`pglite: ${ran.length} migration(s) applied, ${tables[0].n} tables`);
    await close();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Set it yourself to run against a real database, or pass --pglite to verify in memory.");
    process.exit(2);
  }
  const devSeed = process.argv.includes("--dev-seed");
  if (devSeed && !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    console.error("--dev-seed is only allowed against PGlite (--pglite) or a localhost database. Refusing.");
    process.exit(2);
  }
  const { openPg } = await import("../pipeline/lib/db.mjs");
  const { db, close } = await openPg(process.env.DATABASE_URL);
  try {
    const ran = await applyMigrations(db, { log: (m) => console.log(m) });
    console.log(ran.length ? `${ran.length} migration(s) applied` : "up to date");
    if (devSeed) {
      await applyDevSeed(db);
      console.log("dev seed applied");
    }
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

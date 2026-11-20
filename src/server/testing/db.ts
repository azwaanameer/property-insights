// Test-only: in-process PGlite with the real migrations and the fixture Victorian dataset loaded through the real loader.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDevSeed, applyMigrations } from "../../../db/migrate.mjs";
import { openPglite } from "../../../pipeline/lib/db.mjs";
import { loadGnaf, publishGnaf } from "../../../pipeline/ingest/gnaf-load.mjs";
import { FIXTURE_SALS } from "../../../pipeline/ingest/fixtures/sals.mjs";
import { loadSuburbs } from "../../../pipeline/ingest/suburbs-sal.mjs";
import type { Db } from "../db";

export type TestDb = Db & {
  exec(sql: string): Promise<void>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
};

export const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../pipeline/ingest/fixtures/gnaf-vic");

export async function createTestDb(opts: { devSeed?: boolean } = {}): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const { db, close } = await openPglite();
  await applyMigrations(db);
  if (opts.devSeed ?? true) await applyDevSeed(db); // tests only; production migrations leave gnaf pending and L01 off
  return { db: db as TestDb, close };
}

/** Migrated database with fixture suburbs and addresses published. */
export async function createLoadedTestDb() {
  const t = await createTestDb();
  await loadSuburbs(t.db, { sals: FIXTURE_SALS });
  const loaded = await loadGnaf(t.db, { dir: FIXTURE_DIR, sals: FIXTURE_SALS });
  await publishGnaf(t.db, loaded);
  return t;
}

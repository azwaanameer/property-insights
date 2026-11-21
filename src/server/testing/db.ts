// Test-only: in-process PGlite with the real migrations and the fixture Victorian dataset loaded through the real loader.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDevSeed, applyMigrations } from "../../../db/migrate.mjs";
import { openPglite } from "../../../pipeline/lib/db.mjs";
import { loadGnaf, publishGnaf } from "../../../pipeline/ingest/gnaf-load.mjs";
import { FIXTURE_SALS } from "../../../pipeline/ingest/fixtures/sals.mjs";
import { loadSuburbs } from "../../../pipeline/ingest/suburbs-sal.mjs";
import { runCensus } from "../../../pipeline/ingest/census-sal.mjs";
import { SEIFA_FILE, CENSUS_TEXTS, NEIGHBOUR_TEXTS, SUBURB_DATA_SALS, writeRentFixture, writeVgvFixtures } from "../../../pipeline/ingest/fixtures/suburb-data.mjs";
import { runNeighbours } from "../../../pipeline/ingest/locality-neighbours.mjs";
import { runHomesVicRents } from "../../../pipeline/ingest/homes-vic-rents.mjs";
import { runSeifa } from "../../../pipeline/ingest/seifa-sal.mjs";
import { runVgvMedians } from "../../../pipeline/ingest/vgv-medians.mjs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
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

export type SuburbDataset = "vgv" | "rents" | "census" | "seifa" | "neighbours";

/**
 * Migrated database with the fixture addresses and every suburb dataset (excerpts of the real files) published through the real
 * loaders. `omit` leaves datasets unpublished, to test the dataset-missing row.
 */
export async function createSuburbDataTestDb(opts: { omit?: SuburbDataset[] } = {}) {
  const t = await createTestDb();
  const sals = SUBURB_DATA_SALS;
  await loadSuburbs(t.db, { sals });
  const loaded = await loadGnaf(t.db, { dir: FIXTURE_DIR, sals });
  await publishGnaf(t.db, loaded);
  const omit = new Set(opts.omit ?? []);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "suburb-data-"));
  if (!omit.has("vgv")) await runVgvMedians(t.db, { dir: await writeVgvFixtures(tmp), sals, minimum: 10 });
  if (!omit.has("rents")) await runHomesVicRents(t.db, { file: await writeRentFixture(path.join(tmp, "rents.xlsx")), sals, minimum: 10 });
  if (!omit.has("census")) await runCensus(t.db, { texts: CENSUS_TEXTS, sals, minimum: 10 });
  if (!omit.has("seifa")) await runSeifa(t.db, { file: SEIFA_FILE, sals, minimum: 10 });
  if (!omit.has("neighbours")) await runNeighbours(t.db, { texts: NEIGHBOUR_TEXTS, sals, as_of: "2026-08-31", minimum: 10 });
  return t;
}

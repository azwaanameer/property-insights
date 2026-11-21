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
import { runRating } from "../../../pipeline/derive/rating.mjs";
import { FIXTURE_AS_OF as GTFS_FIXTURE_AS_OF, FIXTURE_FEED, runExtractor, runGtfsStops } from "../../../pipeline/ingest/gtfs-stops.mjs";
import { runSchoolZones } from "../../../pipeline/ingest/school-zones.mjs";
import { runComData } from "../../../pipeline/ingest/com-buildings.mjs";
import { runCrime } from "../../../pipeline/ingest/crime.mjs";
import { CRIME_OPTIONS, crimeFixtureDir } from "../../../pipeline/ingest/fixtures/crime.mjs";
import { runPlaces } from "../../../pipeline/ingest/osm-places.mjs";
import { runSold } from "../../../pipeline/ingest/rp-sold.mjs";
import { runPriceDrivers } from "../../../pipeline/derive/price-drivers.mjs";
import { DRIVER_OPTIONS, SOLD_AS_OF, SOLD_OPTIONS, SOLD_TEXTS } from "../../../pipeline/ingest/fixtures/sold.mjs";
import { PLACES_EXPECT, placesFixtureDir } from "../../../pipeline/ingest/fixtures/places.mjs";
import { COM_AS_OF, COM_TEXTS } from "../../../pipeline/ingest/fixtures/com.mjs";
import { SCHOOL_AS_OF, SCHOOL_LOCATIONS_TEXT, SCHOOL_ZONE_TEXTS } from "../../../pipeline/ingest/fixtures/schools.mjs";
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

export type SuburbDataset = "vgv" | "rents" | "census" | "seifa" | "neighbours" | "rating" | "transit" | "schools" | "com" | "crime" | "places" | "sold" | "drivers";

/** The fixture transport feed is extracted once per test file (it runs python), then loaded into each database. */
let fixtureStops: Promise<string> | undefined;
export const fixtureStopsDir = () => (fixtureStops ??= (async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "gtfs-fixture-"));
  runExtractor({ input: FIXTURE_FEED, out, as_of: GTFS_FIXTURE_AS_OF });
  return out;
})());

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
  // The conditions rating is derived from the Census and Valuer-General datasets above, through the real pipeline. The fixture has a handful of
  // suburbs, far too few for the backtest regression (that is tested on its own, in pipeline/derive/rating.test.mjs), so it is switched off here.
  if (!omit.has("rating") && !omit.has("census") && !omit.has("vgv")) await runRating(t.db, { minimum: 1, regression: false });
  // Batch 2: real excerpts around the Docklands test address, through the real loaders. The City of Melbourne load matches buildings to the
  // fixture G-NAF addresses published above.
  const anyMode = { train: [1, 1_000_000], tram: [1, 1_000_000], bus: [1, 1_000_000], coach: [1, 1_000_000] } as Record<string, [number, number]>;
  if (!omit.has("transit")) await runGtfsStops(t.db, { dir: await fixtureStopsDir(), minimum: 10, bounds: anyMode });
  if (!omit.has("schools")) await runSchoolZones(t.db, { zoneTexts: SCHOOL_ZONE_TEXTS, locationsText: SCHOOL_LOCATIONS_TEXT, as_of: SCHOOL_AS_OF, minimumSchools: 10, minimumZones: 5 });
  if (!omit.has("com")) await runComData(t.db, { texts: COM_TEXTS, as_of: COM_AS_OF, minimumBuildings: 20, minimumProjects: 20, minimumMatches: 1 });
  // Batch 3: recorded crime, a real excerpt of the Crime Statistics Agency workbook through the real extractor and loader.
  if (!omit.has("crime")) await runCrime(t.db, { dir: await crimeFixtureDir(), ...CRIME_OPTIONS });
  // Batch 3: nearby places, a tiny OpenStreetMap excerpt through the real extractor and loader (tests that need exact places replace it with setPlaces).
  if (!omit.has("places")) await runPlaces(t.db, { dir: await placesFixtureDir(), expect: PLACES_EXPECT });
  // Batch 3: reported sales (an excerpt of the real harvest files through the real loader, matched to the fixture G-NAF buildings) and the price-driver
  // model fitted on them. The model needs the sales, so omitting "sold" omits both.
  if (!omit.has("sold")) {
    await runSold(t.db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    if (!omit.has("drivers")) await runPriceDrivers(t.db, DRIVER_OPTIONS);
  }
  return t;
}

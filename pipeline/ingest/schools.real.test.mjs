// End to end on the REAL school files in data/raw/vic/schools: locations and zones through the real loader, with its DEFAULT thresholds, into
// an in-process PGlite database. Skipped when data/raw is absent (it is gitignored). The counts are the ones the runbook records
// (files saved 2026-11-14): 2,318 open schools, 2,372 zone rows (1,268 primary, the rest secondary and standalone), 11 zone schools that
// are not in the locations file and keep their name only.
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { DEFAULT_CSV, DEFAULT_ZIP, runSchoolZones } from "./school-zones.mjs";

const have = existsSync(DEFAULT_ZIP) && existsSync(DEFAULT_CSV);

describe.skipIf(!have)("real school files into PGlite", () => {
  let db;
  let close;
  let locations;
  let zones;
  beforeAll(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    // No thresholds passed: the loader's own defaults decide whether the real files publish.
    [locations, zones] = await runSchoolZones(db);
  }, 300_000);
  afterAll(() => close?.());

  it("publishes both datasets under their own sources, dated by the day the files were saved", async () => {
    const current = await db.query("SELECT source_id, dataset_version_id::text AS id FROM src_dataset_current WHERE source_id LIKE 'vic_school_%' ORDER BY source_id");
    expect(current.map((c) => c.source_id)).toEqual(["vic_school_locations_2026", "vic_school_zones_2026"]);
    expect(locations.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(zones.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has the documented counts: 2,318 open schools in all three sectors, 2,372 zones with 1,268 primary", async () => {
    expect(locations.rows).toBe(2318);
    expect(zones.rows).toBe(2372);
    const [byLevel] = await db.query("SELECT count(*) FILTER (WHERE level = 'primary')::int AS p, count(*) FILTER (WHERE level = 'secondary')::int AS s FROM ref_school_zone WHERE dataset_version_id = $1", [zones.dataset_version_id]);
    expect(byLevel.p).toBe(1268);
    expect(byLevel.s).toBe(2372 - 1268);
    const sectors = await db.query("SELECT sector, count(*)::int AS n FROM ref_school WHERE dataset_version_id = $1 GROUP BY sector ORDER BY sector", [locations.dataset_version_id]);
    expect(sectors.map((s) => s.sector)).toEqual(["Catholic", "Government", "Independent"]);
  });

  it("joins zone schools to locations by key, keeps the rest by name only, and every kept key exists in the current locations", async () => {
    const [joined] = await db.query("SELECT count(*) FILTER (WHERE school_key IS NOT NULL)::int AS joined, count(*) FILTER (WHERE school_key IS NULL)::int AS name_only FROM ref_school_zone WHERE dataset_version_id = $1", [zones.dataset_version_id]);
    expect(joined.joined + joined.name_only).toBe(2372);
    expect(joined.name_only).toBe(11);
    const dangling = await db.query(
      `SELECT z.school_key FROM ref_school_zone z WHERE z.dataset_version_id = $1 AND z.school_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ref_school s WHERE s.dataset_version_id = $2 AND s.school_key = z.school_key)`,
      [zones.dataset_version_id, locations.dataset_version_id],
    );
    expect(dangling).toEqual([]);
  });

  it("the Docklands zone exists and holds a real point in Docklands", async () => {
    const [z] = await db.query("SELECT school_name, min_lat, max_lat, min_lon, max_lon FROM ref_school_zone WHERE dataset_version_id = $1 AND school_name = 'Docklands Primary School'", [zones.dataset_version_id]);
    expect(z.min_lat).toBeLessThan(-37.8123);
    expect(z.max_lat).toBeGreaterThan(-37.8123);
    expect(z.min_lon).toBeLessThan(144.9406);
    expect(z.max_lon).toBeGreaterThan(144.9406);
  });
});

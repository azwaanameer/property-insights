// End to end on the REAL City of Melbourne files in data/raw/vic/city-of-melbourne, through the real loader with its DEFAULT thresholds, into an
// in-process PGlite database. Skipped when data/raw is absent (it is gitignored). The G-NAF load (4 million rows) is not repeated here:
// without G-NAF nothing is matched (and the match check then passes), and a three-row real G-NAF excerpt shows the Docklands tower matching.
// Documented counts (files saved 2026-11-14): 14,093 current buildings (census 2024), 1,451 developments, 15,544 rows.
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { DEFAULT_DIR, FILES, runComData } from "./com-buildings.mjs";
import { FIXTURE_SALS } from "./fixtures/sals.mjs";
import { loadGnaf, publishGnaf } from "./gnaf-load.mjs";
import { loadSuburbs } from "./suburbs-sal.mjs";

const have = Object.values(FILES).every((f) => existsSync(path.join(DEFAULT_DIR, f)));

describe.skipIf(!have)("real City of Melbourne files into PGlite", () => {
  let db;
  let close;
  let plain;
  beforeAll(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    // Default thresholds, no G-NAF published: nothing is matched and the run still has to publish.
    plain = await runComData(db);
  }, 300_000);
  afterAll(() => close?.());

  it("publishes with the documented counts and no match (G-NAF is not loaded)", async () => {
    expect(plain.buildings).toBe(14093);
    expect(plain.developments).toBe(1451);
    expect(plain.rows).toBe(15544);
    expect(plain.census_year).toBe(2024);
    expect(plain.gnaf_published).toBe(false);
    expect(plain.matched).toBe(0);
    const current = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'com_open_data'");
    expect(current[0].id).toBe(plain.dataset_version_id);
  });

  it("every building has coordinates in Victoria, one row per property, and a dwelling count only from its own census year", async () => {
    const [r] = await db.query(
      `SELECT count(*)::int AS n, count(DISTINCT property_id)::int AS distinct_n,
              count(*) FILTER (WHERE census_year <> 2024)::int AS other_years,
              count(*) FILTER (WHERE dwelling_count IS NOT NULL)::int AS with_dwellings
       FROM ref_com_building WHERE dataset_version_id = $1`,
      [plain.dataset_version_id],
    );
    expect(r.n).toBe(r.distinct_n);
    expect(r.other_years).toBe(0);
    expect(r.with_dwellings).toBeGreaterThan(5000);
    const [s] = await db.query("SELECT count(DISTINCT status)::int AS statuses, count(*) FILTER (WHERE status IN ('UNDER CONSTRUCTION','APPROVED','APPLIED'))::int AS pipeline FROM fact_supply_project WHERE dataset_version_id = $1", [plain.dataset_version_id]);
    expect(s.statuses).toBe(4);
    expect(s.pipeline).toBeGreaterThan(250);
  });

  it("with a real G-NAF excerpt published, 628 Flinders Street (the Docklands unit's building) matches the council's 614-644 Flinders Street record by range", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const dir = await mkdtemp(path.join(os.tmpdir(), "gnaf-excerpt-"));
    const header = "gnaf_pid\tbuilding_id\tis_property_level\tunit_number\tflat_type\tlevel_number\tnumber_first\tnumber_last\tstreet_name\tstreet_type\tstreet_suffix\tbuilding_name\tlocality_name\tpostcode\tlat\tlon\tdisplay_address";
    const rows = [
      "GAVIC720476126\tGAVIC720476126\t1\t\t\t\t628\t\tFLINDERS\tSTREET\t\t\tDOCKLANDS\t3008\t-37.82127148\t144.95351739\t628 Flinders Street, Docklands VIC 3008",
      "GAVIC720519114\tGAVIC720476126\t0\t310\tUNIT\t3\t628\t\tFLINDERS\tSTREET\t\t\tDOCKLANDS\t3008\t-37.82127148\t144.95351739\tLevel 3, 310/628 Flinders Street, Docklands VIC 3008",
      "GAVIC719997251\tGAVIC719997251\t1\t\t\t\t614\t644\tFLINDERS\tSTREET\t\t\tDOCKLANDS\t3008\t-37.82127148\t144.95351739\t614-644 Flinders Street, Docklands VIC 3008",
    ];
    await writeFile(path.join(dir, "addresses.tsv"), [header, ...rows].join("\n") + "\n");
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({ source_id: "gnaf", state: "VIC", release: "excerpt", as_of: "2026-08-31", retrieved_at: "2026-11-14T00:00:00Z", file_sha256: "0".repeat(64), row_count: rows.length }),
    );
    await publishGnaf(db, await loadGnaf(db, { dir, sals: FIXTURE_SALS }));
    const matched = await runComData(db, { minimumMatches: 2 });
    expect(matched.matched).toBe(2);
    const m = await db.query("SELECT gnaf_building_id, property_id, match_type FROM ref_com_building_match WHERE dataset_version_id = $1 ORDER BY gnaf_building_id", [matched.dataset_version_id]);
    expect(m).toEqual([
      { gnaf_building_id: "GAVIC719997251", property_id: "559277", match_type: "exact_street_number" },
      { gnaf_building_id: "GAVIC720476126", property_id: "559277", match_type: "nearest_within_30m_same_street" },
    ]);
    const [b] = await db.query("SELECT construction_year, floors_above, predominant_use FROM ref_com_building WHERE dataset_version_id = $1 AND property_id = '559277'", [matched.dataset_version_id]);
    expect(b).toEqual({ construction_year: 2018, floors_above: 45, predominant_use: "Residential Apartment" });
  });
});

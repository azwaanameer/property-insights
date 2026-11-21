// End to end on the REAL Geofabrik Australia extract in data/raw/vic/osm, through the real python extractor (pyosmium under uv) and the real
// loader with its DEFAULT thresholds, into in-process PGlite. Skipped when the file is absent (data/raw is gitignored). The extract takes about
// a minute. Documented counts (australia-261120.osm.pbf, 976,690,287 bytes, Geofabrik extract of 2026-11-20, features inside Victoria's box):
// 45,746 places: fitness 905, food 10,887, groceries 5,325, library 418, medical 3,172, parks 25,039.
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { readExtract, runExtractor, runPlaces } from "./osm-places.mjs";

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "raw", "vic", "osm");
const pbf = existsSync(folder) ? readdirSync(folder).filter((n) => /^australia-\d{6}\.osm\.pbf$/.test(n)).sort().at(-1) : undefined;

describe.skipIf(!pbf)("real OpenStreetMap Australia extract into PGlite", () => {
  let db;
  let close;
  let out;
  let extract;
  beforeAll(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "places-real-"));
    runExtractor({ input: path.join(folder, pbf), out: dir });
    extract = await readExtract(dir);
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    out = await runPlaces(db, { dir });
  }, 900_000);
  afterAll(() => close?.());

  it("publishes with every default check passing (20,000 to 600,000 places, every category, 500 to 5,000 supermarkets, 5,000 parks, 50 cafes near the CBD)", () => {
    expect(out.rows).toBe(extract.manifest.row_count);
    expect(out.rows).toBeGreaterThanOrEqual(20_000);
    expect(out.rows).toBeLessThanOrEqual(600_000);
    expect(extract.manifest.counts_by_tag["shop=supermarket"]).toBeGreaterThanOrEqual(500);
    expect(extract.manifest.counts_by_tag["shop=supermarket"]).toBeLessThanOrEqual(5_000);
    expect(extract.manifest.as_of).toMatch(/^2026-11-\d\d$/);
  });

  it("has every category and a point for every row inside Victoria's box", async () => {
    const cats = await db.query("SELECT category, count(*)::int AS n FROM ref_place GROUP BY category ORDER BY category");
    expect(cats.map((c) => c.category)).toEqual(["fitness", "food", "groceries", "library", "medical", "parks"]);
    const [b] = await db.query("SELECT min(lat) AS a, max(lat) AS b, min(lon) AS c, max(lon) AS d FROM ref_place");
    expect(b.a).toBeGreaterThanOrEqual(-39.3);
    expect(b.b).toBeLessThanOrEqual(-33.9);
    expect(b.c).toBeGreaterThanOrEqual(140.9);
    expect(b.d).toBeLessThanOrEqual(150.1);
  });

  it("Docklands has places a person would expect within about 800 m (a spot check against the data, not a promise about any one shop)", async () => {
    const rows = await db.query(
      `SELECT category, count(*)::int AS n FROM ref_place
       WHERE lat BETWEEN -37.8230 - 0.0072 AND -37.8230 + 0.0072 AND lon BETWEEN 144.9490 - 0.0091 AND 144.9490 + 0.0091 GROUP BY category`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.category, r.n]));
    expect(by.food).toBeGreaterThan(5);
    expect(by.parks).toBeGreaterThan(0);
  });
});

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { DEFAULT_EXPECT, PlacesDataError, buildPlaceRows, readExtract, runExtractor, runPlaces } from "./osm-places.mjs";
import { PLACES_AS_OF, PLACES_COUNTS, PLACES_EXPECT, placesFixtureDir } from "./fixtures/places.mjs";

// The committed OpenStreetMap excerpt (fixtures/places/places-excerpt.osm) goes through the real python extractor (pyosmium under uv) and the
// real loader into in-process PGlite. See fixtures/places.mjs for what the excerpt holds.

let dir;
let fx;
beforeAll(async () => {
  dir = await placesFixtureDir();
  fx = await readExtract(dir);
});

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const clone = () => structuredClone(fx);
const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'openstreetmap'"))[0]?.id ?? null;
const count = async (id) => (await db.query("SELECT count(*)::int AS n FROM ref_place WHERE dataset_version_id = $1", [id]))[0].n;
const problems = (extract, expect_ = PLACES_EXPECT) => {
  try {
    buildPlaceRows(extract, expect_);
  } catch (err) {
    expect(err).toBeInstanceOf(PlacesDataError);
    return err.problems.join(" | ");
  }
  throw new Error("expected a PlacesDataError");
};

describe("osm-places-extract.py on the committed excerpt", () => {
  it("reads the extract date from the options, hashes the file and counts places by category and by tag", () => {
    expect(fx.manifest).toMatchObject({ source: "openstreetmap", source_file: "places-excerpt.osm", as_of: PLACES_AS_OF, row_count: 22, counts: PLACES_COUNTS });
    expect(fx.manifest.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fx.manifest.counts_by_tag).toMatchObject({ "shop=supermarket": 3, "shop=bakery": 1, "amenity=cafe": 3, "leisure=playground": 1, "leisure=park": 2, "amenity=gym": 2 });
  });

  it("keeps a place once under one category: a node tagged cafe and bakery is groceries, not food", () => {
    const by = Object.fromEntries(fx.places.map((p) => [p.osm_id, p]));
    expect(by["node/12"]).toMatchObject({ category: "groceries", name: "Dock Bakery Cafe" });
    expect(fx.places.filter((p) => p.osm_id === "node/12")).toHaveLength(1);
  });

  it("leaves a place without a name (or with a blank one) as a null name, and keeps it", () => {
    const by = Object.fromEntries(fx.places.map((p) => [p.osm_id, p]));
    expect(by["node/4"]).toMatchObject({ category: "food", name: null });
    expect(by["node/17"]).toMatchObject({ category: "food", name: null });
    expect(by["node/2"]).toMatchObject({ category: "groceries", name: null });
  });

  it("gives a way its centroid, an open way the mean of its points and a multipolygon relation the centroid of its outer ring", () => {
    const by = Object.fromEntries(fx.places.map((p) => [p.osm_id, p]));
    expect(by["way/201"]).toMatchObject({ category: "parks", name: "Dock Park" });
    expect(by["way/201"].lat).toBeCloseTo(-37.821, 5);
    expect(by["way/201"].lon).toBeCloseTo(144.9475, 5);
    expect(by["way/204"]).toMatchObject({ category: "groceries", name: "Way Market" });
    expect(by["way/204"].lat).toBeCloseTo(-37.8243, 5);
    expect(by["way/202"]).toMatchObject({ category: "fitness", name: "Open Way Gym" });
    expect(by["way/202"].lat).toBeCloseTo((-37.819 - 37.819 - 37.8194) / 3, 5);
    expect(by["relation/301"]).toMatchObject({ category: "parks", name: "Dock Reserve" });
    expect(by["relation/301"].lat).toBeCloseTo(-37.825, 5);
    expect(by["relation/301"].lon).toBeCloseTo(144.945, 5);
  });

  it("drops what is not a place: another kind of shop, a building outline, an untagged outline and a point outside Victoria's box", () => {
    const ids = new Set(fx.places.map((p) => p.osm_id));
    expect(ids.has("node/11")).toBe(false); // shop=clothes
    expect(ids.has("way/203")).toBe(false); // building=yes
    expect(ids.has("way/205")).toBe(false); // untagged outer way of the relation
    expect(ids.has("node/13")).toBe(false); // Sydney
    expect(ids.has("node/18")).toBe(true); // a Melbourne supermarket far from Docklands is still in the dataset
    for (const p of fx.places) {
      expect(p.lat).toBeGreaterThanOrEqual(-39.3);
      expect(p.lat).toBeLessThanOrEqual(-33.9);
      expect(p.lon).toBeGreaterThanOrEqual(140.9);
      expect(p.lon).toBeLessThanOrEqual(150.1);
    }
  });
});

describe("runPlaces on the excerpt", () => {
  it("publishes one dataset version of source openstreetmap with the extract date, the licence snapshot and every place", async () => {
    const out = await runPlaces(db, { dir, expect: PLACES_EXPECT });
    expect(await pointer()).toBe(out.dataset_version_id);
    expect(out).toMatchObject({ rows: 22, as_of: PLACES_AS_OF, counts: PLACES_COUNTS });
    expect(await count(out.dataset_version_id)).toBe(22);
    const [v] = await db.query("SELECT status, row_count::int AS n, licence_snapshot, states, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM src_dataset_version WHERE dataset_version_id = $1", [out.dataset_version_id]);
    expect(v).toEqual({ status: "published", n: 22, licence_snapshot: "ODbL 1.0", states: ["VIC"], as_of: PLACES_AS_OF });
    const [u] = await db.query("SELECT name FROM ref_place WHERE dataset_version_id = $1 AND osm_id = 'node/4'", [out.dataset_version_id]);
    expect(u.name).toBeNull();
  });

  it("with the default thresholds the tiny excerpt is refused (it is nowhere near a Victorian file), and nothing is published", async () => {
    await expect(runPlaces(db, { dir })).rejects.toThrow(/supermarkets \(shop=supermarket\), expected 500 to 5000/);
    expect(await pointer()).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version"))[0].n).toBe(0);
    // Without the supermarket count bound the SQL checks run, and they refuse it too.
    const err = await runPlaces(db, { dir, expect: { ...DEFAULT_EXPECT, supermarkets: null } }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.message).toMatch(/fewer than the minimum 20000/);
    expect(err.message).toMatch(/fewer than 5000 parks and playgrounds/);
    expect(err.message).toMatch(/fewer than 50 cafes and restaurants within 800 m of the Melbourne CBD point/);
    expect(await pointer()).toBeNull();
  });

  it("the CBD spot check counts food places within 800 m of the CBD point", async () => {
    // The excerpt has one cafe at the CBD point (and none else within 800 m).
    await expect(runPlaces(db, { dir, expect: { ...PLACES_EXPECT, cbdFood: 1 } })).resolves.toMatchObject({ rows: 22 });
    await expect(runPlaces(db, { dir, expect: { ...PLACES_EXPECT, cbdFood: 2 } })).rejects.toThrow(/fewer than 2 cafes and restaurants within 800 m/);
  });

  it("a new version replaces the old one only when its checks pass; the old data stays live and the failed version leaves no rows", async () => {
    const first = await runPlaces(db, { dir, expect: PLACES_EXPECT });
    await expect(runPlaces(db, { dir, expect: { ...PLACES_EXPECT, parks: 50 } })).rejects.toBeInstanceOf(PublishCheckError);
    expect(await pointer()).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE status = 'failed'");
    expect(failed).toHaveLength(1);
    expect(await count(failed[0].id)).toBe(0);
    expect(await count(first.dataset_version_id)).toBe(22);
    const second = await runPlaces(db, { dir, expect: PLACES_EXPECT });
    expect(await pointer()).toBe(second.dataset_version_id);
    expect(await count(first.dataset_version_id)).toBe(22); // the old version's rows stay until pruned
  });

  it("refuses a new version much smaller than the current one", async () => {
    await runPlaces(db, { dir, expect: PLACES_EXPECT });
    const small = clone();
    // 15 of the 22 places, every category still present: below 80% of the current version.
    const drop = new Set(["node/1", "node/2", "node/12", "node/20", "node/3", "node/4", "node/5"]);
    small.places = small.places.filter((p) => !drop.has(p.osm_id));
    small.manifest.row_count = small.places.length;
    small.manifest.counts = {};
    for (const p of small.places) small.manifest.counts[p.category] = (small.manifest.counts[p.category] ?? 0) + 1;
    small.manifest.counts_by_tag = { "leisure=park": small.places.length };
    expect(small.places).toHaveLength(15);
    await expect(runPlaces(db, { extract: small, expect: PLACES_EXPECT })).rejects.toThrow(/below 80% of the current version/);
  });

  it("a missing category fails the publish checks", async () => {
    const noLibrary = clone();
    noLibrary.places = noLibrary.places.filter((p) => p.category !== "library");
    noLibrary.manifest.row_count = noLibrary.places.length;
    noLibrary.manifest.counts = { ...PLACES_COUNTS };
    delete noLibrary.manifest.counts.library;
    noLibrary.manifest.counts_by_tag["amenity=library"] = 0;
    await expect(runPlaces(db, { extract: noLibrary, expect: PLACES_EXPECT })).rejects.toThrow(/missing a category/);
    expect(await pointer()).toBeNull();
  });
});

describe("buildPlaceRows refuses an unusable extract and creates nothing", () => {
  it("passes the committed excerpt", () => {
    expect(() => buildPlaceRows(fx, PLACES_EXPECT)).not.toThrow();
    expect(buildPlaceRows(fx, PLACES_EXPECT)).toHaveLength(22);
  });

  it("a duplicate osm_id fails", () => {
    const bad = clone();
    bad.places.push({ ...bad.places[0] });
    expect(problems(bad)).toMatch(/1 duplicate osm_id/);
  });

  it("a point outside Victoria's box, an unknown category or a bad osm_id fails the schema", () => {
    const out = clone();
    out.places[0].lat = -33.87;
    expect(problems(out)).toMatch(/lat/);
    const cat = clone();
    cat.places[0].category = "shopping";
    expect(problems(cat)).toMatch(/category/);
    const id = clone();
    id.places[0].osm_id = "12345";
    expect(problems(id)).toMatch(/osm_id/);
  });

  it("a manifest that disagrees with the rows fails", () => {
    const bad = clone();
    bad.manifest.counts.food += 1;
    expect(problems(bad)).toMatch(/manifest counts 6 food places but the file holds 5/);
    const tag = clone();
    tag.manifest.counts_by_tag["shop=supermarket"] += 1;
    expect(problems(tag)).toMatch(/by tag but 22 in all/);
  });

  it("the supermarket count must be inside 500 to 5,000 when the bound is on", () => {
    expect(problems(fx, { ...PLACES_EXPECT, supermarkets: [500, 5000] })).toMatch(/3 supermarkets \(shop=supermarket\), expected 500 to 5000/);
    expect(() => buildPlaceRows(fx, { ...PLACES_EXPECT, supermarkets: [1, 5] })).not.toThrow();
  });

  it("loadPlaces writes nothing when the extract is unusable (no dataset version is created)", async () => {
    const bad = clone();
    bad.places.push({ ...bad.places[0] });
    await expect(runPlaces(db, { extract: bad, expect: PLACES_EXPECT })).rejects.toBeInstanceOf(PlacesDataError);
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version WHERE source_id = 'openstreetmap'"))[0].n).toBe(0);
  });
});

describe("readExtract and runExtractor", () => {
  it("refuses a manifest that disagrees with the places file (a cut-short or stale extract)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "places-stale-"));
    await writeFile(path.join(tmp, "places.jsonl"), await readFile(path.join(dir, "places.jsonl")));
    await writeFile(path.join(tmp, "manifest.json"), JSON.stringify({ ...fx.manifest, row_count: fx.manifest.row_count + 1 }));
    await expect(readExtract(tmp)).rejects.toThrow(/run the extract again/);
  });

  it("tries each runner in turn, and says what failed when none works", () => {
    const calls = [];
    const spawn = (exe, args) => {
      calls.push([exe, ...args.slice(0, 2)]);
      return calls.length < 3 ? { status: 1, stderr: `${exe} not usable` } : { status: 0, stdout: "done\n" };
    };
    const runners = [
      { exe: "uv", prefix: ["run", "--offline"] },
      { exe: "uv", prefix: ["run"] },
      { exe: "python", prefix: [] },
    ];
    expect(runExtractor({ input: "x.osm", out: "o", as_of: "2026-11-20", spawn, runners })).toBe("done");
    expect(calls.map((c) => c[0])).toEqual(["uv", "uv", "python"]);
    expect(() => runExtractor({ spawn: () => ({ status: 1, stderr: "boom" }), runners })).toThrow(/failed with every runner tried.*boom/);
    expect(() => runExtractor({ spawn: () => ({ error: new Error("ENOENT") }), runners })).toThrow(/ENOENT/);
  });

  it("always runs the script in isolated mode (python -I)", () => {
    let seen;
    runExtractor({ spawn: (_exe, args) => ((seen = args), { status: 0, stdout: "" }), runners: [{ exe: "uv", prefix: ["run", "python"] }] });
    expect(seen.slice(0, 3)).toEqual(["run", "python", "-I"]);
  });
});

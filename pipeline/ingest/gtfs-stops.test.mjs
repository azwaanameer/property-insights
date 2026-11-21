import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { FIXTURE_AS_OF, FIXTURE_FEED, readExtract, runExtractor, runGtfsStops } from "./gtfs-stops.mjs";

// The committed feed is a real excerpt (rows copied from the PTV download): the routes that serve the Docklands test address, a
// rail "Replacement Bus" route, the interstate Overland (its stops reach Adelaide) and a Bendigo coach.
const ANY_MODE = { train: [1, 10_000], tram: [1, 10_000], bus: [1, 10_000], coach: [1, 10_000] };

let out;
let extracted;
beforeAll(async () => {
  out = await mkdtemp(path.join(os.tmpdir(), "gtfs-test-"));
  runExtractor({ input: FIXTURE_FEED, out, as_of: FIXTURE_AS_OF });
  extracted = await readExtract(out);
});

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

/** A directory holding the given stops with a manifest whose row_count matches them. */
async function extractOf(stops, manifest = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gtfs-variant-"));
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...extracted.manifest, row_count: stops.length, ...manifest }));
  await writeFile(path.join(dir, "stops.json"), JSON.stringify(stops));
  return dir;
}

const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'gtfs_vic'"))[0]?.id ?? null;
const count = async (id) => (await db.query("SELECT count(*)::int AS n FROM ref_transit_stop WHERE dataset_version_id = $1", [id]))[0].n;

describe("gtfs-extract.py on the fixture feed", () => {
  it("maps route types to modes: tram, train (regional, metro and interstate), bus and coach", () => {
    const modes = new Set(extracted.stops.map((s) => s.mode));
    expect([...modes].sort()).toEqual(["bus", "coach", "train", "tram"]);
    expect(extracted.manifest).toMatchObject({ source: "gtfs_vic", as_of: FIXTURE_AS_OF, row_count: extracted.stops.length });
  });

  it("collapses platforms that share a parent_station into one station, named and placed as the parent, with the routes serving it", async () => {
    // Burwood has several platform stops in the feed; they are one station.
    const platforms = (await readFile(path.join(FIXTURE_FEED, "2", "stops.txt"), "utf8")).split(/\r?\n/).filter((l) => l.includes('"vic:rail:BWD"'));
    expect(platforms.length).toBeGreaterThan(1);
    const burwood = extracted.stops.filter((s) => s.key === "train:vic:rail:BWD");
    expect(burwood).toHaveLength(1);
    expect(burwood[0].name).toBe("Burwood Railway Station");
    expect(burwood[0].routes).toEqual(["Alamein"]);
    // The station carries the parent's name ("Railway Station"), not the platform's ("Station").
    expect(extracted.stops.find((s) => s.key === "train:vic:rail:FSS")?.name).toBe("Flinders Street Railway Station");
  });

  it("the interstate Overland (route type 102) is a train service, so Southern Cross is a train station", () => {
    expect(extracted.stops.find((s) => s.key === "train:vic:rail:SSS")).toMatchObject({ name: "Southern Cross Railway Station", routes: ["The Overland"] });
  });

  it("drops a rail replacement bus route, so its stops are not train stops", () => {
    const names = extracted.stops.filter((s) => s.mode === "train").flatMap((s) => s.routes);
    expect(names).not.toContain("Replacement Bus");
  });

  it("drops stops outside Victoria (the Overland reaches Adelaide) and counts them", async () => {
    const manifest = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8"));
    expect(manifest.stats.stops_outside_victoria).toBeGreaterThan(0);
    for (const s of extracted.stops) {
      expect(s.lat).toBeGreaterThan(-39.3);
      expect(s.lat).toBeLessThan(-33.9);
      expect(s.lon).toBeGreaterThan(140.9);
      expect(s.lon).toBeLessThan(150.1);
    }
  });

  it("every stop has a name and at least one route; the same station in two feeds of one mode is one row", () => {
    for (const s of extracted.stops) {
      expect(s.name.trim().length, s.key).toBeGreaterThan(0);
      expect(s.routes.length, s.key).toBeGreaterThan(0);
    }
    const keys = extracted.stops.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a feed whose stop_times does not start with trip_id is refused, and a run with no as_of writes no files", async () => {
    const feed = await mkdtemp(path.join(os.tmpdir(), "gtfs-badfeed-"));
    const { cp } = await import("node:fs/promises");
    await cp(FIXTURE_FEED, feed, { recursive: true });
    const st = path.join(feed, "3", "stop_times.txt");
    const text = await readFile(st, "utf8");
    // Put stop_id first: the extractor reads the first column as the trip id, so it must say so rather than find nothing.
    await writeFile(st, text.replace('"trip_id","arrival_time","departure_time","stop_id"', '"stop_id","arrival_time","departure_time","trip_id"'));
    expect(() => runExtractor({ input: feed, out: path.join(feed, "out"), as_of: FIXTURE_AS_OF })).toThrow(/does not start with trip_id/);
    const noDate = await mkdtemp(path.join(os.tmpdir(), "gtfs-nodate-"));
    expect(() => runExtractor({ input: FIXTURE_FEED, out: noDate })).toThrow(/no as_of/);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(noDate)).toEqual([]);
  });

  it("an unreadable input fails with a message, never a half-written extract", () => {
    expect(() => runExtractor({ input: path.join(out, "no-such-input"), out: path.join(out, "x"), as_of: FIXTURE_AS_OF })).toThrow(/input not found/);
  });
});

describe("loadStops + publish", () => {
  it("loads the stops under a new version, as jsonb routes, with the manifest's as_of, and flips the pointer", async () => {
    const res = await runGtfsStops(db, { dir: out, minimum: 10, bounds: ANY_MODE });
    expect(await pointer()).toBe(res.dataset_version_id);
    expect(await count(res.dataset_version_id)).toBe(extracted.stops.length);
    expect(res.as_of).toBe(FIXTURE_AS_OF);
    const [v] = await db.query("SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, row_count::int AS n, status FROM src_dataset_version WHERE dataset_version_id = $1", [res.dataset_version_id]);
    expect(v).toEqual({ as_of: FIXTURE_AS_OF, n: extracted.stops.length, status: "published" });
    const [tram] = await db.query("SELECT routes FROM ref_transit_stop WHERE dataset_version_id = $1 AND mode = 'tram' ORDER BY stop_key LIMIT 1", [res.dataset_version_id]);
    expect(Array.isArray(tram.routes)).toBe(true);
    expect(tram.routes.length).toBeGreaterThan(0);
  });

  it("a mode with no stops fails the check, exits as a PublishCheckError and the old data stays live", async () => {
    const first = await runGtfsStops(db, { dir: out, minimum: 10, bounds: ANY_MODE });
    const noTrams = await extractOf(extracted.stops.filter((s) => s.mode !== "tram"));
    const err = await runGtfsStops(db, { dir: noTrams, minimum: 10, bounds: ANY_MODE }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("tram");
    expect(await pointer()).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = 'gtfs_vic' AND status = 'failed'");
    expect(failed).toHaveLength(1);
    expect(await count(failed[0].id)).toBe(0);
  });

  it("a stop outside Victoria, an empty name or a missing coordinate is refused by the schema before anything is loaded", async () => {
    for (const bad of [{ lat: -33.8 }, { name: "  " }, { lon: null }]) {
      const dir = await extractOf([{ ...extracted.stops[0], ...bad }, ...extracted.stops.slice(1)]);
      await expect(runGtfsStops(db, { dir, minimum: 10, bounds: ANY_MODE })).rejects.toThrow(/failed the schema/);
    }
    expect(await pointer()).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version WHERE source_id = 'gtfs_vic'"))[0].n).toBe(0);
  });

  it("a manifest whose row_count disagrees with stops.json is refused before anything is loaded", async () => {
    const dir = await extractOf(extracted.stops, { row_count: extracted.stops.length + 1 });
    await expect(runGtfsStops(db, { dir, minimum: 10, bounds: ANY_MODE })).rejects.toThrow(/manifest.json says \d+ stops but stops.json holds \d+/);
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version WHERE source_id = 'gtfs_vic'"))[0].n).toBe(0);
  });

  it("a new version far smaller than the current one is refused", async () => {
    await runGtfsStops(db, { dir: out, minimum: 10, bounds: ANY_MODE });
    const small = await extractOf(extracted.stops.filter((_, i) => i % 4 === 0 || extracted.stops[i].mode === "train"));
    const err = await runGtfsStops(db, { dir: small, minimum: 1, bounds: ANY_MODE }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toMatch(/below 80%/);
  });
});

// OpenStreetMap places (shops, cafes, parks, medical, gyms, libraries) in Victoria -> ref_place, then publish (AD-7).
// Data is © OpenStreetMap contributors, ODbL 1.0 (credit linked to https://www.openstreetmap.org/copyright).
//
//   uv run --no-project --with osmium python -I pipeline/ingest/osm-places-extract.py     extract (minutes; reads the local Geofabrik file)
//   node --env-file=.env pipeline/ingest/osm-places.mjs                                  load into DATABASE_URL (never printed)
//   node pipeline/ingest/osm-places.mjs --pglite                                         in-memory dry run on the real extract in data/out/osm-places
//   node pipeline/ingest/osm-places.mjs --pglite --dir DIR                               the same on another extract directory
//   npm run pipeline:places                                                              both steps (npm scripts do not read .env: see RUNBOOK section 12)
//
// osm-places-extract.py reads data/raw/vic/osm/australia-YYMMDD.osm.pbf (Geofabrik publishes no Victoria-only file; the extractor keeps
// the features inside Victoria's bounding box) and writes places.jsonl and manifest.json under data/out/osm-places/. This loader validates
// every row with zod, loads one dataset version of source `openstreetmap` and publishes with checks. A failed check leaves the old dataset
// live. Names and positions only: OpenStreetMap carries no ratings or reviews and none are stored.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { cliArg, runPointCli } from "../lib/point-run.mjs";
import { PLACE_CATEGORIES, PlaceRow, PlacesManifest, VIC_BOX } from "../lib/schemas.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "out", "osm-places");
export const SOURCE_ID = "openstreetmap";
/** The Melbourne CBD point the spot check counts around (the same point as the spec). */
export const CBD = { lat: -37.8136, lon: 144.9631 };

/**
 * What the real file must look like. The full Victorian extract of 2026-11-20 is checked against these (see RUNBOOK section 12 for the counts it
 * gave). Tests on a handful of features pass their own.
 *   total       rows in ref_place (at least 20,000 and at most 600,000)
 *   supermarkets  the extractor's own count of shop=supermarket (500 to 5,000), or null to skip
 *   parks       at least this many rows in the parks category (parks and playgrounds)
 *   cbdFood     at least this many food places within 800 m of the CBD point
 */
/** @typedef {{ total: [number, number], supermarkets: [number, number] | null, parks: number, cbdFood: number }} PlacesExpect */
/** @type {PlacesExpect} */
export const DEFAULT_EXPECT = { total: [20_000, 600_000], supermarkets: [500, 5_000], parks: 5_000, cbdFood: 50 };

export class PlacesDataError extends Error {
  constructor(problems) {
    super(`the places extract is not usable; nothing published: ${problems.join("; ")}`);
    this.name = "PlacesDataError";
    this.problems = problems;
  }
}

/** Candidate ways to run the extractor, tried in order: uv from its cache (no network), uv, then a python that already has osmium. */
const RUNNERS = [
  { exe: "uv", prefix: ["run", "--offline", "--no-project", "--with", "osmium", "python"] },
  { exe: "uv", prefix: ["run", "--no-project", "--with", "osmium", "python"] },
  { exe: process.platform === "win32" ? "python" : "python3", prefix: [] },
];

/** Run the python extractor (python -I under uv, every candidate tried). */
export function runExtractor({ input, out, as_of, spawn = spawnSync, runners = RUNNERS }) {
  const script = path.join(root, "pipeline", "ingest", "osm-places-extract.py");
  const args = ["-I", script, ...(input ? ["--input", input] : []), ...(out ? ["--out", out] : []), ...(as_of ? ["--as-of", as_of] : [])];
  const failures = [];
  for (const { exe, prefix } of runners) {
    const r = spawn(exe, [...prefix, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) {
      failures.push(`${exe}: ${r.error.message}`);
      continue;
    }
    if (r.status !== 0) {
      failures.push(`${exe}: ${String(r.stderr ?? "").trim().split("\n").slice(-3).join(" ") || `exit status ${r.status}`}`);
      continue;
    }
    return String(r.stdout ?? "").trim();
  }
  throw new Error(`osm-places-extract.py failed with every runner tried (${failures.join("; ")}). It needs uv, or a Python 3 with osmium installed.`);
}

/** Read the two files an extract holds. The manifest is written last, so a missing or stale manifest means a cut-short extract. */
export async function readExtract(dir = DEFAULT_DIR) {
  const manifest = PlacesManifest.parse(JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")));
  const text = await readFile(path.join(dir, "places.jsonl"), "utf8");
  const places = text.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
  if (manifest.row_count !== places.length) throw new Error(`manifest.json says ${manifest.row_count} places but places.jsonl holds ${places.length}: run the extract again`);
  return { manifest, places };
}

/**
 * Pure: the extract -> the rows to store, or a PlacesDataError listing every problem. Checks made before anything is created:
 *   - every row passes the schema (a point inside Victoria's box, a known category);
 *   - no osm_id appears twice;
 *   - the manifest's counts per category and per tag agree with the rows, so the manifest can be trusted;
 *   - the extractor's own count of shop=supermarket is inside `expect.supermarkets`.
 */
export function buildPlaceRows(extract, expect = DEFAULT_EXPECT) {
  const problems = [];
  const { manifest, places } = extract;
  const rows = [];
  const seen = new Set();
  let dup = 0;
  let bad = 0;
  for (const p of places) {
    const ok = PlaceRow.safeParse(p);
    if (!ok.success) {
      if (++bad <= 3) problems.push(`place ${JSON.stringify(p)}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
      continue;
    }
    if (seen.has(ok.data.osm_id)) {
      dup++;
      continue;
    }
    seen.add(ok.data.osm_id);
    rows.push(ok.data);
  }
  if (bad > 3) problems.push(`${bad - 3} more places failed the schema`);
  if (dup) problems.push(`${dup} duplicate osm_id value(s)`);

  const tally = {};
  for (const r of rows) tally[r.category] = (tally[r.category] ?? 0) + 1;
  for (const c of new Set([...Object.keys(tally), ...Object.keys(manifest.counts)])) {
    if ((tally[c] ?? 0) !== (manifest.counts[c] ?? 0)) problems.push(`manifest counts ${manifest.counts[c] ?? 0} ${c} places but the file holds ${tally[c] ?? 0}`);
  }
  const byTag = Object.values(manifest.counts_by_tag).reduce((n, v) => n + v, 0);
  if (byTag !== manifest.row_count) problems.push(`manifest counts ${byTag} places by tag but ${manifest.row_count} in all`);

  if (expect.supermarkets) {
    const [lo, hi] = expect.supermarkets;
    const n = manifest.counts_by_tag["shop=supermarket"] ?? 0;
    if (n < lo || n > hi) problems.push(`${n} supermarkets (shop=supermarket), expected ${lo} to ${hi}`);
  }
  if (problems.length) throw new PlacesDataError(problems);
  return rows;
}

const COLUMNS = [
  { name: "osm_id", type: "text" },
  { name: "category", type: "text" },
  { name: "name", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
];

/**
 * Validate and insert under a new dataset version (status `loading`).
 * @param {any} db
 * @param {{ dir?: string, extract?: any, expect?: PlacesExpect, log?: (m: string) => void }} [opts]
 */
export async function loadPlaces(db, { dir = DEFAULT_DIR, extract, expect = DEFAULT_EXPECT, log = () => {} } = {}) {
  const data = extract ?? (await readExtract(dir));
  const { manifest } = data;
  const rows = buildPlaceRows(data, expect);
  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: manifest.retrieved_at,
    file_sha256: manifest.file_sha256,
    as_of: manifest.as_of,
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "ref_place", COLUMNS, id);
    for (let i = 0; i < rows.length; i += 10_000) {
      await insert(rows.slice(i, i + 10_000).map((r) => [r.osm_id, r.category, r.name, r.lat, r.lon]));
    }
    const counts = {};
    for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1;
    log(`loaded ${await countRows(db, "ref_place", id)} places: ${PLACE_CATEGORIES.map((c) => `${c} ${counts[c] ?? 0}`).join(", ")}`);
    return { dataset_version_id: id, source_id: SOURCE_ID, rows: rows.length, files: [], as_of: manifest.as_of, counts, counts_by_tag: manifest.counts_by_tag };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/**
 * Publish checks (SQL, in the publish transaction): the declared row count, a minimum and maximum, no big shrink against the current
 * version, every category present, enough parks, every point inside Victoria's box, no duplicate osm_id, and the Melbourne CBD spot check.
 * @param {PlacesExpect} [expect]
 */
export const placeChecks = (expect = DEFAULT_EXPECT) => {
  const [min, max] = expect.total;
  const km = 111_320;
  return [
    rowCountMatchesDeclared("ref_place"),
    minRows("ref_place", min),
    sqlCheck(`ref_place has more than the maximum ${max} rows`, `SELECT count(*) <= ${Number(max)} AS ok FROM ref_place WHERE dataset_version_id = $1`),
    notMuchSmallerThanPrevious(0.8),
    sqlCheck(
      `ref_place is missing a category (expected ${PLACE_CATEGORIES.join(", ")})`,
      `SELECT count(DISTINCT category) = ${PLACE_CATEGORIES.length} AS ok FROM ref_place WHERE dataset_version_id = $1 AND category IN (${PLACE_CATEGORIES.map((c) => `'${c}'`).join(", ")})`,
    ),
    sqlCheck(
      `ref_place has fewer than ${expect.parks} parks and playgrounds`,
      `SELECT count(*) >= ${Number(expect.parks)} AS ok FROM ref_place WHERE dataset_version_id = $1 AND category = 'parks'`,
    ),
    sqlCheck(
      "ref_place has a point outside Victoria's bounding box",
      `SELECT NOT EXISTS (SELECT 1 FROM ref_place WHERE dataset_version_id = $1
         AND (lat NOT BETWEEN ${VIC_BOX.lat_min} AND ${VIC_BOX.lat_max} OR lon NOT BETWEEN ${VIC_BOX.lon_min} AND ${VIC_BOX.lon_max})) AS ok`,
    ),
    sqlCheck(
      "ref_place has a duplicate osm_id",
      `SELECT count(*) = count(DISTINCT osm_id) AS ok FROM ref_place WHERE dataset_version_id = $1`,
    ),
    sqlCheck(
      `ref_place has fewer than ${expect.cbdFood} cafes and restaurants within 800 m of the Melbourne CBD point`,
      `SELECT count(*) >= ${Number(expect.cbdFood)} AS ok FROM ref_place
        WHERE dataset_version_id = $1 AND category = 'food'
          AND lat BETWEEN ${CBD.lat - 0.01} AND ${CBD.lat + 0.01} AND lon BETWEEN ${CBD.lon - 0.012} AND ${CBD.lon + 0.012}
          AND (power((lat - ${CBD.lat}) * ${km}, 2) + power((lon - ${CBD.lon}) * ${km} * cos(radians(${CBD.lat})), 2)) <= 800 * 800`,
    ),
  ];
};

/**
 * @param {any} db
 * @param {{ dir?: string, extract?: any, expect?: PlacesExpect, log?: (m: string) => void }} [opts]
 */
export async function runPlaces(db, { dir, extract, expect = DEFAULT_EXPECT, log } = {}) {
  const data = extract ?? (await readExtract(dir));
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: placeChecks(expect),
    load: () => loadPlaces(db, { extract: data, expect, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli((db, { log, argv }) => runPlaces(db, { dir: cliArg(argv, "--dir", DEFAULT_DIR), log }), { require: { table: "ref_place", migration: "0010" } }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// Public Transport Victoria GTFS stops -> ref_transit_stop, then publish (AD-7).
//
//   npm run pipeline:gtfs                                   extract (python, a minute or two) then load into DATABASE_URL
//   node pipeline/ingest/gtfs-stops.mjs --pglite             in-memory dry run on the small committed fixture feed
//   node pipeline/ingest/gtfs-stops.mjs --pglite --dir data/out/gtfs-vic    in-memory dry run on the real extract
//
// gtfs-extract.py reads the nested feeds in data/raw/vic/gtfs/vic_gtfs.zip and writes stops.json and manifest.json under
// data/out/gtfs-vic/ (see its header for the method). This loader validates each stop with zod, loads it under a new dataset
// version and publishes with checks: the declared row count, a minimum, no big shrink, every mode present with a plausible count,
// no empty name, every coordinate inside Victoria. A failed check leaves the old dataset live.
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { cliArg, runPointCli } from "../lib/point-run.mjs";
import { GtfsManifest, TRANSIT_MODES, TransitStopRow } from "../lib/schemas.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "out", "gtfs-vic");
export const FIXTURE_FEED = path.join(root, "pipeline", "ingest", "fixtures", "gtfs-feed");
export const FIXTURE_AS_OF = "2026-11-06";
const SOURCE_ID = "gtfs_vic";

/** Plausible stop counts per mode for the real Victorian feed (28,777 stops at 2026-11-06: 324 train, 1,624 tram, 25,992 bus, 837 coach). */
export const MODE_BOUNDS = { train: [150, 800], tram: [800, 4000], bus: [8000, 80000], coach: [100, 3000] };

const COLUMNS = [
  { name: "stop_key", type: "text" },
  { name: "name", type: "text" },
  { name: "mode", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
  { name: "routes", type: "jsonb" },
];

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} stop(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

/** Run the python extractor (python -I, every candidate executable tried) on an input zip or feed directory. */
export function runExtractor({ input, out, as_of, spawn = spawnSync, candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"] }) {
  const script = path.join(root, "pipeline", "ingest", "gtfs-extract.py");
  const args = ["-I", script, ...(input ? ["--input", input] : []), "--out", out, ...(as_of ? ["--as-of", as_of] : [])];
  const failures = [];
  for (const exe of candidates) {
    const r = spawn(exe, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) {
      failures.push(`${exe}: ${r.error.message}`);
      continue;
    }
    if (r.status !== 0) {
      failures.push(`${exe}: ${String(r.stderr ?? "").trim() || `exit status ${r.status}`}`);
      continue;
    }
    return String(r.stdout ?? "").trim();
  }
  throw new Error(`gtfs-extract.py failed with every python tried (${failures.join("; ")}). Python 3 must be on PATH.`);
}

/** Read stops.json and manifest.json from an extract directory. */
export async function readExtract(dir = DEFAULT_DIR) {
  const manifest = GtfsManifest.parse(JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")));
  const stops = JSON.parse(await readFile(path.join(dir, "stops.json"), "utf8"));
  if (!Array.isArray(stops)) throw new Error("stops.json is not a list");
  // The manifest and the stop list are written together; a count that disagrees means one is stale or cut short.
  if (manifest.row_count !== stops.length) throw new Error(`manifest.json says ${manifest.row_count} stops but stops.json holds ${stops.length}: run the extract again`);
  return { manifest, stops };
}

/** Validate and insert under a new dataset version (status `loading`). */
export async function loadStops(db, { dir = DEFAULT_DIR, log = () => {} } = {}) {
  const { manifest, stops } = await readExtract(dir);
  const rows = [];
  const bad = [];
  for (const s of stops) {
    // The extractor calls the stop's identifier `key`; the table calls it stop_key.
    const ok = TransitStopRow.safeParse({ ...s, stop_key: s?.key });
    if (ok.success) rows.push(ok.data);
    else bad.push(`${s?.key}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));

  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: manifest.retrieved_at,
    file_sha256: manifest.file_sha256,
    as_of: manifest.as_of,
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "ref_transit_stop", COLUMNS, id);
    for (let i = 0; i < rows.length; i += 5000) {
      await insert(rows.slice(i, i + 5000).map((r) => [r.stop_key, r.name, r.mode, r.lat, r.lon, JSON.stringify(r.routes)]));
    }
    const perMode = Object.fromEntries(TRANSIT_MODES.map((m) => [m, rows.filter((r) => r.mode === m).length]));
    log(`loaded ${await countRows(db, "ref_transit_stop", id)} stops ${JSON.stringify(perMode)}`);
    return { dataset_version_id: id, source_id: SOURCE_ID, rows: rows.length, files: [], as_of: manifest.as_of, per_mode: perMode };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/** @param {Record<string, [number, number]>} bounds least and most stops per mode */
export const stopChecks = (minimum = 10_000, bounds = MODE_BOUNDS) => [
  rowCountMatchesDeclared("ref_transit_stop"),
  minRows("ref_transit_stop", minimum),
  notMuchSmallerThanPrevious(0.8),
  ...Object.entries(bounds).map(([mode, [lo, hi]]) =>
    sqlCheck(
      `ref_transit_stop has fewer than ${lo} or more than ${hi} ${mode} stops`,
      `SELECT (SELECT count(*) FROM ref_transit_stop WHERE dataset_version_id = $1 AND mode = '${mode}') BETWEEN ${lo} AND ${hi} AS ok`,
    ),
  ),
  sqlCheck(
    "ref_transit_stop has a stop with an empty name",
    `SELECT NOT EXISTS (SELECT 1 FROM ref_transit_stop WHERE dataset_version_id = $1 AND btrim(name) = '') AS ok`,
  ),
  sqlCheck(
    "ref_transit_stop has a stop outside Victoria",
    `SELECT NOT EXISTS (SELECT 1 FROM ref_transit_stop WHERE dataset_version_id = $1
       AND (lat NOT BETWEEN -39.3 AND -33.9 OR lon NOT BETWEEN 140.9 AND 150.1)) AS ok`,
  ),
];

/**
 * @param {any} db
 * @param {{ dir?: string, minimum?: number, bounds?: Record<string, [number, number]>, log?: (m: string) => void }} [opts]
 */
export async function runGtfsStops(db, { dir, minimum = 10_000, bounds = MODE_BOUNDS, log } = {}) {
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: stopChecks(minimum, bounds),
    load: () => loadStops(db, { dir, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli(async (db, { log, argv, kind }) => {
    const explicit = cliArg(argv, "--dir");
    if (explicit) return runGtfsStops(db, { dir: path.resolve(explicit), log });
    if (kind === "pglite") {
      // A dry run without --dir extracts the small committed fixture feed into a temp directory, so it needs no real download and
      // exercises the extractor as well as the loader. The counts are tiny, so the real-feed bounds become "at least one of each mode".
      const out = await mkdtemp(path.join(os.tmpdir(), "gtfs-dry-run-"));
      log(runExtractor({ input: FIXTURE_FEED, out, as_of: FIXTURE_AS_OF }));
      const bounds = Object.fromEntries(TRANSIT_MODES.map((m) => [m, [1, 1_000_000]]));
      return runGtfsStops(db, { dir: out, minimum: 1, bounds, log });
    }
    return runGtfsStops(db, { log });
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// Load the TSV written by gnaf-extract.py into ref_address / ref_building under a new dataset version, then publish (AD-7).
//
//   npm run pipeline:gnaf                  extract (python) then load into DATABASE_URL
//   node pipeline/ingest/gnaf-load.mjs --pglite [--dir DIR] [--limit N]    in-memory dry run
//
// Needs the suburb list for locality -> SAL matching; it is read from the ABS workbook (pipeline/ingest/suburbs-sal.mjs).
// Load order for a real database: run `npm run pipeline:sal` first so ref_suburb is published (the report joins it for the suburb name).
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyMigrations } from "../../db/migrate.mjs";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { openFromCli } from "../lib/db.mjs";
import { normName, searchText } from "../lib/normalise.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { AddressRow, GnafManifest } from "../lib/schemas.mjs";
import { minRows, notMuchSmallerThanPrevious, publish, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "out", "gnaf-vic");

export class SchemaFailure extends Error {
  constructor(count, firstErrors) {
    super(`${count} row(s) failed the address schema; nothing published. First: ${firstErrors.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

const COLUMNS = [
  { name: "gnaf_pid", type: "text" },
  { name: "building_id", type: "text" },
  { name: "is_property_level", type: "boolean" },
  { name: "unit_number", type: "text" },
  { name: "flat_type", type: "text" },
  { name: "level_number", type: "text" },
  { name: "number_first", type: "text" },
  { name: "number_last", type: "text" },
  { name: "street_name", type: "text" },
  { name: "street_name_norm", type: "text" },
  { name: "street_type", type: "text" },
  { name: "street_suffix", type: "text" },
  { name: "building_name", type: "text" },
  { name: "locality_name", type: "text" },
  { name: "locality_norm", type: "text" },
  { name: "postcode", type: "text" },
  { name: "state", type: "text" },
  { name: "sal_code", type: "text" },
  { name: "sal_match_type", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
  { name: "display_address", type: "text" },
  { name: "search_text", type: "text" },
];

function toValues(a, state, sal) {
  return [
    a.gnaf_pid,
    a.building_id,
    a.is_property_level,
    a.unit_number,
    a.flat_type,
    a.level_number,
    a.number_first,
    a.number_last,
    a.street_name,
    a.street_name ? normName(a.street_name) : null,
    a.street_type,
    a.street_suffix,
    a.building_name,
    a.locality_name,
    normName(a.locality_name),
    a.postcode,
    state,
    sal.sal_code,
    sal.match_type,
    a.lat,
    a.lon,
    a.display_address,
    // Only property-level rows are searched, so only they carry text (keeps the trigram index small).
    a.is_property_level ? searchText(a) : null,
  ];
}

/**
 * Load one extract directory. Returns the new dataset_version_id (status `loading`); call publishGnaf next.
 * Any row that fails the schema aborts the load and marks the version failed.
 */
export async function loadGnaf(db, { dir = DEFAULT_DIR, sals, batchSize = 5000, limit = 0, declaredRowCount = undefined, log = (_m) => {} }) {
  const manifest = GnafManifest.parse(JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")));
  const index = buildSalIndex(sals);
  const declared = declaredRowCount ?? (limit ? Math.min(limit, manifest.row_count) : manifest.row_count);
  const id = await createDatasetVersion(db, {
    source_id: "gnaf",
    retrieved_at: manifest.retrieved_at,
    file_sha256: manifest.file_sha256,
    as_of: manifest.as_of,
    row_count: declared,
    states: [manifest.state],
  });

  try {
    const insert = makeBatchInserter(db, "ref_address", COLUMNS, id);
    const rl = readline.createInterface({ input: createReadStream(path.join(dir, "addresses.tsv"), "utf8"), crlfDelay: Infinity });
    let header = null;
    let batch = [];
    let loaded = 0;
    let bad = 0;
    const firstErrors = [];
    for await (const line of rl) {
      if (!line) continue;
      const cells = line.split("\t");
      if (!header) {
        header = cells;
        continue;
      }
      if (limit && loaded + batch.length >= limit) break;
      const obj = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
      const parsed = AddressRow.safeParse(obj);
      if (!parsed.success) {
        bad++;
        if (firstErrors.length < 3) firstErrors.push(`${obj.gnaf_pid}: ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}`);
        continue;
      }
      batch.push(toValues(parsed.data, manifest.state, index.match(parsed.data.locality_name)));
      if (batch.length >= batchSize) {
        loaded += await insert(batch);
        batch = [];
        if (loaded % (batchSize * 20) === 0) log(`  ${loaded} rows`);
      }
    }
    loaded += await insert(batch);
    if (bad > 0) throw new SchemaFailure(bad, firstErrors);

    // A buildings table derived in SQL from the loaded rows: primaries that have at least one live secondary.
    await db.query(
      `INSERT INTO ref_building (dataset_version_id, building_id, sal_code, state, unit_count, building_name, display_address, lat, lon)
       SELECT p.dataset_version_id, p.gnaf_pid, p.sal_code, p.state, u.n, p.building_name, p.display_address, p.lat, p.lon
       FROM ref_address p
       JOIN (SELECT building_id, count(*)::int AS n FROM ref_address
             WHERE dataset_version_id = $1 AND NOT is_property_level AND building_id IS NOT NULL GROUP BY building_id) u
         ON u.building_id = p.gnaf_pid
       WHERE p.dataset_version_id = $1 AND p.is_property_level`,
      [id],
    );
    log(`loaded ${loaded} addresses, ${await countRows(db, "ref_building", id)} buildings`);
    return { dataset_version_id: id, manifest, loaded };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/** Publish with row-count checks. On a failed check the pointer stays where it was. */
export function publishGnaf(db, { dataset_version_id }, { minAddresses = 1, previousRatio = 0.9 } = {}) {
  return publish(db, {
    source_id: "gnaf",
    dataset_version_id,
    checks: [
      rowCountMatchesDeclared("ref_address"),
      minRows("ref_address", minAddresses),
      notMuchSmallerThanPrevious(previousRatio),
      sqlCheck(
        "ref_building is empty although unit rows exist",
        `SELECT (NOT EXISTS (SELECT 1 FROM ref_address WHERE dataset_version_id = $1 AND NOT is_property_level AND building_id IS NOT NULL)
                 OR EXISTS (SELECT 1 FROM ref_building WHERE dataset_version_id = $1)) AS ok`,
      ),
    ],
  });
}

async function main() {
  const argv = process.argv;
  const dir = argv.includes("--dir") ? path.resolve(argv[argv.indexOf("--dir") + 1]) : DEFAULT_DIR;
  const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : 0;
  if (limit && !argv.includes("--pglite")) {
    console.error("--limit loads a sample and would publish it as the live dataset. It is only allowed together with --pglite.");
    process.exit(2);
  }
  const { db, close, kind } = await openFromCli();
  try {
    if (kind === "pglite") await applyMigrations(db);
    const sals = await readVicSals();
    const log = (m) => console.log(m);
    const result = await loadGnaf(db, { dir, sals, limit, log });
    // A full Victorian load has several million addresses; a tiny count means a bad extract.
    await publishGnaf(db, result, { minAddresses: limit ? 1 : 1_000_000 });
    console.log(`published gnaf dataset version ${result.dataset_version_id} (${result.loaded} addresses, ${kind})`);
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

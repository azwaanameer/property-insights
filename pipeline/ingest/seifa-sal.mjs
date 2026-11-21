// ABS SEIFA 2021 for suburbs and localities (SAL 2021) -> fact_suburb_marker, then publish (AD-7).
//
//   node pipeline/ingest/seifa-sal.mjs --pglite            in-memory dry run (applies migrations, loads suburbs first)
//   node --env-file=.env pipeline/ingest/seifa-sal.mjs      load and publish into the database named by DATABASE_URL
//
// Reads data/raw/national/abs-api/ABS_SEIFA2021_SAL.csv (ABS Data API export, long format: SAL, SEIFAINDEXTYPE, SEIFA_MEASURE,
// OBS_VALUE). Only Victorian codes (2xxxx) and the two indexes the report uses are kept:
//   seifa_irsad          IRSAD score  (relative socio-economic advantage and disadvantage)
//   seifa_irsad_decile   IRSAD decile within Australia (1 = most disadvantaged, 10 = most advantaged)
//   seifa_irsd           IRSD score   (relative socio-economic disadvantage)
//   seifa_irsd_decile    IRSD decile within Australia
// An ABS quality flag (OBS_STATUS "q", small population) is kept in `flag`. These are ABS published indexes, not a score of ours.
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDelimitedLine } from "../lib/csv.mjs";
import { newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { loadAndPublish, runCli, suburbChecks } from "../lib/suburb-run.mjs";
import { insertMarkers } from "./census-sal.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_FILE = path.join(root, "data", "raw", "national", "abs-api", "ABS_SEIFA2021_SAL.csv");
export const SEIFA_AS_OF = "2021-08-10"; // Census night; SEIFA 2021 is built from the 2021 Census
const SOURCE_ID = "abs_seifa_2021";
const KEEP = {
  "IRSAD|SCORE": "seifa_irsad",
  "IRSAD|RWAD": "seifa_irsad_decile",
  "IRSD|SCORE": "seifa_irsd",
  "IRSD|RWAD": "seifa_irsd_decile",
};

/** Read the CSV as a stream (it has about 675,000 rows) and return marker rows for Victorian codes. */
export async function parseSeifa(file = DEFAULT_FILE) {
  const rl = readline.createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header = null;
  const rows = [];
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseDelimitedLine(line);
    if (!header) {
      header = Object.fromEntries(cells.map((h, i) => [h.trim(), i]));
      for (const need of ["SAL", "SEIFAINDEXTYPE", "SEIFA_MEASURE", "OBS_VALUE", "OBS_STATUS"]) {
        if (!(need in header)) throw new Error(`column ${need} not found in ${file}`);
      }
      continue;
    }
    const sal = cells[header.SAL];
    if (!/^2\d{4}$/.test(sal)) continue;
    const marker_key = KEEP[`${cells[header.SEIFAINDEXTYPE]}|${cells[header.SEIFA_MEASURE]}`];
    if (!marker_key) continue;
    const value = Number(cells[header.OBS_VALUE]);
    if (cells[header.OBS_VALUE] === "" || !Number.isFinite(value)) continue;
    rows.push({ sal_code: sal, marker_key, value, flag: cells[header.OBS_STATUS] || null });
  }
  return rows;
}

export async function loadSeifa(db, { file = DEFAULT_FILE, rows, sals, retrieved_at, log = () => {} }) {
  const parsed = rows ?? (await parseSeifa(file));
  return insertMarkers(db, {
    source_id: SOURCE_ID,
    rows: parsed,
    sals,
    file: path.basename(file),
    as_of: SEIFA_AS_OF,
    file_sha256: rows ? null : await sha256Of(file),
    retrieved_at: retrieved_at ?? (rows ? new Date().toISOString() : await newestMtimeIso([file])),
    log,
  });
}

export const seifaChecks = (minimum = 8_000) =>
  suburbChecks({
    table: "fact_suburb_marker",
    minimum,
    ranges: [
      {
        message: "fact_suburb_marker has a SEIFA decile outside 1 to 10 or a score outside 200 to 1,400",
        sql: `SELECT NOT EXISTS (SELECT 1 FROM fact_suburb_marker WHERE dataset_version_id = $1 AND (
                (marker_key LIKE 'seifa\\_%\\_decile' AND (value < 1 OR value > 10))
                OR (marker_key IN ('seifa_irsad', 'seifa_irsd') AND (value < 200 OR value > 1400)))) AS ok`,
      },
    ],
  });

/**
 * @param {any} db
 * @param {{ file?: string, rows?: any[], sals?: any[], minimum?: number, log?: (m: string) => void }} [opts]
 */
export async function runSeifa(db, { file, rows, sals, minimum = 8_000, log } = {}) {
  const s = sals ?? (await readVicSals());
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: seifaChecks(minimum),
    load: () => loadSeifa(db, { file, rows, sals: s, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli((db, { log }) => runSeifa(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

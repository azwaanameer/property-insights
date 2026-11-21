// Crime Statistics Agency (CSA) recorded crime -> fact_crime_suburb, fact_crime_lga and fact_crime_note, then publish (AD-7).
//
//   npm run pipeline:crime                                  extract (python, about twenty seconds) then load into DATABASE_URL (reads .env)
//   node pipeline/ingest/crime.mjs --pglite                  in-memory dry run on the real extract in data/out/crime-vic
//   node pipeline/ingest/crime.mjs --pglite --dir DIR        the same on another extract directory
//
// crime-extract.py reads the 17 MB workbook data/raw/vic/crime/Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx and writes
// lga.json (Table 01), suburb.json (Table 03 added up to offence subdivision), notes.json (the workbook's own notices) and manifest.json
// under data/out/crime-vic/ (see its header for why openpyxl and not the xlsx package). This loader validates every row with zod, loads
// one dataset version of source csa_crime_incidents and publishes with checks. A failed check leaves the old dataset live.
//
// What is stored and what is left out.
//   fact_crime_lga      Table 01 rows for council areas and the two non-council rows. The CSA also writes a "Total" row after each police
//                       region; those are checked against the rows they add up (a mismatch fails the load) and then NOT stored, because
//                       adding them back in would count every incident twice (they carry a rate too).
//   fact_crime_suburb   Table 03 per year, council area, postcode, suburb or town and offence subdivision. The suburb key is the suburb
//                       name normalised exactly as the address file is (lib/normalise.mjs) and lower-cased.
//   fact_crime_note     The Contents and Footnotes sheets' notices, as published. The load fails if the licence sentence is missing,
//                       because the source is cleared on the strength of that sentence (migration 0008).
// Counts only. No victim, offender, family-incident, location or charge tables, and no score of any kind.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { normName } from "../lib/normalise.mjs";
import { cliArg, runPointCli } from "../lib/point-run.mjs";
import { CrimeLgaRow, CrimeManifest, CrimeNoteRow, CrimeSuburbRow } from "../lib/schemas.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, sqlCheck } from "../publish/publish.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "out", "crime-vic");
export const DEFAULT_XLSX = path.join(root, "data", "raw", "vic", "crime", "Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx");
export const SOURCE_ID = "csa_crime_incidents";

/** Table 01 has 87 rows a year: 79 council areas, the two non-council rows and six "Total" rows (four police regions and the two non-council groups). */
export const LGA_SOURCE_ROWS_PER_YEAR = 87;
/** Year ending June 2017 to year ending June 2026. */
export const YEARS_EXPECTED = 10;
/** The sentence the source is cleared on. */
export const LICENCE_SENTENCE = "Creative Commons Attribution 4.0";

export class CrimeDataError extends Error {
  constructor(problems) {
    super(`the crime extract is not usable; nothing published: ${problems.join("; ")}`);
    this.name = "CrimeDataError";
    this.problems = problems;
  }
}

export class SchemaFailure extends Error {
  constructor(what, count, first) {
    super(`${count} ${what} row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

/** Run the python extractor (python -I, every candidate executable tried). */
export function runExtractor({ input, out, as_of, spawn = spawnSync, candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"] }) {
  const script = path.join(root, "pipeline", "ingest", "crime-extract.py");
  const args = ["-I", script, ...(input ? ["--input", input] : []), ...(out ? ["--out", out] : []), ...(as_of ? ["--as-of", as_of] : [])];
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
  throw new Error(`crime-extract.py failed with every python tried (${failures.join("; ")}). Python 3 with openpyxl must be on PATH.`);
}

/** Read the four files an extract holds. The manifest is written last, so a missing or stale manifest means a cut-short extract. */
export async function readExtract(dir = DEFAULT_DIR) {
  const json = async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8"));
  const manifest = CrimeManifest.parse(await json("manifest.json"));
  const [lga, suburb, notes] = await Promise.all([json("lga.json"), json("suburb.json"), json("notes.json")]);
  if (!Array.isArray(lga) || !Array.isArray(suburb) || !Array.isArray(notes)) throw new Error("the extract files are not lists: run the extract again");
  if (manifest.row_count !== suburb.length) throw new Error(`manifest.json says ${manifest.row_count} suburb rows but suburb.json holds ${suburb.length}: run the extract again`);
  if (manifest.lga_source_rows !== lga.length) throw new Error(`manifest.json says ${manifest.lga_source_rows} council rows but lga.json holds ${lga.length}: run the extract again`);
  return { manifest, lga, suburb, notes };
}

/**
 * Pure: the extract -> the rows to store, or a CrimeDataError listing every problem. Checks made here, before anything is created:
 *   - Table 01 has `lgaRowsPerYear` rows for each of `years` years;
 *   - every police region's "Total" row equals the sum of the rows listed under it, for every year;
 *   - every council area in Table 03 is a council area in Table 01;
 *   - the licence sentence is among the notices.
 */
export function buildCrimeRows(extract, { lgaRowsPerYear = LGA_SOURCE_ROWS_PER_YEAR, years = YEARS_EXPECTED } = {}) {
  const problems = [];
  const { lga, suburb, notes } = extract;

  const sourceYears = [...new Set(lga.map((r) => r.year))].sort((a, b) => a - b);
  if (sourceYears.length !== years) problems.push(`Table 01 covers ${sourceYears.length} years, expected ${years}`);
  for (const y of sourceYears) {
    const n = lga.filter((r) => r.year === y).length;
    if (n !== lgaRowsPerYear) problems.push(`Table 01 has ${n} rows for year ending June ${y}, expected ${lgaRowsPerYear}`);
  }

  // Each "Total" row must equal the rows above it in the same police region and year.
  const sums = new Map();
  for (const r of lga) {
    if (r.is_total) continue;
    const k = `${r.year}|${r.police_region}`;
    sums.set(k, (sums.get(k) ?? 0) + r.incidents);
  }
  for (const r of lga.filter((x) => x.is_total)) {
    const k = `${r.year}|${r.police_region}`;
    if (sums.get(k) !== r.incidents) problems.push(`Table 01 ${r.police_region} Total for ${r.year} is ${r.incidents} but its rows add to ${sums.get(k) ?? 0}`);
  }

  const lgaRows = [];
  for (const r of lga) {
    if (r.is_total) continue;
    const ok = CrimeLgaRow.safeParse({ year_ending: r.year, police_region: r.police_region, lga: r.lga, incidents: r.incidents, rate_per_100k: r.rate_per_100k });
    if (ok.success) lgaRows.push(ok.data);
    else problems.push(`council row ${r.year} ${r.lga}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }

  const councils = new Set(lgaRows.map((r) => r.lga));
  const suburbRows = [];
  const unknownCouncils = new Set();
  let badRows = 0;
  for (const r of suburb) {
    const [year, council, postcode, name, division, subdivision, incidents] = r;
    const ok = CrimeSuburbRow.safeParse({ year_ending: year, lga: council, postcode, suburb: name, suburb_key: normName(name).toLowerCase(), division, subdivision, incidents });
    if (!ok.success) {
      if (++badRows <= 3) problems.push(`suburb row ${JSON.stringify(r)}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
      continue;
    }
    if (!councils.has(ok.data.lga)) unknownCouncils.add(ok.data.lga);
    suburbRows.push(ok.data);
  }
  if (badRows > 3) problems.push(`${badRows - 3} more suburb rows failed the schema`);
  if (unknownCouncils.size) problems.push(`Table 03 has council areas that Table 01 does not: ${[...unknownCouncils].slice(0, 5).join(", ")}`);

  const noteRows = [];
  for (const n of notes) {
    const ok = CrimeNoteRow.safeParse({ note_key: n.note_key, sheet: n.sheet, topic: n.topic, seq: n.seq, note_text: n.text });
    if (ok.success) noteRows.push(ok.data);
    else problems.push(`notice ${n.note_key}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (!noteRows.some((n) => n.note_text.includes(LICENCE_SENTENCE))) {
    problems.push(`the workbook's Notes do not state the licence ("${LICENCE_SENTENCE}"); the source is cleared on that sentence`);
  }

  if (problems.length) throw new CrimeDataError(problems);
  return { lgaRows, suburbRows, noteRows };
}

const SUBURB_COLUMNS = [
  { name: "year_ending", type: "integer" },
  { name: "lga", type: "text" },
  { name: "postcode", type: "text" },
  { name: "suburb", type: "text" },
  { name: "suburb_key", type: "text" },
  { name: "division", type: "text" },
  { name: "subdivision", type: "text" },
  { name: "incidents", type: "integer" },
];
const LGA_COLUMNS = [
  { name: "year_ending", type: "integer" },
  { name: "police_region", type: "text" },
  { name: "lga", type: "text" },
  { name: "incidents", type: "integer" },
  { name: "rate_per_100k", type: "double precision" },
];
const NOTE_COLUMNS = [
  { name: "note_key", type: "text" },
  { name: "sheet", type: "text" },
  { name: "topic", type: "text" },
  { name: "seq", type: "integer" },
  { name: "note_text", type: "text" },
];

/**
 * Validate and insert under a new dataset version (status `loading`).
 * @param {any} db
 * @param {{ dir?: string, extract?: any, expect?: { lgaRowsPerYear?: number, years?: number }, log?: (m: string) => void }} [opts]
 */
export async function loadCrime(db, { dir = DEFAULT_DIR, extract, expect, log = () => {} } = {}) {
  const data = extract ?? (await readExtract(dir));
  const { manifest } = data;
  const { lgaRows, suburbRows, noteRows } = buildCrimeRows(data, expect);
  const declared = suburbRows.length + lgaRows.length;
  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: manifest.retrieved_at,
    file_sha256: manifest.file_sha256,
    as_of: manifest.as_of,
    row_count: declared,
    states: ["VIC"],
  });
  try {
    const insertS = makeBatchInserter(db, "fact_crime_suburb", SUBURB_COLUMNS, id);
    for (let i = 0; i < suburbRows.length; i += 5000) {
      await insertS(suburbRows.slice(i, i + 5000).map((r) => [r.year_ending, r.lga, r.postcode, r.suburb, r.suburb_key, r.division, r.subdivision, r.incidents]));
    }
    const insertL = makeBatchInserter(db, "fact_crime_lga", LGA_COLUMNS, id);
    await insertL(lgaRows.map((r) => [r.year_ending, r.police_region, r.lga, r.incidents, r.rate_per_100k]));
    const insertN = makeBatchInserter(db, "fact_crime_note", NOTE_COLUMNS, id);
    await insertN(noteRows.map((r) => [r.note_key, r.sheet, r.topic, r.seq, r.note_text]));
    const years = [...new Set(lgaRows.map((r) => r.year_ending))].sort((a, b) => a - b);
    log(`loaded ${await countRows(db, "fact_crime_suburb", id)} suburb rows, ${await countRows(db, "fact_crime_lga", id)} council rows and ${await countRows(db, "fact_crime_note", id)} notices, years ending June ${years[0]} to ${years.at(-1)}`);
    return {
      dataset_version_id: id,
      source_id: SOURCE_ID,
      rows: declared,
      files: [],
      as_of: manifest.as_of,
      suburb_rows: suburbRows.length,
      lga_rows: lgaRows.length,
      notices: noteRows.length,
      years,
      table03_totals: manifest.table03_totals,
      lga_rows_per_year: lgaRows.filter((r) => r.year_ending === years[0]).length,
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/**
 * Publish checks. `controlTotals` maps each year to the sum of the raw Table 03 rows, worked out by the extractor before it added
 * subgroup rows up; the loaded suburb rows must come to the same total within `tolerance` (1%). The loaded suburb rows must also come to
 * the council rows' total for the year within the same tolerance (Table 03 and Table 01 count the same incidents, Table 01 less the two
 * non-council groups). The 87-rows-a-year check is made on the source rows in buildCrimeRows; here every year must have the same number of
 * stored council rows.
 * `councilTolerance` is the same comparison against the council counts and defaults to `tolerance`; tests on an excerpt of a few suburbs set it to 1
 * (switched off) and keep the control total check on.
 * @param {{ years?: number, lgaStoredPerYear?: number, controlTotals?: Record<string, number>, tolerance?: number, councilTolerance?: number, minimum?: number }} [opts]
 */
export const crimeChecks = ({ years = YEARS_EXPECTED, lgaStoredPerYear, controlTotals = {}, tolerance = 0.01, councilTolerance = tolerance, minimum = 100_000 } = {}) => {
  const control = Object.entries(controlTotals);
  return [
    sqlCheck(
      "fact_crime_suburb and fact_crime_lga together do not equal the declared row count",
      `SELECT (SELECT count(*) FROM fact_crime_suburb WHERE dataset_version_id = $1) + (SELECT count(*) FROM fact_crime_lga WHERE dataset_version_id = $1)
              = (SELECT row_count FROM src_dataset_version WHERE dataset_version_id = $1) AS ok`,
    ),
    minRows("fact_crime_suburb", minimum),
    notMuchSmallerThanPrevious(0.8),
    sqlCheck(
      `fact_crime_lga does not cover ${years} years with the same number of council rows in each${lgaStoredPerYear ? ` (${lgaStoredPerYear})` : ""}`,
      `SELECT (SELECT count(DISTINCT year_ending) FROM fact_crime_lga WHERE dataset_version_id = $1) = ${Number(years)}
              AND (SELECT count(DISTINCT n) FROM (SELECT count(*) AS n FROM fact_crime_lga WHERE dataset_version_id = $1 GROUP BY year_ending) t) = 1
              ${lgaStoredPerYear ? `AND (SELECT min(n) FROM (SELECT count(*) AS n FROM fact_crime_lga WHERE dataset_version_id = $1 GROUP BY year_ending) t) = ${Number(lgaStoredPerYear)}` : ""} AS ok`,
    ),
    sqlCheck(
      "fact_crime_suburb has a council area that is not in fact_crime_lga",
      `SELECT NOT EXISTS (
         SELECT 1 FROM fact_crime_suburb s
         WHERE s.dataset_version_id = $1
           AND NOT EXISTS (SELECT 1 FROM fact_crime_lga l WHERE l.dataset_version_id = s.dataset_version_id AND l.lga = s.lga)) AS ok`,
    ),
    sqlCheck(
      "fact_crime_suburb or fact_crime_lga has a negative count",
      `SELECT NOT EXISTS (SELECT 1 FROM fact_crime_suburb WHERE dataset_version_id = $1 AND incidents < 0)
          AND NOT EXISTS (SELECT 1 FROM fact_crime_lga WHERE dataset_version_id = $1 AND (incidents < 0 OR rate_per_100k < 0)) AS ok`,
    ),
    sqlCheck(
      `the loaded suburb counts for a year differ from the extractor's control total by more than ${tolerance * 100}%`,
      control.length === 0
        ? "SELECT true AS ok"
        : `SELECT NOT EXISTS (
             SELECT 1 FROM (VALUES ${control.map(([y, t]) => `(${Number(y)}, ${Number(t)}::numeric)`).join(", ")}) AS c(y, total)
             WHERE abs(COALESCE((SELECT sum(incidents) FROM fact_crime_suburb WHERE dataset_version_id = $1 AND year_ending = c.y), 0) - c.total) > c.total * ${tolerance}) AS ok`,
    ),
    sqlCheck(
      `the loaded suburb counts for a year differ from the council area counts by more than ${councilTolerance * 100}%`,
      `SELECT NOT EXISTS (
         SELECT 1 FROM (SELECT year_ending, sum(incidents)::numeric AS total FROM fact_crime_lga WHERE dataset_version_id = $1 AND rate_per_100k IS NOT NULL GROUP BY year_ending) l
         WHERE abs(COALESCE((SELECT sum(incidents) FROM fact_crime_suburb s WHERE s.dataset_version_id = $1 AND s.year_ending = l.year_ending), 0) - l.total) > l.total * ${councilTolerance}) AS ok`,
    ),
    sqlCheck(
      "fact_crime_note has no licence sentence",
      `SELECT EXISTS (SELECT 1 FROM fact_crime_note WHERE dataset_version_id = $1 AND note_text LIKE '%${LICENCE_SENTENCE}%') AS ok`,
    ),
  ];
};

/**
 * @param {any} db
 * @param {{ dir?: string, extract?: any, expect?: { lgaRowsPerYear?: number, years?: number }, minimum?: number, tolerance?: number, councilTolerance?: number, log?: (m: string) => void }} [opts]
 */
export async function runCrime(db, { dir, extract, expect, minimum, tolerance, councilTolerance, log } = {}) {
  const data = extract ?? (await readExtract(dir));
  const years = expect?.years ?? YEARS_EXPECTED;
  const nonTotal = data.lga.filter((r) => !r.is_total);
  const firstYear = nonTotal.length ? Math.min(...nonTotal.map((r) => r.year)) : undefined;
  const stored = nonTotal.filter((r) => r.year === firstYear).length || undefined;
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: crimeChecks({ years, lgaStoredPerYear: stored, controlTotals: data.manifest.table03_totals, minimum, tolerance, councilTolerance }),
    load: () => loadCrime(db, { extract: data, expect, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli((db, { log, argv }) => runCrime(db, { dir: cliArg(argv, "--dir", DEFAULT_DIR), log }), { require: { table: "fact_crime_lga", migration: "0008" } }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}


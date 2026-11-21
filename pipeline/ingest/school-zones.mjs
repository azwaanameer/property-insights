// Victorian school zones 2026 and school locations 2026 -> ref_school_zone and ref_school, then publish both (AD-7).
//
//   node pipeline/ingest/school-zones.mjs --pglite            in-memory dry run on the real files
//   node --env-file=.env pipeline/ingest/school-zones.mjs      load and publish into the database named by DATABASE_URL
//   npm run pipeline:schools                                   the same, as a script
//
// Two sources, so two dataset versions, each with its own pointer and as-of date (the date the file was saved into data/raw):
//   vic_school_locations_2026  locations2026.csv (Windows-1252, not UTF-8): one row per OPEN school, with sector, type, address and
//                              coordinates. Nothing about quality or enrolment is read or stored.
//   vic_school_zones_2026      zones2026.zip: GeoJSON polygons (CRS84, lon/lat) for government neighbourhood schools only:
//                              Primary_Integrated, Secondary_Integrated_Year7 to Year12 and the three Standalone files.
//
// A zone's ENTITY_CODE is "1" + the four-digit school number + "01" (1074401 is school 744). Zones exist for government schools only,
// and government and non-government schools are numbered separately, so a location's key is G or N plus its number (G744). The zone
// school is joined to its location row by G + that number where the key exists in the locations file; a zone whose key is not there
// keeps its name only (school_key null). Secondary zones that are the same polygon for several year levels are one row listing them.
// Checks: rows within bounds, every ring closes, every bounding box is sane and inside Victoria, every zone has a name.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { parseDelimited } from "../lib/csv.mjs";
import { newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { runPointCli } from "../lib/point-run.mjs";
import { SchoolRow, SchoolZoneRow } from "../lib/schemas.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";
import { readZipMembers } from "../lib/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(root, "data", "raw", "vic", "schools");
export const DEFAULT_ZIP = path.join(DIR, "zones2026.zip");
export const DEFAULT_CSV = path.join(DIR, "locations2026.csv");
export const ZONES_SOURCE = "vic_school_zones_2026";
export const LOCATIONS_SOURCE = "vic_school_locations_2026";

/** The zone files read from the zip, in the order their rows are numbered. */
export const ZONE_MEMBERS = [
  "Primary_Integrated_2026.geojson",
  ...[7, 8, 9, 10, 11, 12].map((y) => `Secondary_Integrated_Year${y}_2026.geojson`),
  "Standalone_juniorsec_2026.geojson",
  "Standalone_seniorsec_2026.geojson",
  "Standalone_singlesex_2026.geojson",
];

export class SchemaFailure extends Error {
  constructor(what, count, first) {
    super(`${count} ${what} row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

const SECTORS = new Set(["Government", "Catholic", "Independent"]);
const title = (s) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()).replace(/'S\b/g, "'s");
const str = (v) => String(v ?? "").trim();

// ---------------------------------------------------------------- locations

/**
 * Pure: the locations CSV text -> school rows plus what was set aside. Only schools whose status is open (O) are kept, and a school
 * with no coordinates cannot be placed, so it is set aside and counted.
 */
export function parseLocations(text) {
  const records = parseDelimited(text.replace(/^﻿/, ""));
  const rows = [];
  const aside = { not_open: 0, no_coordinates: 0, unknown_sector: 0 };
  const seen = new Map();
  for (const r of records) {
    if (str(r.School_Status) !== "O") {
      aside.not_open++;
      continue;
    }
    if (!SECTORS.has(str(r.Education_Sector))) {
      aside.unknown_sector++;
      continue;
    }
    const lon = Number(str(r.X));
    const lat = Number(str(r.Y));
    if (str(r.X) === "" || str(r.Y) === "" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      aside.no_coordinates++;
      continue;
    }
    const number = String(Number(str(r.School_No)));
    // Entity_Type 1 is a government school; 2 is Catholic or independent. A second campus under one number is a second row.
    const base = `${str(r.Entity_Type) === "1" ? "G" : "N"}${number}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const line = [str(r.Address_Line_1), str(r.Address_Line_2)].filter(Boolean).join(", ");
    rows.push({
      school_key: n === 1 ? base : `${base}-${n}`,
      school_no: number,
      name: str(r.School_Name),
      sector: str(r.Education_Sector),
      school_type: str(r.School_Type),
      address: line,
      locality: title(str(r.Address_Town)),
      postcode: str(r.Address_Postcode) || null,
      lat,
      lon,
    });
  }
  return { rows, records: records.length, aside };
}

/** Locations CSV bytes are Windows-1252 (curly apostrophes in school names), not UTF-8. */
export const decodeLocations = (buffer) => new TextDecoder("windows-1252").decode(buffer);

// ---------------------------------------------------------------- zones

/** "7 to 12" -> [7..12]; "7" -> [7]; "P6" (Prep to Year 6) -> null. */
function yearsOf(label) {
  const s = str(label);
  const range = /^(\d{1,2}) to (\d{1,2})$/.exec(s);
  if (range) return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i);
  return /^\d{1,2}$/.test(s) ? [Number(s)] : null;
}

/** [7,8,9,11] -> "Years 7 to 9, 11"; [7] -> "Year 7". */
export function yearLabel(years) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]} to ${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return `${sorted.length === 1 ? "Year" : "Years"} ${parts.join(", ")}`;
}

/** The government school key inside an entity code: 1074401 -> "G744". Null when the code is not seven digits. */
export function schoolKeyOf(entityCode) {
  const s = String(entityCode ?? "");
  return /^1\d{4}\d{2}$/.test(s) ? `G${Number(s.slice(1, 5))}` : null;
}

const bbox = (ring) => {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { min_lat: minLat, max_lat: maxLat, min_lon: minLon, max_lon: maxLon };
};

/**
 * Pure: zone GeoJSON texts keyed by member name -> zone rows. `schoolKeys` is the set of keys in the locations file; a zone whose
 * key is in it gets school_key, any other keeps its name only. A feature that is not a Polygon is returned in `bad`, never guessed.
 */
export function buildZones(texts, schoolKeys) {
  const grouped = new Map(); // entity + level + geometry -> zone
  const bad = [];
  let features = 0;
  for (const member of ZONE_MEMBERS) {
    const text = texts[member];
    if (text === undefined) throw new Error(`zone file ${member} was not read`);
    const level = member.startsWith("Primary") ? "primary" : "secondary";
    for (const f of JSON.parse(text).features) {
      features++;
      const p = f.properties ?? {};
      if (f.geometry?.type !== "Polygon") {
        bad.push(`${p.School_Name}: geometry is ${f.geometry?.type}, not Polygon`);
        continue;
      }
      const years = level === "primary" ? null : yearsOf(p.Year_Level);
      if (level === "secondary" && !years) {
        bad.push(`${p.School_Name}: unreadable Year_Level ${p.Year_Level}`);
        continue;
      }
      const rings = f.geometry.coordinates;
      const key = `${p.ENTITY_CODE}|${level}|${JSON.stringify(rings)}`;
      const cur = grouped.get(key);
      if (cur) {
        if (years) cur.years.push(...years);
        continue;
      }
      grouped.set(key, { props: p, level, rings, years: years ? [...years] : [] });
    }
  }
  const order = new Map();
  const rows = [...grouped.values()].map((g) => {
    const entity = g.props.ENTITY_CODE === undefined || g.props.ENTITY_CODE === null ? null : String(g.props.ENTITY_CODE);
    const base = `${g.level === "primary" ? "P" : "S"}${entity ?? str(g.props.School_Name).replace(/\W+/g, "_")}`;
    const n = (order.get(base) ?? 0) + 1;
    order.set(base, n);
    const key = schoolKeyOf(g.props.ENTITY_CODE);
    return {
      zone_id: n === 1 ? base : `${base}#${n}`,
      school_name: str(g.props.School_Name),
      campus_name: str(g.props.Campus_Name) || null,
      entity_code: entity,
      school_key: key && schoolKeys.has(key) ? key : null,
      level: g.level,
      year_levels: g.level === "primary" ? "Prep to Year 6" : yearLabel(g.years),
      boundary_year: Number(g.props.Boundary_Year),
      ...bbox(g.rings[0]),
      rings: g.rings,
    };
  });
  return { rows, bad, features };
}

// ---------------------------------------------------------------- load

const LOCATION_COLUMNS = [
  { name: "school_key", type: "text" },
  { name: "school_no", type: "text" },
  { name: "name", type: "text" },
  { name: "sector", type: "text" },
  { name: "school_type", type: "text" },
  { name: "address", type: "text" },
  { name: "locality", type: "text" },
  { name: "postcode", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
];

const ZONE_COLUMNS = [
  { name: "zone_id", type: "text" },
  { name: "school_name", type: "text" },
  { name: "campus_name", type: "text" },
  { name: "entity_code", type: "text" },
  { name: "school_key", type: "text" },
  { name: "level", type: "text" },
  { name: "year_levels", type: "text" },
  { name: "boundary_year", type: "integer" },
  { name: "min_lat", type: "double precision" },
  { name: "max_lat", type: "double precision" },
  { name: "min_lon", type: "double precision" },
  { name: "max_lon", type: "double precision" },
  { name: "rings", type: "jsonb" },
];

const isoDate = (iso) => iso.slice(0, 10);

/**
 * Parse, validate and insert the locations under a new dataset version (status `loading`).
 * @param {{ file?: string, text?: string, as_of?: string, retrieved_at?: string, log?: (m: string) => void }} opts
 */
export async function loadLocations(db, { file = DEFAULT_CSV, text, as_of, retrieved_at, log = () => {} } = {}) {
  const source = text ?? decodeLocations(await readFile(file));
  const parsed = parseLocations(source);
  const rows = [];
  const bad = [];
  for (const r of parsed.rows) {
    const ok = SchoolRow.safeParse(r);
    if (ok.success) rows.push(ok.data);
    else bad.push(`${r.school_key} ${r.name}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure("school", bad.length, bad.slice(0, 3));
  const stamp = retrieved_at ?? (text === undefined ? await newestMtimeIso([file]) : new Date().toISOString());
  const id = await createDatasetVersion(db, {
    source_id: LOCATIONS_SOURCE,
    retrieved_at: stamp,
    file_sha256: text === undefined ? await sha256Of(file) : null,
    as_of: as_of ?? isoDate(stamp),
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "ref_school", LOCATION_COLUMNS, id);
    for (let i = 0; i < rows.length; i += 2000) {
      await insert(rows.slice(i, i + 2000).map((r) => [r.school_key, r.school_no, r.name, r.sector, r.school_type, r.address, r.locality, r.postcode, r.lat, r.lon]));
    }
    log(`loaded ${await countRows(db, "ref_school", id)} schools (${parsed.aside.not_open} not open, ${parsed.aside.no_coordinates} without coordinates set aside)`);
    return {
      dataset_version_id: id,
      source_id: LOCATIONS_SOURCE,
      rows: rows.length,
      files: [{ file: "locations2026.csv", records: parsed.records, matched: rows.length, unmatched: [] }],
      as_of: as_of ?? isoDate(stamp),
      aside: parsed.aside,
      school_keys: new Set(rows.map((r) => r.school_key)),
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/**
 * Parse, validate and insert the zones under a new dataset version (status `loading`).
 * @param {{ zip?: string, texts?: Record<string, string>, schoolKeys: Set<string>, as_of?: string, retrieved_at?: string, log?: (m: string) => void }} opts
 */
export async function loadZones(db, { zip = DEFAULT_ZIP, texts, schoolKeys, as_of, retrieved_at, log = () => {} }) {
  const members = texts ?? readZipMembers(zip, ZONE_MEMBERS.map((m) => `^${m.replace(/\./g, "\\.")}$`));
  const byName = texts ?? Object.fromEntries(ZONE_MEMBERS.map((m) => [m, members[`^${m.replace(/\./g, "\\.")}$`]]));
  const built = buildZones(byName, schoolKeys);
  const rows = [];
  const bad = [...built.bad];
  for (const r of built.rows) {
    const ok = SchoolZoneRow.safeParse(r);
    if (ok.success) rows.push(ok.data);
    else bad.push(`${r.school_name}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure("zone", bad.length, bad.slice(0, 3));
  const stamp = retrieved_at ?? (texts ? new Date().toISOString() : await newestMtimeIso([zip]));
  const id = await createDatasetVersion(db, {
    source_id: ZONES_SOURCE,
    retrieved_at: stamp,
    file_sha256: texts ? null : await sha256Of(zip),
    as_of: as_of ?? isoDate(stamp),
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "ref_school_zone", ZONE_COLUMNS, id);
    for (let i = 0; i < rows.length; i += 200) {
      await insert(
        rows.slice(i, i + 200).map((r) => [
          r.zone_id, r.school_name, r.campus_name, r.entity_code, r.school_key, r.level, r.year_levels, r.boundary_year,
          r.min_lat, r.max_lat, r.min_lon, r.max_lon, JSON.stringify(r.rings),
        ]),
      );
    }
    const joined = rows.filter((r) => r.school_key).length;
    log(`loaded ${await countRows(db, "ref_school_zone", id)} zones from ${built.features} features (${joined} joined to a school location, ${rows.length - joined} keep the name only)`);
    return {
      dataset_version_id: id,
      source_id: ZONES_SOURCE,
      rows: rows.length,
      files: [{ file: "zones2026.zip", records: built.features, matched: joined, unmatched: [] }],
      as_of: as_of ?? isoDate(stamp),
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

// ---------------------------------------------------------------- checks and run

/** Real counts at 2026-11-14: 2,318 open schools; 1,268 primary zones and about 2,000 secondary zone rows. */
export const locationChecks = (minimum = 2_000, maximum = 3_000) => [
  rowCountMatchesDeclared("ref_school"),
  minRows("ref_school", minimum),
  notMuchSmallerThanPrevious(0.9),
  sqlCheck(`ref_school has more than ${maximum} rows`, `SELECT (SELECT count(*) FROM ref_school WHERE dataset_version_id = $1) <= ${maximum} AS ok`),
  sqlCheck(
    "ref_school lacks a Government, Catholic or Independent school",
    `SELECT (SELECT count(DISTINCT sector) FROM ref_school WHERE dataset_version_id = $1) = 3 AS ok`,
  ),
  sqlCheck(
    "ref_school has a school outside Victoria",
    `SELECT NOT EXISTS (SELECT 1 FROM ref_school WHERE dataset_version_id = $1 AND (lat NOT BETWEEN -39.3 AND -33.9 OR lon NOT BETWEEN 140.9 AND 150.1)) AS ok`,
  ),
];

export const zoneChecks = (minimum = 1_500, maximum = 6_000) => [
  rowCountMatchesDeclared("ref_school_zone"),
  minRows("ref_school_zone", minimum),
  notMuchSmallerThanPrevious(0.9),
  sqlCheck(`ref_school_zone has more than ${maximum} rows`, `SELECT (SELECT count(*) FROM ref_school_zone WHERE dataset_version_id = $1) <= ${maximum} AS ok`),
  sqlCheck(
    "ref_school_zone has a polygon ring that does not close",
    `SELECT NOT EXISTS (
       SELECT 1 FROM ref_school_zone z, jsonb_array_elements(z.rings) AS r
       WHERE z.dataset_version_id = $1 AND (r -> 0) <> (r -> (jsonb_array_length(r) - 1))) AS ok`,
  ),
  sqlCheck(
    "ref_school_zone has a bounding box that is empty or outside Victoria",
    `SELECT NOT EXISTS (SELECT 1 FROM ref_school_zone WHERE dataset_version_id = $1
       AND (min_lat >= max_lat OR min_lon >= max_lon OR min_lat < -39.3 OR max_lat > -33.9 OR min_lon < 140.9 OR max_lon > 150.1)) AS ok`,
  ),
  // The layer joins a zone school to its location row by key through the CURRENT locations dataset, so a key that is not there would
  // dangle (a failed or partial locations refresh, or zones built against another version).
  sqlCheck(
    "ref_school_zone has a school key that is not in the current school locations dataset",
    `SELECT NOT EXISTS (
       SELECT 1 FROM ref_school_zone z
       WHERE z.dataset_version_id = $1 AND z.school_key IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM ref_school s
           JOIN src_dataset_current c ON c.source_id = '${LOCATIONS_SOURCE}' AND c.dataset_version_id = s.dataset_version_id
           WHERE s.school_key = z.school_key)) AS ok`,
  ),
  sqlCheck("ref_school_zone has a zone with no name", `SELECT NOT EXISTS (SELECT 1 FROM ref_school_zone WHERE dataset_version_id = $1 AND btrim(school_name) = '') AS ok`),
  sqlCheck(
    "ref_school_zone is missing primary zones or secondary zones",
    `SELECT (SELECT count(DISTINCT level) FROM ref_school_zone WHERE dataset_version_id = $1) = 2 AS ok`,
  ),
];

/**
 * Load and publish the locations, then the zones (the zones are joined to the locations by school number).
 * @param {any} db
 * @param {{ zip?: string, csv?: string, zoneTexts?: Record<string, string>, locationsText?: string, as_of?: string, minimumSchools?: number, minimumZones?: number, log?: (m: string) => void }} [opts]
 */
export async function runSchoolZones(db, { zip, csv, zoneTexts, locationsText, as_of, minimumSchools = 2_000, minimumZones = 1_500, log } = {}) {
  const locations = await loadAndPublish(db, {
    source_id: LOCATIONS_SOURCE,
    checks: locationChecks(minimumSchools),
    load: () => loadLocations(db, { file: csv, text: locationsText, as_of, log }),
  });
  const zones = await loadAndPublish(db, {
    source_id: ZONES_SOURCE,
    checks: zoneChecks(minimumZones),
    load: () => loadZones(db, { zip, texts: zoneTexts, schoolKeys: locations.school_keys, as_of, log }),
  });
  return [locations, zones];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli((db, { log }) => runSchoolZones(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// City of Melbourne open data -> ref_com_building (building facts, matched to G-NAF buildings) and fact_supply_project (development
// activity monitor), under one dataset version of source com_open_data, then publish (AD-7).
//
//   node pipeline/ingest/com-buildings.mjs --pglite            in-memory dry run on the real files (no G-NAF there, so nothing is matched)
//   node --env-file=.env pipeline/ingest/com-buildings.mjs      load and publish into the database named by DATABASE_URL (needs gnaf published)
//   npm run pipeline:com                                        the same, as a script
//
// Files in data/raw/vic/city-of-melbourne (UTF-8 with a byte-order mark):
//   buildings-with-name-age-size-accessibility-and-bicycle-facilities.csv  one row per building per census year (2002 to 2024)
//   residential-dwellings.csv                                              one row per dwelling group per property per year; dwelling_number is the count
//   development-activity-monitor.csv                                       one row per development (1,451)
// A building is taken from the latest census year it appears in, and only buildings that appear in the newest census are kept (an
// earlier last-seen year means the building is gone, so its facts are not shown). Its dwelling count is the sum of dwelling_number in its
// latest year in the dwellings file, kept only when that year is the building's own census year (otherwise null).
//
// G-NAF match (AD-6: matching to outside records happens here, and the match type is stored in ref_com_building_match). Each City of
// Melbourne address is parsed into street number (or range) and street (the building-name prefix and the suburb, state and postcode are
// dropped) and compared with the G-NAF property-level addresses on the same street. A G-NAF building is matched only when it is unambiguous:
//   exact_street_number             one City of Melbourne building on the same street with the same number (or the same range), within 250 m
//   nearest_within_30m_same_street  no exact match, and exactly one City of Melbourne building on the same street within 30 m whose
//                                   number range contains the G-NAF number (G-NAF 628 inside City of Melbourne 614-644)
// Two candidates for one G-NAF building, a different street, a number outside the range, or nothing within reach is no match, and then no
// building fact is shown for that address. Nothing is guessed. Several G-NAF buildings may share one City of Melbourne record (one
// tower, several street numbers); no G-NAF building has more than one.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { parseDelimitedLine } from "../lib/csv.mjs";
import { newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { normName } from "../lib/normalise.mjs";
import { runPointCli } from "../lib/point-run.mjs";
import { ComBuildingRow, ComMatchRow, SupplyProjectRow } from "../lib/schemas.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, sqlCheck } from "../publish/publish.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_DIR = path.join(root, "data", "raw", "vic", "city-of-melbourne");
export const FILES = {
  buildings: "buildings-with-name-age-size-accessibility-and-bicycle-facilities.csv",
  dwellings: "residential-dwellings.csv",
  monitor: "development-activity-monitor.csv",
};
export const SOURCE_ID = "com_open_data";

/** A same-number match must be within this many metres (the same street number can recur in another suburb). */
export const EXACT_MAX_METRES = 250;
/** A nearest match must be within this many metres. */
export const NEAREST_MAX_METRES = 30;

const SUFFIX_WORD = { N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST", NE: "NORTH EAST", NW: "NORTH WEST", SE: "SOUTH EAST", SW: "SOUTH WEST", EX: "EXTENSION", CN: "CENTRAL", IN: "INNER", LR: "LOWER", UP: "UPPER", UR: "UPPER" };

const clean = (s) => String(s ?? "").trim();
const int = (v) => {
  const s = clean(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Call `fn(get)` for each data row of a CSV text, where get(name) is the trimmed cell. Rows have no embedded newlines in these files. */
function eachRow(text, required, fn, file) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = parseDelimitedLine(lines[0]).map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h, i]));
  // A column the loader reads must be in the header: a renamed column would otherwise read as blanks and load silently wrong.
  const missing = required.filter((c) => !index.has(c));
  if (missing.length > 0) throw new Error(`${file} has no ${missing.join(", ")} column: the file layout has changed, so nothing was loaded`);
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseDelimitedLine(lines[i]);
    n++;
    fn((name) => clean(cells[index.get(name)]), n);
  }
  return n;
}

export function haversineMetres(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((((lon2 - lon1) * Math.PI) / 180) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------- parsing

/**
 * Buildings: the latest row per property_id. Only properties seen in the newest census year are kept. Returns
 * { rows, total, max_year, stale, no_coordinates }.
 */
export function parseBuildings(text) {
  const latest = new Map();
  let total = 0;
  const columns = ["census_year", "property_id", "building_name", "street_address", "clue_small_area", "latitude", "longitude", "construction_year", "refurbished_year", "number_of_floors_above_ground", "predominant_space_use"];
  eachRow(text, columns, (get) => {
    total++;
    const year = int(get("census_year"));
    const id = get("property_id");
    if (!id || year === null) return;
    const cur = latest.get(id);
    if (cur && cur.census_year >= year) return;
    latest.set(id, {
      property_id: id,
      census_year: year,
      building_name: get("building_name") || null,
      street_address: get("street_address"),
      clue_small_area: get("clue_small_area") || null,
      lat: get("latitude") === "" ? null : Number(get("latitude")),
      lon: get("longitude") === "" ? null : Number(get("longitude")),
      construction_year: int(get("construction_year")),
      refurbished_year: int(get("refurbished_year")),
      floors_above: int(get("number_of_floors_above_ground")),
      predominant_use: get("predominant_space_use") || null,
    });
  }, FILES.buildings);
  const max_year = Math.max(0, ...[...latest.values()].map((r) => r.census_year));
  const all = [...latest.values()];
  const current = all.filter((r) => r.census_year === max_year);
  const rows = current.filter((r) => r.lat !== null && r.lon !== null && Number.isFinite(r.lat) && Number.isFinite(r.lon));
  return { rows, total, max_year, stale: all.length - current.length, no_coordinates: current.length - rows.length };
}

/** Dwellings: for each property, the sum of dwelling_number in the latest year it appears. Returns Map(property_id -> { year, count }). */
export function parseDwellings(text) {
  const byProperty = new Map();
  eachRow(text, ["property_id", "census_year", "dwelling_number"], (get) => {
    const id = get("property_id");
    const year = int(get("census_year"));
    const n = int(get("dwelling_number"));
    if (!id || year === null || n === null) return;
    const cur = byProperty.get(id);
    if (!cur || year > cur.year) byProperty.set(id, { year, count: n });
    else if (year === cur.year) cur.count += n;
  }, FILES.dwellings);
  return byProperty;
}

const STATUSES = new Set(["COMPLETED", "APPROVED", "UNDER CONSTRUCTION", "APPLIED"]);

/** The development activity monitor. Returns { rows, records, aside }. */
export function parseSupply(text) {
  const rows = [];
  const aside = { unknown_status: 0, no_coordinates: 0 };
  const columns = ["development_key", "status", "year_completed", "clue_small_area", "street_address", "floors_above", "resi_dwellings", "studio_dwe", "one_bdrm_dwe", "two_bdrm_dwe", "three_bdrm_dwe", "town_planning_application", "longitude", "latitude"];
  const records = eachRow(text, columns, (get) => {
    const status = get("status").toUpperCase();
    if (!STATUSES.has(status)) {
      aside.unknown_status++;
      return;
    }
    const lat = Number(get("latitude"));
    const lon = Number(get("longitude"));
    if (get("latitude") === "" || get("longitude") === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      aside.no_coordinates++;
      return;
    }
    rows.push({
      development_key: get("development_key"),
      status,
      year_completed: int(get("year_completed")),
      street_address: get("street_address"),
      clue_small_area: get("clue_small_area") || null,
      lat,
      lon,
      floors_above: int(get("floors_above")),
      resi_dwellings: int(get("resi_dwellings")) ?? 0,
      studio_dwellings: int(get("studio_dwe")) ?? 0,
      one_bed_dwellings: int(get("one_bdrm_dwe")) ?? 0,
      two_bed_dwellings: int(get("two_bdrm_dwe")) ?? 0,
      three_bed_dwellings: int(get("three_bdrm_dwe")) ?? 0,
      town_planning_application: get("town_planning_application") || null,
    });
  }, FILES.monitor);
  return { rows, records, aside };
}

// ---------------------------------------------------------------- matching to G-NAF buildings

const NUMBER = /^(\d+)([A-Za-z]?)(?:-(\d+)([A-Za-z]?))?$/;

/**
 * "614-644 Flinders Street DOCKLANDS VIC 3008", "Flinders Wharf Apartments 40-66 Siddeley Street DOCKLANDS VIC 3008",
 * "287-313 Macaulay Road, North Melbourne, 3051" -> { number_first: "614", number_last: "644", street: "FLINDERS STREET" }.
 * The suburb (upper case, or after a comma), state and postcode are dropped, and so is any building name before the number.
 * Returns null when no street number followed by a street can be read (a substation "Opposite 1 Barry Street" is read as number 1,
 * Barry Street; "Lot 63 Off Footscray Road" has no usable number and returns null).
 */
export function parseStreetAddress(address) {
  // The monitor writes "287-313 Macaulay Road, North Melbourne, 3051": a title-case suburb between commas, then the postcode.
  const monitorStyle = /^(.*?),\s*[^,\d]+,\s*\d{4}$/.exec(clean(address));
  let s = (monitorStyle ? monitorStyle[1] : clean(address)).replace(/,/g, " ");
  s = s.replace(/\s+\d{1,4}$/, "").replace(/\s+VIC$/i, "");
  const tokens = s.split(/\s+/).filter(Boolean);
  // The suburb is the trailing run of upper-case words ("NORTH MELBOURNE"); a street word is never all capitals here.
  while (tokens.length > 2 && /^[A-Z][A-Z'&-]*$/.test(tokens.at(-1)) && tokens.at(-1).length > 1) tokens.pop();
  // The street number is the last number-like token that has at least one word after it and no number-like token after it.
  let at = -1;
  for (let i = 0; i < tokens.length - 1; i++) if (NUMBER.test(tokens[i])) at = i;
  if (at < 0) return null;
  const m = NUMBER.exec(tokens[at]);
  const street = normName(tokens.slice(at + 1).join(" "));
  if (!street) return null;
  return {
    number_first: `${m[1]}${m[2].toUpperCase()}`,
    number_last: m[3] ? `${m[3]}${m[4].toUpperCase()}` : null,
    street,
  };
}

/** The same street key from G-NAF fields: name, type and the spelled-out suffix ("COLLINS" "STREET" "W" -> "COLLINS STREET WEST"). */
export function gnafStreetKey(g) {
  const suffix = g.street_suffix ? (SUFFIX_WORD[String(g.street_suffix).toUpperCase()] ?? String(g.street_suffix)) : "";
  return normName([g.street_name_norm ?? g.street_name, g.street_type, suffix].filter(Boolean).join(" "));
}

const numeric = (n) => (n === null || n === undefined ? null : Number.parseInt(String(n), 10));

/**
 * Pure. `coms` are City of Melbourne buildings ({ property_id, street_address, lat, lon }); `gnaf` are G-NAF property-level addresses
 * ({ gnaf_pid, number_first, number_last, street_name_norm, street_type, street_suffix, lat, lon }).
 * Returns Map(gnaf_pid -> { property_id, match_type }) for the unambiguous matches only, plus counts of what was left out.
 */
export function matchBuildings(coms, gnaf) {
  const byStreet = new Map();
  const stats = { unparsed_com_addresses: 0, no_candidate: 0, ambiguous: 0 };
  for (const c of coms) {
    const a = parseStreetAddress(c.street_address);
    if (!a) {
      stats.unparsed_com_addresses++;
      continue;
    }
    const first = numeric(a.number_first);
    const entry = { c, a, first, last: a.number_last ? numeric(a.number_last) : first };
    if (!byStreet.has(a.street)) byStreet.set(a.street, []);
    byStreet.get(a.street).push(entry);
  }

  const matches = new Map();
  for (const g of gnaf) {
    if (g.lat === null || g.lat === undefined || g.lon === null || g.lon === undefined || !g.number_first) continue;
    const onStreet = byStreet.get(gnafStreetKey(g));
    if (!onStreet) {
      stats.no_candidate++;
      continue;
    }
    const withDistance = onStreet.map((e) => ({ e, d: haversineMetres(e.c.lat, e.c.lon, g.lat, g.lon) }));
    const exact = withDistance.filter(
      ({ e, d }) => e.a.number_first === g.number_first && (e.a.number_last ?? e.a.number_first) === (g.number_last ?? g.number_first) && d <= EXACT_MAX_METRES,
    );
    if (exact.length > 0) {
      if (exact.length === 1) matches.set(g.gnaf_pid, { property_id: exact[0].e.c.property_id, match_type: "exact_street_number" });
      else stats.ambiguous++;
      continue;
    }
    const gFirst = numeric(g.number_first);
    const gLast = g.number_last ? numeric(g.number_last) : gFirst;
    const near = withDistance.filter(
      ({ e, d }) => d <= NEAREST_MAX_METRES && e.a.number_last !== null && gFirst !== null && gLast !== null && e.first !== null && gFirst >= e.first && gLast <= e.last,
    );
    if (near.length === 1) matches.set(g.gnaf_pid, { property_id: near[0].e.c.property_id, match_type: "nearest_within_30m_same_street" });
    else if (near.length > 1) stats.ambiguous++;
    else stats.no_candidate++;
  }
  return { matches, stats };
}

/** G-NAF property-level addresses inside a bounding box, through the current gnaf pointer. Empty when gnaf is not published. */
export async function readGnafCandidates(db, box) {
  const published = await db.query("SELECT 1 FROM src_dataset_current WHERE source_id = 'gnaf'");
  if (published.length === 0) return { published: false, rows: [] };
  const rows = await db.query(
    `SELECT a.gnaf_pid, a.number_first, a.number_last, a.street_name_norm, a.street_type, a.street_suffix, a.lat, a.lon
     FROM ref_address a
     JOIN src_dataset_current c ON c.source_id = 'gnaf' AND c.dataset_version_id = a.dataset_version_id
     WHERE a.is_property_level AND a.number_first IS NOT NULL
       AND a.lat BETWEEN $1 AND $2 AND a.lon BETWEEN $3 AND $4`,
    [box.min_lat, box.max_lat, box.min_lon, box.max_lon],
  );
  return { published: true, rows };
}

// ---------------------------------------------------------------- load

export class SchemaFailure extends Error {
  constructor(what, count, first) {
    super(`${count} ${what} row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

const BUILDING_COLUMNS = [
  { name: "property_id", type: "text" },
  { name: "building_name", type: "text" },
  { name: "street_address", type: "text" },
  { name: "clue_small_area", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
  { name: "construction_year", type: "integer" },
  { name: "refurbished_year", type: "integer" },
  { name: "floors_above", type: "integer" },
  { name: "predominant_use", type: "text" },
  { name: "dwelling_count", type: "integer" },
  { name: "census_year", type: "integer" },
];

const MATCH_COLUMNS = [
  { name: "gnaf_building_id", type: "text" },
  { name: "property_id", type: "text" },
  { name: "match_type", type: "text" },
];

const SUPPLY_COLUMNS = [
  { name: "development_key", type: "text" },
  { name: "status", type: "text" },
  { name: "year_completed", type: "integer" },
  { name: "street_address", type: "text" },
  { name: "clue_small_area", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
  { name: "floors_above", type: "integer" },
  { name: "resi_dwellings", type: "integer" },
  { name: "studio_dwellings", type: "integer" },
  { name: "one_bed_dwellings", type: "integer" },
  { name: "two_bed_dwellings", type: "integer" },
  { name: "three_bed_dwellings", type: "integer" },
  { name: "town_planning_application", type: "text" },
];

const pad = 0.003; // about 330 m of margin around the City of Melbourne buildings when asking G-NAF for candidates

/**
 * Parse, match, validate and insert under one new dataset version (status `loading`).
 * @param {any} db
 * @param {{ dir?: string, texts?: { buildings: string, dwellings: string, monitor: string }, as_of?: string, retrieved_at?: string, log?: (m: string) => void }} opts
 */
export async function loadComData(db, { dir = DEFAULT_DIR, texts, as_of, retrieved_at, log = () => {} } = {}) {
  const paths = Object.values(FILES).map((f) => path.join(dir, f));
  const t = texts ?? {
    buildings: await readFile(path.join(dir, FILES.buildings), "utf8"),
    dwellings: await readFile(path.join(dir, FILES.dwellings), "utf8"),
    monitor: await readFile(path.join(dir, FILES.monitor), "utf8"),
  };
  const parsed = parseBuildings(t.buildings);
  const dwellings = parseDwellings(t.dwellings);
  const supply = parseSupply(t.monitor);
  if (parsed.rows.length === 0) throw new Error("the buildings file has no building from its newest census with coordinates, so nothing was loaded");
  // A development key is the primary key: a repeat means the file is wrong, so it is rejected rather than silently dropped or overwritten.
  const seen = new Map();
  for (const r of supply.rows) seen.set(r.development_key, (seen.get(r.development_key) ?? 0) + 1);
  const repeated = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  if (repeated.length > 0) throw new Error(`${repeated.length} development key(s) appear more than once in the monitor (${repeated.slice(0, 5).join(", ")}), so nothing was loaded`);

  const box = {
    min_lat: Math.min(...parsed.rows.map((r) => r.lat)) - pad,
    max_lat: Math.max(...parsed.rows.map((r) => r.lat)) + pad,
    min_lon: Math.min(...parsed.rows.map((r) => r.lon)) - pad,
    max_lon: Math.max(...parsed.rows.map((r) => r.lon)) + pad,
  };
  const gnaf = await readGnafCandidates(db, box);
  const { matches, stats } = gnaf.published ? matchBuildings(parsed.rows, gnaf.rows) : { matches: new Map(), stats: null };
  log(
    gnaf.published
      ? `matched ${matches.size} of ${gnaf.rows.length} G-NAF addresses to a City of Melbourne building (left out: ${JSON.stringify(stats)})`
      : "gnaf is not published here, so no building is matched to a G-NAF address",
  );

  const buildings = [];
  const bad = [];
  for (const r of parsed.rows) {
    // The dwelling count is kept only when it is from the building's own census year (L11 labels it with that year). A count from another
    // year, or no dwellings row at all, is null, never zero.
    const dw = dwellings.get(r.property_id);
    const ok = ComBuildingRow.safeParse({ ...r, dwelling_count: dw && dw.year === r.census_year ? dw.count : null });
    if (ok.success) buildings.push(ok.data);
    else bad.push(`${r.property_id} ${r.street_address}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure("building", bad.length, bad.slice(0, 3));
  const matchRows = [];
  for (const [gnaf_building_id, m] of matches) {
    const ok = ComMatchRow.safeParse({ gnaf_building_id, ...m });
    if (ok.success) matchRows.push(ok.data);
    else bad.push(`${gnaf_building_id}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure("match", bad.length, bad.slice(0, 3));
  const projects = [];
  const badSupply = [];
  for (const r of supply.rows) {
    const ok = SupplyProjectRow.safeParse(r);
    if (ok.success) projects.push(ok.data);
    else badSupply.push(`${r.development_key} ${r.street_address}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (badSupply.length) throw new SchemaFailure("development", badSupply.length, badSupply.slice(0, 3));

  const stamp = retrieved_at ?? (texts ? new Date().toISOString() : await newestMtimeIso(paths));
  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: stamp,
    file_sha256: texts ? null : await sha256Of(paths),
    as_of: as_of ?? stamp.slice(0, 10),
    row_count: buildings.length + projects.length,
    states: ["VIC"],
  });
  try {
    const insertB = makeBatchInserter(db, "ref_com_building", BUILDING_COLUMNS, id);
    for (let i = 0; i < buildings.length; i += 3000) {
      await insertB(
        buildings.slice(i, i + 3000).map((r) => [
          r.property_id, r.building_name, r.street_address, r.clue_small_area, r.lat, r.lon, r.construction_year, r.refurbished_year,
          r.floors_above, r.predominant_use, r.dwelling_count, r.census_year,
        ]),
      );
    }
    const insertM = makeBatchInserter(db, "ref_com_building_match", MATCH_COLUMNS, id);
    for (let i = 0; i < matchRows.length; i += 5000) {
      await insertM(matchRows.slice(i, i + 5000).map((r) => [r.gnaf_building_id, r.property_id, r.match_type]));
    }
    const insertS = makeBatchInserter(db, "fact_supply_project", SUPPLY_COLUMNS, id);
    for (let i = 0; i < projects.length; i += 1000) {
      await insertS(
        projects.slice(i, i + 1000).map((r) => [
          r.development_key, r.status, r.year_completed, r.street_address, r.clue_small_area, r.lat, r.lon, r.floors_above, r.resi_dwellings,
          r.studio_dwellings, r.one_bed_dwellings, r.two_bed_dwellings, r.three_bed_dwellings, r.town_planning_application,
        ]),
      );
    }
    const byType = { exact_street_number: 0, nearest_within_30m_same_street: 0 };
    for (const m of matchRows) byType[m.match_type]++;
    log(`loaded ${await countRows(db, "ref_com_building", id)} buildings (census ${parsed.max_year}), ${await countRows(db, "ref_com_building_match", id)} G-NAF matches and ${await countRows(db, "fact_supply_project", id)} developments`);
    return {
      dataset_version_id: id,
      source_id: SOURCE_ID,
      rows: buildings.length + projects.length,
      files: [
        { file: FILES.buildings, records: parsed.total, matched: parsed.rows.length, unmatched: [] },
        { file: FILES.monitor, records: supply.records, matched: projects.length, unmatched: [] },
      ],
      as_of: as_of ?? stamp.slice(0, 10),
      buildings: buildings.length,
      developments: projects.length,
      census_year: parsed.max_year,
      matched: matchRows.length,
      matched_by_type: byType,
      gnaf_published: gnaf.published,
      left_out: { stale_buildings: parsed.stale, no_coordinates: parsed.no_coordinates, supply: supply.aside, match: stats },
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/** Real counts at 2026-11-14: 14,093 current buildings (census 2024) and 1,451 developments. */
export const comChecks = ({ minimumBuildings = 10_000, minimumProjects = 1_000, minimumMatches = 5_000 } = {}) => [
  sqlCheck(
    "ref_com_building and fact_supply_project together do not equal the declared row count",
    `SELECT (SELECT count(*) FROM ref_com_building WHERE dataset_version_id = $1) + (SELECT count(*) FROM fact_supply_project WHERE dataset_version_id = $1)
            = (SELECT row_count FROM src_dataset_version WHERE dataset_version_id = $1) AS ok`,
  ),
  minRows("ref_com_building", minimumBuildings),
  minRows("fact_supply_project", minimumProjects),
  // Both tables count in the declared total, so the shrink check compares the total.
  notMuchSmallerThanPrevious(0.8),
  // With G-NAF published the match must find a sensible number of buildings; without it (a dry run) nothing can be matched.
  sqlCheck(
    `fewer than ${minimumMatches} G-NAF buildings were matched to a City of Melbourne building although G-NAF is published`,
    `SELECT (NOT EXISTS (SELECT 1 FROM src_dataset_current WHERE source_id = 'gnaf')
            OR (SELECT count(*) FROM ref_com_building_match WHERE dataset_version_id = $1) >= ${minimumMatches}) AS ok`,
  ),
  sqlCheck(
    "fact_supply_project is missing a status or has a negative dwelling count",
    `SELECT ((SELECT count(DISTINCT status) FROM fact_supply_project WHERE dataset_version_id = $1) = 4
            AND NOT EXISTS (SELECT 1 FROM fact_supply_project WHERE dataset_version_id = $1 AND resi_dwellings < 0)) AS ok`,
  ),
];

/**
 * @param {any} db
 * @param {{ dir?: string, texts?: { buildings: string, dwellings: string, monitor: string }, as_of?: string, minimumBuildings?: number, minimumProjects?: number, minimumMatches?: number, log?: (m: string) => void }} [opts]
 */
export async function runComData(db, { dir, texts, as_of, minimumBuildings, minimumProjects, minimumMatches, log } = {}) {
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: comChecks({ minimumBuildings, minimumProjects, minimumMatches }),
    load: () => loadComData(db, { dir, texts, as_of, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli(async (db, { log }) => {
    const out = await runComData(db, { log });
    log(`  G-NAF buildings matched: ${out.matched} (${JSON.stringify(out.matched_by_type)}); left out: ${JSON.stringify(out.left_out)}`);
    return out;
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

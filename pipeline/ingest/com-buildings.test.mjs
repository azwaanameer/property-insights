import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { COM_AS_OF, COM_TEXTS, COM_TOWER } from "./fixtures/com.mjs";
import { FIXTURE_SALS } from "./fixtures/sals.mjs";
import { SchemaFailure, haversineMetres, matchBuildings, parseBuildings, parseDwellings, parseStreetAddress, parseSupply, runComData } from "./com-buildings.mjs";
import { loadGnaf, publishGnaf } from "./gnaf-load.mjs";
import { loadSuburbs } from "./suburbs-sal.mjs";
import { FIXTURE_DIR } from "../../src/server/testing/db";

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const GNAF_DOCKLANDS_628 = "GAVIC100000001";
const GNAF_MELBOURNE_628 = "GAVIC100000040";
const loadFixtureGnaf = async () => {
  await loadSuburbs(db, { sals: FIXTURE_SALS });
  await publishGnaf(db, await loadGnaf(db, { dir: FIXTURE_DIR, sals: FIXTURE_SALS }));
};
const run = (over = {}) => runComData(db, { texts: COM_TEXTS, as_of: COM_AS_OF, minimumBuildings: 20, minimumProjects: 20, minimumMatches: 1, ...over });
const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'com_open_data'"))[0]?.id ?? null;

describe("street addresses (the real shapes in the City of Melbourne files)", () => {
  it.each([
    ["614-644 Flinders Street DOCKLANDS VIC 3008", { number_first: "614", number_last: "644", street: "FLINDERS STREET" }],
    ["6 Wood Street NORTH MELBOURNE 3051", { number_first: "6", number_last: null, street: "WOOD STREET" }],
    ["Flinders Wharf Apartments 40-66 Siddeley Street DOCKLANDS VIC 3008", { number_first: "40", number_last: "66", street: "SIDDELEY STREET" }],
    ["84W Toorak Road SOUTH YARRA VIC 3141", { number_first: "84W", number_last: null, street: "TOORAK ROAD" }],
    ["287-313 Macaulay Road, North Melbourne, 3051", { number_first: "287", number_last: "313", street: "MACAULAY ROAD" }],
    ["250 St Kilda Road SOUTHBANK VIC 3006", { number_first: "250", number_last: null, street: "ST KILDA ROAD" }],
    ["Uni On A'Beckett Apartments 106-116 A'Beckett Street MELBOURNE VIC 3000", { number_first: "106", number_last: "116", street: "ABECKETT STREET" }],
  ])("%s", (address, want) => {
    expect(parseStreetAddress(address)).toEqual(want);
  });

  it("an address with no street number is not read, never guessed", () => {
    expect(parseStreetAddress("Birrarung Marr Batman Avenue MELBOURNE VIC 3000")).toBeNull();
    expect(parseStreetAddress("")).toBeNull();
  });
});

describe("parsing the three files", () => {
  it("buildings: one row per property from its latest census year, and a building not seen in the newest census is dropped", () => {
    const b = parseBuildings(COM_TEXTS.buildings);
    expect(b.max_year).toBe(2024);
    const ids = b.rows.map((r) => r.property_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.rows.every((r) => r.census_year === 2024)).toBe(true);
    // 2000001127 ("646-666 Flinders Street") was last seen in 2020; 692622 (the same address) is current.
    expect(ids).not.toContain("2000001127");
    expect(ids).toContain("692622");
    expect(b.stale).toBeGreaterThanOrEqual(1);
    const tower = b.rows.find((r) => r.property_id === COM_TOWER);
    expect(tower).toMatchObject({ construction_year: 2018, floors_above: 45, predominant_use: "Residential Apartment", street_address: "628 Flinders Street DOCKLANDS VIC 3008" });
  });

  it("dwellings: the sum of dwelling_number in the latest year, so a tower is its apartment count and a house is one", () => {
    const d = parseDwellings(COM_TEXTS.dwellings);
    expect(d.get(COM_TOWER)?.year).toBe(2024);
    expect(d.get(COM_TOWER)?.count).toBeGreaterThan(100);
    for (const v of d.values()) expect(v.count).toBeGreaterThan(0);
  });

  it("a dwellings count is kept only when its year is the building's own census year", async () => {
    await loadFixtureGnaf();
    // Drop the tower's 2024 dwellings rows: its latest dwellings year is then 2023, not its census year 2024.
    const lines = COM_TEXTS.dwellings.split(/\r?\n/);
    const idCol = lines[0].replace(/^\uFEFF/, "").split(",").indexOf("property_id");
    const yearCol = lines[0].replace(/^\uFEFF/, "").split(",").indexOf("census_year");
    const older = lines.filter((l, i) => i === 0 || !(l.split(",")[idCol] === COM_TOWER && l.split(",")[yearCol] === "2024")).join("\r\n");
    expect(parseDwellings(older).get(COM_TOWER)?.year).toBe(2023);
    const res = await run({ texts: { ...COM_TEXTS, dwellings: older } });
    const [b] = await db.query("SELECT dwelling_count, census_year FROM ref_com_building WHERE dataset_version_id = $1 AND property_id = $2", [res.dataset_version_id, COM_TOWER]);
    expect(b).toEqual({ dwelling_count: null, census_year: 2024 });
    // A building with a count from its own year keeps it.
    const [other] = await db.query("SELECT count(*)::int AS n FROM ref_com_building WHERE dataset_version_id = $1 AND dwelling_count IS NOT NULL", [res.dataset_version_id]);
    expect(other.n).toBeGreaterThan(0);
  });

  it("supply: every status is read, with the dwelling count and bedroom splits", () => {
    const s = parseSupply(COM_TEXTS.monitor);
    expect(new Set(s.rows.map((r) => r.status))).toEqual(new Set(["COMPLETED", "APPROVED", "UNDER CONSTRUCTION", "APPLIED"]));
    expect(s.rows.every((r) => r.resi_dwellings >= 0)).toBe(true);
    expect(s.aside).toEqual({ unknown_status: 0, no_coordinates: 0 });
    expect(s.records).toBe(s.rows.length);
  });
});

describe("matchBuildings (pure)", () => {
  const com = (property_id, street_address, lat = -37.82, lon = 144.95) => ({ property_id, street_address, lat, lon });
  const g = (gnaf_pid, number_first, street = "FLINDERS", extra = {}) => ({ gnaf_pid, number_first, number_last: null, street_name_norm: street, street_type: "STREET", street_suffix: null, lat: -37.82, lon: 144.95, ...extra });

  it("same street and number is an exact match; a number inside the range, within 30 m, is a nearest match", () => {
    const { matches } = matchBuildings([com("A", "12 Flinders Street DOCKLANDS VIC 3008"), com("B", "614-644 Flinders Street DOCKLANDS VIC 3008", -37.82, 144.96)], [g("G1", "12"), g("G2", "628", "FLINDERS", { lon: 144.96 })]);
    expect(matches.get("G1")).toEqual({ property_id: "A", match_type: "exact_street_number" });
    expect(matches.get("G2")).toEqual({ property_id: "B", match_type: "nearest_within_30m_same_street" });
  });

  it("no match: another street, a number outside the range, or too far away", () => {
    const { matches } = matchBuildings(
      [com("B", "614-644 Flinders Street DOCKLANDS VIC 3008")],
      [g("G1", "628", "COLLINS"), g("G2", "650"), g("G3", "628", "FLINDERS", { lat: -37.8205 }), g("G4", "12")],
    );
    expect([...matches.keys()]).toEqual([]);
  });

  it("the same street number in another suburb, beyond 250 m, is not an exact match", () => {
    const { matches } = matchBuildings([com("A", "628 Flinders Street DOCKLANDS VIC 3008", -37.823, 144.949)], [g("DOCK", "628", "FLINDERS", { lat: -37.823, lon: 144.949 }), g("MELB", "628", "FLINDERS", { lat: -37.818, lon: 144.956 })]);
    expect([...matches.keys()]).toEqual(["DOCK"]);
    expect(haversineMetres(-37.823, 144.949, -37.818, 144.956)).toBeGreaterThan(250);
  });

  it("two City of Melbourne buildings that both fit one address are ambiguous: no match", () => {
    const { matches, stats } = matchBuildings([com("A", "10-14 Flinders Street DOCKLANDS VIC 3008"), com("B", "12-16 Flinders Street DOCKLANDS VIC 3008")], [g("G1", "12")]);
    expect(matches.size).toBe(0);
    expect(stats.ambiguous).toBe(1);
    const dup = matchBuildings([com("A", "12 Flinders Street DOCKLANDS VIC 3008"), com("B", "12 Flinders Street DOCKLANDS VIC 3008")], [g("G1", "12")]);
    expect(dup.matches.size).toBe(0);
  });

  it("an exact match wins over a nearby range; several G-NAF numbers may share one range record, never the reverse", () => {
    const { matches } = matchBuildings(
      [com("RANGE", "10-20 Flinders Street DOCKLANDS VIC 3008"), com("ONE", "12 Flinders Street DOCKLANDS VIC 3008")],
      [g("G12", "12"), g("G14", "14"), g("G16", "16")],
    );
    expect(matches.get("G12")).toEqual({ property_id: "ONE", match_type: "exact_street_number" });
    // 14 and 16 are inside RANGE and inside nothing else.
    expect(matches.get("G14")).toEqual({ property_id: "RANGE", match_type: "nearest_within_30m_same_street" });
    expect(matches.get("G16")).toEqual({ property_id: "RANGE", match_type: "nearest_within_30m_same_street" });
  });

  it("a street suffix is part of the street: Collins Street West is not Collins Street", () => {
    const { matches } = matchBuildings([com("A", "5 Collins Street West MELBOURNE VIC 3000")], [g("PLAIN", "5", "COLLINS"), g("WEST", "5", "COLLINS", { street_suffix: "W" })]);
    expect([...matches.keys()]).toEqual(["WEST"]);
  });
});

describe("runComData", () => {
  it("with G-NAF published: matches the Docklands tower to its own building only, stores the match type and the facts, and flips the pointer", async () => {
    await loadFixtureGnaf();
    const res = await run();
    expect(await pointer()).toBe(res.dataset_version_id);
    expect(res.as_of).toBe(COM_AS_OF);
    expect(res.gnaf_published).toBe(true);
    const match = await db.query("SELECT gnaf_building_id, property_id, match_type FROM ref_com_building_match WHERE dataset_version_id = $1 ORDER BY gnaf_building_id", [res.dataset_version_id]);
    // The synthetic Docklands 628 matches; the other 628 Flinders Street (Melbourne, 800 m away) does not.
    expect(match.find((m) => m.gnaf_building_id === GNAF_DOCKLANDS_628)).toEqual({ gnaf_building_id: GNAF_DOCKLANDS_628, property_id: COM_TOWER, match_type: "exact_street_number" });
    expect(match.find((m) => m.gnaf_building_id === GNAF_MELBOURNE_628)).toBeUndefined();
    const [b] = await db.query("SELECT construction_year, floors_above, predominant_use, dwelling_count, census_year FROM ref_com_building WHERE dataset_version_id = $1 AND property_id = $2", [res.dataset_version_id, COM_TOWER]);
    expect(b).toMatchObject({ construction_year: 2018, floors_above: 45, predominant_use: "Residential Apartment", census_year: 2024 });
    expect(b.dwelling_count).toBeGreaterThan(100);
    expect((await db.query("SELECT count(*)::int AS n FROM fact_supply_project WHERE dataset_version_id = $1", [res.dataset_version_id]))[0].n).toBe(res.developments);
  });

  it("without G-NAF published nothing is matched, and the run still publishes (a dry run)", async () => {
    const res = await run({ minimumMatches: 1 });
    expect(res.gnaf_published).toBe(false);
    expect(res.matched).toBe(0);
  });

  it("G-NAF published but fewer matches than the minimum: the check fails, the old version stays live and the failed one holds no rows", async () => {
    await loadFixtureGnaf();
    const first = await run();
    const err = await run({ minimumMatches: 500 }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("matched to a City of Melbourne building");
    expect(await pointer()).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = 'com_open_data' AND status = 'failed'");
    expect(failed).toHaveLength(1);
    for (const t of ["ref_com_building", "ref_com_building_match", "fact_supply_project"]) {
      expect((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE dataset_version_id = $1`, [failed[0].id]))[0].n, t).toBe(0);
    }
  });

  it("too few buildings or developments, or a missing status, is refused", async () => {
    await expect(run({ minimumBuildings: 100_000 })).rejects.toBeInstanceOf(PublishCheckError);
    const noApplied = COM_TEXTS.monitor.split(/\r?\n/).filter((l, i) => i === 0 || !l.includes(",APPLIED,")).join("\r\n");
    const err = await run({ texts: { ...COM_TEXTS, monitor: noApplied } }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("missing a status");
  });

  it("an empty buildings file, a missing column and a repeated development key each stop the load with a clear message", async () => {
    const headerOnly = COM_TEXTS.buildings.split(/\r?\n/)[0];
    await expect(run({ texts: { ...COM_TEXTS, buildings: headerOnly } })).rejects.toThrow(/no building from its newest census with coordinates/);
    const renamed = COM_TEXTS.monitor.replace("resi_dwellings", "residential_dwellings");
    await expect(run({ texts: { ...COM_TEXTS, monitor: renamed } })).rejects.toThrow(/development-activity-monitor.csv has no resi_dwellings column/);
    const noLat = COM_TEXTS.buildings.replace(",latitude,", ",lat,");
    await expect(run({ texts: { ...COM_TEXTS, buildings: noLat } })).rejects.toThrow(/has no latitude column/);
    const lines = COM_TEXTS.monitor.split(/\r?\n/).filter(Boolean);
    const repeated = [...lines, lines[1]].join("\r\n");
    await expect(run({ texts: { ...COM_TEXTS, monitor: repeated } })).rejects.toThrow(/development key\(s\) appear more than once/);
    expect(await pointer()).toBeNull();
  });

  it("a development with a coordinate outside Victoria stops the load before anything is published", async () => {
    const lines = COM_TEXTS.monitor.split(/\r?\n/);
    const header = lines[0].split(",");
    const latCol = header.indexOf("latitude");
    const cells = lines[1].split(",");
    cells[latCol] = "-12.5";
    const text = [lines[0], cells.join(","), ...lines.slice(2)].join("\r\n");
    await expect(run({ texts: { ...COM_TEXTS, monitor: text } })).rejects.toBeInstanceOf(SchemaFailure);
    expect(await pointer()).toBeNull();
  });
});

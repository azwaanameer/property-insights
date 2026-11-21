import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { SCHOOL_AS_OF, SCHOOL_LOCATIONS_TEXT, SCHOOL_ZONE_TEXTS, editedZoneTexts } from "./fixtures/schools.mjs";
import { SchemaFailure, ZONES_SOURCE, buildZones, decodeLocations, loadZones, parseLocations, runSchoolZones, schoolKeyOf, yearLabel, zoneChecks } from "./school-zones.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const run = (over = {}) => runSchoolZones(db, { zoneTexts: SCHOOL_ZONE_TEXTS, locationsText: SCHOOL_LOCATIONS_TEXT, as_of: SCHOOL_AS_OF, minimumSchools: 10, minimumZones: 5, ...over });
const pointer = async (source) => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = $1", [source]))[0]?.id ?? null;

describe("locations (the real file is Windows-1252, not UTF-8)", () => {
  it("decodes a curly apostrophe in a school name, keeps only open schools, and keys government and non-government numbers apart", () => {
    const bytes = Buffer.from("Education_Sector,Entity_Type,School_No,School_Name,School_Type,School_Status,Address_Line_1,Address_Line_2,Address_Town,Address_State,Address_Postcode,X,Y\r\nCatholic,2,26,St Mary\x92s College Melbourne,Secondary,O,11 Westbury Street,,ST KILDA EAST,VIC,3183,144.997001,-37.859365\r\nGovernment,1,26,Belmont Primary School,Primary,O,51 Mt Pleasant Road,,BELMONT,VIC,3216,144.35,-38.17\r\nGovernment,1,99,Shut Primary School,Primary,C,1 A Street,,NOWHERE,VIC,3000,144.1,-37.1\r\nIndependent,2,1946,Victory Christian College,Pri/Sec,O,6 Kairn Road,,BALLARAT,VIC,3350,144.31,-36.78\r\nIndependent,2,1946,Victory Christian College,Pri/Sec,O,6 Kairn Road,,BALLARAT,VIC,3350,144.32,-36.68\r\n", "latin1");
    const parsed = parseLocations(decodeLocations(bytes));
    expect(parsed.rows.map((r) => [r.school_key, r.name])).toEqual([
      ["N26", "St Mary’s College Melbourne"],
      ["G26", "Belmont Primary School"],
      ["N1946", "Victory Christian College"],
      ["N1946-2", "Victory Christian College"],
    ]);
    expect(parsed.aside.not_open).toBe(1);
    expect(parsed.rows[0]).toMatchObject({ locality: "St Kilda East", sector: "Catholic" });
  });

  it("the committed excerpt of the real file has the Docklands schools, in all three sectors", () => {
    const rows = parseLocations(SCHOOL_LOCATIONS_TEXT).rows;
    expect(rows.find((r) => r.school_key === "G5573")).toMatchObject({ name: "Docklands Primary School", sector: "Government", school_type: "Primary" });
    expect(new Set(rows.map((r) => r.sector))).toEqual(new Set(["Government", "Catholic", "Independent"]));
  });
});

describe("zones", () => {
  it("school keys and year labels", () => {
    expect(schoolKeyOf(1074401)).toBe("G744");
    expect(schoolKeyOf(1840501)).toBe("G8405");
    expect(schoolKeyOf(12)).toBeNull();
    expect(yearLabel([7])).toBe("Year 7");
    expect(yearLabel([7, 8, 9])).toBe("Years 7 to 9");
    expect(yearLabel([7, 8, 9, 11])).toBe("Years 7 to 9, 11");
    expect(yearLabel([12, 11, 11])).toBe("Years 11 to 12");
  });

  it("joins each zone school to its location by key, keeps the name only when the key is missing, and merges year levels that share one polygon", () => {
    const keys = new Set(parseLocations(SCHOOL_LOCATIONS_TEXT).rows.map((r) => r.school_key));
    const { rows, bad } = buildZones(SCHOOL_ZONE_TEXTS, keys);
    expect(bad).toEqual([]);
    const by = Object.fromEntries(rows.map((r) => [r.zone_id, r]));
    expect(by.P1557301).toMatchObject({ school_name: "Docklands Primary School", school_key: "G5573", level: "primary", year_levels: "Prep to Year 6", boundary_year: 2026 });
    expect(by.P1176401).toMatchObject({ school_name: "Devenish Primary School", school_key: null });
    // University High's Year 7, 8 and 9 zones are one polygon, so one row; Years 10, 11 and 12 differ, so three more.
    expect(rows.filter((r) => r.school_name === "University High School").map((r) => r.year_levels)).toEqual(["Years 7 to 9", "Year 10", "Year 11", "Year 12"]);
    for (const r of rows) {
      expect(r.min_lat).toBeLessThan(r.max_lat);
      expect(r.min_lon).toBeLessThan(r.max_lon);
      for (const ring of r.rings) expect(ring[0]).toEqual(ring.at(-1));
    }
  });

  it("a feature that is not a polygon is reported, never guessed", () => {
    const texts = editedZoneTexts((member, obj) => {
      if (member === "Primary_Integrated_2026.geojson") obj.features[0].geometry.type = "MultiPolygon";
    });
    const { bad } = buildZones(texts, new Set());
    expect(bad[0]).toMatch(/MultiPolygon, not Polygon/);
  });
});

describe("runSchoolZones", () => {
  it("publishes two dataset versions, one per source, each with its own as_of, and joins zones to schools", async () => {
    const [locations, zones] = await run();
    expect(await pointer("vic_school_locations_2026")).toBe(locations.dataset_version_id);
    expect(await pointer("vic_school_zones_2026")).toBe(zones.dataset_version_id);
    expect(locations.dataset_version_id).not.toBe(zones.dataset_version_id);
    expect(locations.as_of).toBe(SCHOOL_AS_OF);
    expect(zones.as_of).toBe(SCHOOL_AS_OF);
    const joined = await db.query(
      `SELECT z.school_name, s.name, s.sector FROM ref_school_zone z
       JOIN ref_school s ON s.dataset_version_id = $1 AND s.school_key = z.school_key
       WHERE z.dataset_version_id = $2 ORDER BY z.zone_id`,
      [locations.dataset_version_id, zones.dataset_version_id],
    );
    expect(joined.map((r) => r.name)).toContain("Docklands Primary School");
    expect(joined.every((r) => r.sector === "Government")).toBe(true);
    const [rings] = await db.query("SELECT rings FROM ref_school_zone WHERE dataset_version_id = $1 AND zone_id = 'P1557301'", [zones.dataset_version_id]);
    expect(Array.isArray(rings.rings[0][0])).toBe(true);
  });

  it("a ring that does not close fails the check: PublishCheckError, the old zones stay live and the failed version holds no rows", async () => {
    const [, first] = await run();
    const bad = editedZoneTexts((member, obj) => {
      if (member === "Primary_Integrated_2026.geojson") obj.features[1].geometry.coordinates[0].pop();
    });
    const err = await run({ zoneTexts: bad }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("does not close");
    expect(await pointer("vic_school_zones_2026")).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = 'vic_school_zones_2026' AND status = 'failed'");
    expect(failed).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS n FROM ref_school_zone WHERE dataset_version_id = $1", [failed[0].id]))[0].n).toBe(0);
  });

  it("too few zones, a zone with a bounding box outside Victoria, or a missing level are refused", async () => {
    await expect(run({ minimumZones: 1000 })).rejects.toBeInstanceOf(PublishCheckError);
    const outside = editedZoneTexts((member, obj) => {
      if (member === "Primary_Integrated_2026.geojson") obj.features[0].geometry.coordinates[0] = obj.features[0].geometry.coordinates[0].map(([lon, lat]) => [lon + 20, lat]);
    });
    await expect(run({ zoneTexts: outside })).rejects.toThrow(/failed the schema/);
    const noSecondary = editedZoneTexts((member, obj) => {
      if (!member.startsWith("Primary")) obj.features = [];
    });
    const err = await run({ zoneTexts: noSecondary }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("missing primary zones or secondary zones");
  });

  it("a zone whose school key is not in the current locations dataset fails the check, so a partial refresh cannot leave dangling keys", async () => {
    const [locations] = await run();
    // The current locations lose Docklands Primary (a failed or partial refresh); the zones were built against the full list.
    await db.query("DELETE FROM ref_school WHERE dataset_version_id = $1 AND school_key = 'G5573'", [locations.dataset_version_id]);
    const keys = new Set(parseLocations(SCHOOL_LOCATIONS_TEXT).rows.map((r) => r.school_key));
    const err = await loadAndPublish(db, {
      source_id: ZONES_SOURCE,
      checks: zoneChecks(5),
      load: () => loadZones(db, { texts: SCHOOL_ZONE_TEXTS, schoolKeys: keys, as_of: SCHOOL_AS_OF }),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures.join(" ")).toContain("school key that is not in the current school locations dataset");
  });

  it("a bad schools row stops the load before anything is published", async () => {
    const text = SCHOOL_LOCATIONS_TEXT.replace(/(\d+\.\d+),(-3\d\.\d+)\r?\n/, "999,$2\n");
    await expect(run({ locationsText: text })).rejects.toBeInstanceOf(SchemaFailure);
    expect(await pointer("vic_school_locations_2026")).toBeNull();
  });
});

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { buildCensusMarkers, runCensus } from "./census-sal.mjs";
import {
  CARLTON, CENSUS_TEXTS, DOCKLANDS, MELBOURNE, NEIGHBOUR_TEXTS, SEIFA_FILE, SOUTHBANK, SUBURB_DATA_SALS,
  rentGrid, writeRentFixture, writeVgvFixtures,
} from "./fixtures/suburb-data.mjs";
import { buildNeighbours, releaseAsOf, runNeighbours } from "./locality-neighbours.mjs";
import { parseRentGrid, runHomesVicRents } from "./homes-vic-rents.mjs";
import { parseSeifa, runSeifa } from "./seifa-sal.mjs";
import { loadSuburbs } from "./suburbs-sal.mjs";
import { parseAnnual, parseQuarterly, runVgvMedians } from "./vgv-medians.mjs";

let db;
let close;
let tmp;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
  await loadSuburbs(db, { sals: SUBURB_DATA_SALS });
  tmp = await mkdtemp(path.join(os.tmpdir(), "suburb-data-test-"));
});
afterEach(() => close());

const pointer = async (source) =>
  (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = $1", [source]))[0]?.id ?? null;
const count = async (table, id) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [id]))[0].n;
const unmatchedOf = async (id) => db.query("SELECT file, source_name, reason, detail FROM src_dataset_unmatched WHERE dataset_version_id = $1 ORDER BY source_name, file", [id]);

describe("SAL matching of source names", () => {
  const index = buildSalIndex([
    { sal_code: "20100", raw_name: "Bellfield (Banyule - Vic.)" },
    { sal_code: "20101", raw_name: "Newtown (Greater Geelong - Vic.)" },
    { sal_code: "20102", raw_name: "Newtown (Hepburn - Vic.)" },
    { sal_code: "20103", raw_name: "Carlton (Vic.)" },
    { sal_code: "20104", raw_name: "Plain Place" },
  ]);
  it("tries the plain name first, then the NAME (COUNCIL) form the Valuer-General uses", () => {
    expect(index.matchSourceName("PLAIN PLACE")).toEqual({ sal_code: "20104", match_type: "exact" });
    expect(index.matchSourceName("CARLTON")).toEqual({ sal_code: "20103", match_type: "suffix_stripped" });
    expect(index.matchSourceName("BELLFIELD (BANYULE)")).toEqual({ sal_code: "20100", match_type: "qualified" });
    expect(index.matchSourceName("NEWTOWN (GREATER GEELONG)")).toEqual({ sal_code: "20101", match_type: "qualified" });
  });
  it("an ambiguous or unknown name is never guessed", () => {
    expect(index.matchSourceName("NEWTOWN")).toEqual({ sal_code: null, match_type: "ambiguous" });
    expect(index.matchSourceName("NEWTOWN (NOWHERE)")).toEqual({ sal_code: null, match_type: "none" });
    expect(index.matchSourceName("MOUNT NOWHERE").sal_code).toBeNull();
  });
});

describe("Valuer-General parsers (excerpts of the real files)", () => {
  it("annual: year columns, flags and the part-year Prelim column", async () => {
    const dir = await writeVgvFixtures(tmp);
    const a = await parseAnnual(path.join(dir, "units-by-suburb-2015-2025.xlsx"));
    expect(a.years).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    const dock = a.rows.find((r) => r.name === "DOCKLANDS");
    expect(dock.values.find((v) => v.year === 2025).median).toBe(585000);
    expect(dock.values.find((v) => v.year === 2015).median).toBe(645000);
    expect(dock.values).toHaveLength(11); // Prelim 2026 is not loaded
    const tl = a.rows.find((r) => r.name === "TAYLORS LAKES");
    expect(tl.values.find((v) => v.year === 2017).low_count).toBe(true); // "^"
    expect(tl.values.find((v) => v.year === 2018).median).toBe(7000);
    expect(a.rows.some((r) => r.name === "Locality")).toBe(false);
  });

  it("quarterly: five quarters, the sales count belongs to the latest quarter", async () => {
    const dir = await writeVgvFixtures(tmp);
    const q = await parseQuarterly(path.join(dir, "median-unit-march-quarter-2026.xls"));
    expect(q.quarters.map((x) => x.end)).toEqual(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]);
    const dock = q.rows.find((r) => r.name === "DOCKLANDS");
    expect(dock.values.map((v) => v.median)).toEqual([635000, 585000, 532500, 565000, 566500]);
    expect(dock.values.map((v) => v.sales_count)).toEqual([null, null, null, null, 144]);
    const tl = q.rows.find((r) => r.name === "TAYLORS LAKES");
    expect(tl.values.at(-1)).toMatchObject({ sales_count: 2, low_count: true });
  });
});

describe("loadVgvMedians + publish", () => {
  it("loads price rows keyed by SAL with the match type, lists unmatched and out-of-range rows, and flips the pointer", async () => {
    const dir = await writeVgvFixtures(tmp);
    const out = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await pointer("vgv_medians")).toBe(out.dataset_version_id);
    expect(out.as_of).toBe("2026-03-31");

    const [dock] = await db.query(
      `SELECT median_cents::float8 AS m, sales_count, low_count, source_name, sal_match_type FROM series_price
       WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND period_type = 'quarter' AND period = '2026-03-31'`,
      [out.dataset_version_id, DOCKLANDS],
    );
    expect(dock).toEqual({ m: 56_650_000, sales_count: 144, low_count: false, source_name: "DOCKLANDS", sal_match_type: "exact" });
    const [year] = await db.query(
      `SELECT median_cents::float8 AS m FROM series_price WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND period_type = 'year' AND period = '2025-12-31'`,
      [out.dataset_version_id, DOCKLANDS],
    );
    expect(year.m).toBe(58_500_000);
    const [carlton] = await db.query(`SELECT sal_match_type FROM series_price WHERE dataset_version_id = $1 AND sal_code = $2 LIMIT 1`, [out.dataset_version_id, CARLTON]);
    expect(carlton.sal_match_type).toBe("suffix_stripped");
    // Docklands has no house medians in the real files: no rows, not zeros.
    expect(await db.query(`SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'house'`, [out.dataset_version_id, DOCKLANDS])).toHaveLength(0);

    const un = await unmatchedOf(out.dataset_version_id);
    expect(un.filter((u) => u.source_name === "FISHERMANS BEND" && u.reason === "none").length).toBeGreaterThan(0);
    expect(un.find((u) => u.reason === "out_of_range")).toMatchObject({ source_name: "TAYLORS LAKES", detail: "unit 2018: $7000" });
    expect(await count("series_price", out.dataset_version_id)).toBe(out.rows);
    // The $7,000 unit median was set aside, not loaded.
    expect(await db.query(`SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND sal_code = '22474' AND dwelling_type = 'unit' AND period_type = 'year' AND period = '2018-12-31'`, [out.dataset_version_id])).toHaveLength(0);
  });

  it("re-running the same files makes a new version, flips the pointer, and keeps the old rows readable", async () => {
    const dir = await writeVgvFixtures(tmp);
    const first = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    const second = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(second.dataset_version_id).not.toBe(first.dataset_version_id);
    expect(await pointer("vgv_medians")).toBe(second.dataset_version_id);
    expect(await count("series_price", first.dataset_version_id)).toBe(first.rows);
    expect(await count("series_price", second.dataset_version_id)).toBe(first.rows);
    const statuses = await db.query("SELECT dataset_version_id::text AS id, status FROM src_dataset_version WHERE source_id = 'vgv_medians' ORDER BY dataset_version_id");
    expect(statuses.map((s) => s.status)).toEqual(["published", "published"]);
  });

  it("a failed check keeps the pointer on the old version and leaves no rows behind", async () => {
    const dir = await writeVgvFixtures(tmp);
    const first = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    await expect(runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 1_000_000 })).rejects.toBeInstanceOf(PublishCheckError);
    expect(await pointer("vgv_medians")).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = 'vgv_medians' AND status = 'failed'");
    expect(failed).toHaveLength(1);
    expect(await count("series_price", failed[0].id)).toBe(0);
    expect(await count("src_dataset_unmatched", failed[0].id)).toBe(0);
  });

  it("a name that appears twice in a file, or two names that land on one suburb, are listed and neither is loaded", async () => {
    const dir = await writeVgvFixtures(tmp, (name, grid) => {
      if (name === "unitsAnnual") {
        const dock = grid.find((r) => r[0] === "DOCKLANDS");
        grid.push([...dock]); // twice in one file
        const st = grid.find((r) => r[0] === "ST KILDA");
        grid.push(["ST. KILDA", ...st.slice(1)]); // two names, one suburb: the match key drops full stops
      }
      return grid;
    });
    const out = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    const un = await unmatchedOf(out.dataset_version_id);
    expect(un.filter((u) => u.reason === "duplicate_sal" && u.file === "units-by-suburb-2015-2025.xlsx").map((u) => u.source_name).sort()).toEqual(["DOCKLANDS", "ST KILDA", "ST. KILDA"]);
    const rows = await db.query(`SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND period_type = 'year'`, [out.dataset_version_id, DOCKLANDS]);
    expect(rows).toHaveLength(0); // the annual file lost it; the quarterly file still has it
  });
});

describe("Homes Victoria rents", () => {
  it("parses Count/Median pairs for each quarter from Jun 2015 and skips Group Total rows", () => {
    const parsed = parseRentGrid(rentGrid("2 bedroom flat"));
    expect(parsed.quarters[0]).toBe("2015-06-30");
    expect(parsed.quarters.at(-1)).toBe("2026-06-30");
    const dock = parsed.areas.find((a) => a.area === "Docklands");
    expect(dock.values.at(-1)).toEqual({ period: "2026-06-30", median: 800, count: 1471 });
    expect(dock.values.find((v) => v.period === "2025-06-30")).toEqual({ period: "2025-06-30", median: 750, count: 1520 });
    expect(parsed.areas.some((a) => a.area === "Group Total")).toBe(false);
    expect(() => parseRentGrid([[], ["x"], ["y"]])).toThrow(/no Count\/Median/);
  });

  it("loads rent rows by SAL, matches single-suburb areas only, and lists grouped areas as unmatched", async () => {
    const file = await writeRentFixture(path.join(tmp, "rents.xlsx"));
    const out = await runHomesVicRents(db, { file, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await pointer("homes_victoria_rents")).toBe(out.dataset_version_id);
    expect(out.as_of).toBe("2026-06-30");
    const [r] = await db.query(
      `SELECT median_weekly_rent_cents::float8 AS m, lettings_count, low_count, source_name, sal_match_type, dwelling_type, bedrooms FROM series_rent
       WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND bedrooms = 2 AND period = '2026-06-30'`,
      [out.dataset_version_id, DOCKLANDS],
    );
    expect(r).toEqual({ m: 80_000, lettings_count: 1471, low_count: false, source_name: "Docklands", sal_match_type: "exact", dwelling_type: "unit", bedrooms: 2 });
    const [stk] = await db.query(`SELECT sal_match_type FROM series_rent WHERE dataset_version_id = $1 AND sal_code = '22343' LIMIT 1`, [out.dataset_version_id]);
    expect(stk.sal_match_type).toBe("suffix_stripped");
    const un = await unmatchedOf(out.dataset_version_id);
    const names = new Set(un.map((u) => u.source_name));
    expect(names.has("Carlton-Parkville")).toBe(true); // a group of suburbs
    expect(names.has("Frankston")).toBe(true); // a real suburb not in the fixture list
    expect(names.has("Docklands")).toBe(false);
    // "All properties" is stored as dwelling_type all, 0 bedrooms.
    const [all] = await db.query(`SELECT bedrooms, dwelling_type FROM series_rent WHERE dataset_version_id = $1 AND dwelling_type = 'all' LIMIT 1`, [out.dataset_version_id]);
    expect(all).toEqual({ bedrooms: 0, dwelling_type: "all" });
  });

  it("flags fewer than 10 lettings as low_count and keeps the figure", async () => {
    const file = await writeRentFixture(path.join(tmp, "rents.xlsx"), (sheet, grid) => {
      if (sheet === "2 bedroom flat") {
        const row = grid.find((r) => r[1] === "Docklands");
        row[row.length - 2] = 7; // Jun 2026 count
      }
      return grid;
    });
    const out = await runHomesVicRents(db, { file, sals: SUBURB_DATA_SALS, minimum: 10 });
    const [r] = await db.query(`SELECT lettings_count, low_count FROM series_rent WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND bedrooms = 2 AND period = '2026-06-30'`, [out.dataset_version_id, DOCKLANDS]);
    expect(r).toEqual({ lettings_count: 7, low_count: true });
  });

  it("a rent outside $20 to $20,000 a week is set aside, not loaded", async () => {
    const file = await writeRentFixture(path.join(tmp, "rents.xlsx"), (sheet, grid) => {
      if (sheet === "2 bedroom flat") {
        const row = grid.find((r) => r[1] === "Southbank");
        row[row.length - 1] = 99_999; // Jun 2026 median (synthetic test value)
      }
      return grid;
    });
    const out = await runHomesVicRents(db, { file, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await db.query(`SELECT 1 FROM series_rent WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND bedrooms = 2 AND period = '2026-06-30'`, [out.dataset_version_id, SOUTHBANK])).toHaveLength(0);
    expect((await unmatchedOf(out.dataset_version_id)).find((u) => u.reason === "out_of_range")).toMatchObject({ source_name: "Southbank" });
  });
});

describe("Census 2021 markers", () => {
  it("builds shares as fractions and money as cents from real Docklands rows", () => {
    const { rows } = buildCensusMarkers(CENSUS_TEXTS);
    const dock = Object.fromEntries(rows.filter((r) => r.sal_code === DOCKLANDS).map((r) => [r.marker_key, r.value]));
    expect(dock.population).toBe(15495);
    expect(dock.dwellings).toBe(9965);
    expect(dock.owner_share).toBeCloseTo((930 + 1359) / (930 + 1359 + 5059), 6);
    expect(dock.flat_share).toBeCloseTo(7376 / 7540, 6);
    expect(dock.unoccupied_share).toBeCloseTo(2425 / 9965, 6);
    expect(dock.median_age).toBe(32);
    expect(dock.median_household_income_weekly_cents).toBe(195_700);
    expect(dock.median_rent_weekly_cents).toBe(41_100);
  });

  it("a share above 1 (ABS noise in a tiny suburb) is set aside, not clamped; a zero median is left out", () => {
    const texts = {
      G01: "SAL_CODE_2021,Tot_P_P\nSAL29001,5\n",
      G02: "SAL_CODE_2021,Median_age_persons,Median_mortgage_repay_monthly,Median_rent_weekly,Median_tot_hhd_inc_weekly\nSAL29001,0,0,0,0\n",
      G36: "SAL_CODE_2021,Unoccupied_PDs_Dwgs,Total_PDs_Dwellings\nSAL29001,5,4\n",
      G37: "SAL_CODE_2021,O_OR_Total,O_MTG_Total,R_Tot_Total,Total_DS_Flat_apart,Total_Total\nSAL29001,0,0,0,0,0\n",
    };
    const { rows, out_of_range } = buildCensusMarkers(texts);
    expect(out_of_range).toEqual([{ sal_code: "29001", marker_key: "unoccupied_share", value: 1.25 }]);
    expect(rows.map((r) => r.marker_key).sort()).toEqual(["dwellings", "population"]);
  });

  it("loads markers by SAL code (match type is the code itself) and lists codes missing from the suburb list", async () => {
    const texts = { ...CENSUS_TEXTS, G01: `${CENSUS_TEXTS.G01}SAL29399,3\n` };
    const out = await runCensus(db, { texts, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await pointer("abs_census_2021")).toBe(out.dataset_version_id);
    expect(out.as_of).toBe("2021-08-10");
    expect((await unmatchedOf(out.dataset_version_id)).find((u) => u.source_name === "29399")).toMatchObject({ reason: "not_in_suburb_list" });
    expect(await count("fact_suburb_marker", out.dataset_version_id)).toBe(out.rows);
  });
});

describe("SEIFA 2021 markers", () => {
  it("keeps IRSAD and IRSD scores and deciles for Victorian codes only", async () => {
    const rows = await parseSeifa(SEIFA_FILE);
    const dock = Object.fromEntries(rows.filter((r) => r.sal_code === DOCKLANDS).map((r) => [r.marker_key, r.value]));
    expect(dock).toEqual({ seifa_irsad: 1109, seifa_irsad_decile: 10, seifa_irsd: 1044, seifa_irsd_decile: 7 });
    expect(rows.some((r) => r.sal_code === "10042")).toBe(false); // New South Wales
    expect(new Set(rows.map((r) => r.marker_key))).toEqual(new Set(["seifa_irsad", "seifa_irsad_decile", "seifa_irsd", "seifa_irsd_decile"]));
  });

  it("loads and publishes, as_of the Census night", async () => {
    const out = await runSeifa(db, { file: SEIFA_FILE, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await pointer("abs_seifa_2021")).toBe(out.dataset_version_id);
    expect(out.as_of).toBe("2021-08-10");
    expect(await count("fact_suburb_marker", out.dataset_version_id)).toBe(out.rows);
  });
});

describe("G-NAF locality neighbours", () => {
  it("builds both directions from real adjacency, matched to SAL with the match types", () => {
    const built = buildNeighbours({ ...NEIGHBOUR_TEXTS, sals: SUBURB_DATA_SALS });
    const of = (sal) => built.rows.filter((r) => r.sal_code === sal).map((r) => r.neighbour_sal_code).sort();
    // Real G-NAF: Docklands touches Melbourne, Port Melbourne, South Melbourne, South Wharf, Southbank and West Melbourne.
    expect(of(DOCKLANDS)).toEqual(["21640", "22107", "22310", "22313", "22315", "22757"]);
    expect(of(SOUTHBANK)).toContain(DOCKLANDS);
    expect(built.rows.find((r) => r.sal_code === CARLTON && r.neighbour_sal_code === MELBOURNE)).toMatchObject({ sal_match_type: "suffix_stripped", neighbour_match_type: "exact" });
    // Carlton North and Fitzroy are real localities but not in the fixture suburb list: listed, and their pairs dropped.
    expect(built.unmatched.map((u) => u.source_name)).toEqual(expect.arrayContaining(["CARLTON NORTH", "FITZROY"]));
    expect(built.rows.every((r) => r.sal_code !== r.neighbour_sal_code)).toBe(true);
    expect(built.dropped_pairs).toBeGreaterThan(0);
  });

  it("retired rows, ambiguous names and localities outside Victoria are dropped and listed", () => {
    const localityText = [
      "LOCALITY_PID|DATE_CREATED|DATE_RETIRED|LOCALITY_NAME|PRIMARY_POSTCODE|LOCALITY_CLASS_CODE|STATE_PID|GNAF_LOCALITY_PID|GNAF_RELIABILITY_CODE",
      "locA|2021-07-06||DOCKLANDS||G|2|1|5",
      "locB|2021-07-06||SOUTHBANK||G|2|2|5",
      "locC|2021-07-06||FAKEVILLE||G|2|3|5",
      "locD|2021-07-06|2024-01-01|MELBOURNE||G|2|4|5",
    ].join("\n");
    const neighbourText = [
      "LOCALITY_NEIGHBOUR_PID|DATE_CREATED|DATE_RETIRED|LOCALITY_PID|NEIGHBOUR_LOCALITY_PID",
      "1|2021-07-09||locA|locB",
      "2|2021-07-09||locA|locC", // Fakeville is ambiguous in the suburb list
      "3|2021-07-09||locA|locZ", // not in the Victorian locality table (synthetic row)
      "4|2021-07-09|2024-01-01|locA|locD", // retired pair
    ].join("\n");
    const built = buildNeighbours({ localityText, neighbourText, sals: SUBURB_DATA_SALS });
    expect(built.rows.map((r) => `${r.sal_code}>${r.neighbour_sal_code}`).sort()).toEqual([`${DOCKLANDS}>${SOUTHBANK}`, `${SOUTHBANK}>${DOCKLANDS}`].sort());
    expect(built.unmatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_name: "FAKEVILLE", reason: "ambiguous" }),
        expect.objectContaining({ source_name: "locZ", reason: "outside_vic" }),
      ]),
    );
    expect(built.dropped_pairs).toBe(2);
    expect(built.pairs).toBe(3); // the retired pair is not counted
  });

  it("loads, publishes with the release as_of, and stores symmetric pairs", async () => {
    const out = await runNeighbours(db, { texts: NEIGHBOUR_TEXTS, sals: SUBURB_DATA_SALS, as_of: "2026-08-31", minimum: 10 });
    expect(await pointer("gnaf_neighbours")).toBe(out.dataset_version_id);
    expect(out.as_of).toBe("2026-08-31");
    expect(await count("ref_suburb_neighbour", out.dataset_version_id)).toBe(out.rows);
    // The gnaf address dataset is a different source and is not touched.
    expect(await pointer("gnaf")).toBeNull();
  });

  it("reads the G-NAF release month from the zip name", () => {
    expect(releaseAsOf("data/raw/national/gnaf/g-naf_aug26_allstates_gda2020_psv_110.zip")).toBe("2026-08-31");
    expect(() => releaseAsOf("something.zip")).toThrow(/release month/);
  });
});

describe("migration 0004 table shapes", () => {
  it("series_price keys on period type, so a year and a quarter ending the same day do not collide", async () => {
    const [v] = await db.query("INSERT INTO src_dataset_version (source_id, retrieved_at, licence_snapshot, as_of) VALUES ('vgv_medians', now(), 'CC BY 4.0', '2026-03-31') RETURNING dataset_version_id::text AS id");
    const ins = (type) => db.query(`INSERT INTO series_price (dataset_version_id, sal_code, dwelling_type, period_type, period, median_cents) VALUES ($1, '20766', 'unit', $2, '2025-12-31', 1)`, [v.id, type]);
    await ins("year");
    await ins("quarter");
    await expect(ins("year")).rejects.toThrow();
  });
});

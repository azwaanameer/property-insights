// Carried-forward cells, failed publish checks on every source, and one violating case per publish-check family.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { createDatasetVersion } from "../lib/dataset.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError, publish } from "../publish/publish.mjs";
import { censusChecks, runCensus } from "./census-sal.mjs";
import { CENSUS_TEXTS, DOCKLANDS, NEIGHBOUR_TEXTS, SEIFA_FILE, SOUTHBANK, SUBURB_DATA_SALS, writeRentFixture, writeVgvFixtures } from "./fixtures/suburb-data.mjs";
import { runHomesVicRents } from "./homes-vic-rents.mjs";
import { neighbourChecks, runNeighbours } from "./locality-neighbours.mjs";
import { runSeifa, seifaChecks } from "./seifa-sal.mjs";
import { loadSuburbs } from "./suburbs-sal.mjs";
import { runVgvMedians, vgvChecks } from "./vgv-medians.mjs";

let db;
let close;
let tmp;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
  await loadSuburbs(db, { sals: SUBURB_DATA_SALS });
  tmp = await mkdtemp(path.join(os.tmpdir(), "suburb-data-checks-"));
});
afterEach(() => close());

const pointer = async (source) =>
  (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = $1", [source]))[0]?.id ?? null;
const count = async (table, id) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [id]))[0].n;

describe("a '*' cell (no sales, an earlier median carried forward)", () => {
  it("is stored as carried_forward, for the quarterly and the annual file", async () => {
    const dir = await writeVgvFixtures(tmp, (name, grid) => {
      const dock = grid.find((r) => r[0] === "DOCKLANDS");
      if (name === "unitsQ") dock[10] = "*"; // flag cell after the Jan-Mar 2026 median
      if (name === "unitsAnnual") dock[22] = "*"; // flag cell after the 2025 median (year columns start at 1, each followed by a flag)
      return grid;
    });
    const out = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    const rows = await db.query(
      `SELECT period_type, to_char(period, 'YYYY-MM-DD') AS period FROM series_price
       WHERE dataset_version_id = $1 AND sal_code = $2 AND dwelling_type = 'unit' AND carried_forward ORDER BY period_type`,
      [out.dataset_version_id, DOCKLANDS],
    );
    expect(rows).toEqual([
      { period_type: "quarter", period: "2026-03-31" },
      { period_type: "year", period: "2025-12-31" },
    ]);
    expect(await db.query("SELECT 1 FROM series_price WHERE dataset_version_id = $1 AND carried_forward AND sal_code <> $2", [out.dataset_version_id, DOCKLANDS])).toHaveLength(0);
  });
});

describe("runbook rollback statement", () => {
  const ROLLBACK = (source) =>
    `UPDATE src_dataset_current c SET dataset_version_id = (SELECT v.dataset_version_id FROM src_dataset_version v WHERE v.source_id = c.source_id AND v.status = 'published' AND v.dataset_version_id < c.dataset_version_id ORDER BY v.dataset_version_id DESC LIMIT 1), published_at = now() WHERE c.source_id = '${source}'`;
  it("points the source back at the previous published version, and refuses when there is none", async () => {
    const dir = await writeVgvFixtures(tmp);
    const first = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    await expect(db.query(ROLLBACK("vgv_medians"))).rejects.toThrow(); // no earlier version: nothing changes
    expect(await pointer("vgv_medians")).toBe(first.dataset_version_id);
    const second = await runVgvMedians(db, { dir, sals: SUBURB_DATA_SALS, minimum: 10 });
    expect(await pointer("vgv_medians")).toBe(second.dataset_version_id);
    await db.query(ROLLBACK("vgv_medians"));
    expect(await pointer("vgv_medians")).toBe(first.dataset_version_id);
  });
});

describe("a failed publish check on each source keeps the pointer and leaves no rows", () => {
  const runs = {
    rents: { table: "series_rent", source: "homes_victoria_rents", run: async (min) => runHomesVicRents(db, { file: await writeRentFixture(path.join(tmp, "rents.xlsx")), sals: SUBURB_DATA_SALS, minimum: min }) },
    census: { table: "fact_suburb_marker", source: "abs_census_2021", run: async (min) => runCensus(db, { texts: CENSUS_TEXTS, sals: SUBURB_DATA_SALS, minimum: min }) },
    seifa: { table: "fact_suburb_marker", source: "abs_seifa_2021", run: async (min) => runSeifa(db, { file: SEIFA_FILE, sals: SUBURB_DATA_SALS, minimum: min }) },
    neighbours: { table: "ref_suburb_neighbour", source: "gnaf_neighbours", run: async (min) => runNeighbours(db, { texts: NEIGHBOUR_TEXTS, sals: SUBURB_DATA_SALS, as_of: "2026-08-31", minimum: min }) },
  };
  it.each(Object.keys(runs))("%s", async (name) => {
    const { table, source, run } = runs[name];
    const good = await run(10);
    expect(await pointer(source)).toBe(good.dataset_version_id);
    await expect(run(1_000_000)).rejects.toBeInstanceOf(PublishCheckError);
    expect(await pointer(source)).toBe(good.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = $1 AND status = 'failed'", [source]);
    expect(failed).toHaveLength(1);
    expect(await count(table, failed[0].id)).toBe(0);
    expect(await count("src_dataset_unmatched", failed[0].id)).toBe(0);
    // Only the good version's rows are in the table for this source.
    const others = await db.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id <> $1 AND dataset_version_id IN (SELECT dataset_version_id FROM src_dataset_version WHERE source_id = $2)`,
      [good.dataset_version_id, source],
    );
    expect(others[0].n).toBe(0);
  });
});

describe("each publish-check family fails on a violating row", () => {
  // Loads a good version, then a loading version holding the violating rows, and publishes it with the real checks.
  async function violate({ source, good, checks, insert, rows = 1 }) {
    const first = await good();
    const id = await createDatasetVersion(db, { source_id: source, retrieved_at: new Date().toISOString(), file_sha256: null, as_of: "2026-06-30", row_count: rows, states: ["VIC"] });
    await insert(id);
    let error;
    try {
      await publish(db, { source_id: source, dataset_version_id: id, checks });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PublishCheckError);
    expect(await pointer(source)).toBe(first.dataset_version_id);
    return error.failures;
  }
  const marker = (id, sal, key, value) =>
    db.query("INSERT INTO fact_suburb_marker (dataset_version_id, sal_code, marker_key, value) VALUES ($1, $2, $3, $4)", [id, sal, key, value]);

  it("a Census share above 1", async () => {
    const failures = await violate({
      source: "abs_census_2021",
      good: () => runCensus(db, { texts: CENSUS_TEXTS, sals: SUBURB_DATA_SALS, minimum: 10 }),
      checks: censusChecks(1),
      insert: (id) => marker(id, DOCKLANDS, "owner_share", 1.5),
    });
    expect(failures).toContain("fact_suburb_marker has a share outside 0 to 1, a negative count, or an implausible median age");
  });

  it("a SEIFA decile of 11", async () => {
    const failures = await violate({
      source: "abs_seifa_2021",
      good: () => runSeifa(db, { file: SEIFA_FILE, sals: SUBURB_DATA_SALS, minimum: 10 }),
      checks: seifaChecks(1),
      insert: (id) => marker(id, DOCKLANDS, "seifa_irsad_decile", 11),
    });
    expect(failures).toContain("fact_suburb_marker has a SEIFA decile outside 1 to 10 or a score outside 200 to 1,400");
  });

  it("a one-way neighbour pair", async () => {
    const failures = await violate({
      source: "gnaf_neighbours",
      good: () => runNeighbours(db, { texts: NEIGHBOUR_TEXTS, sals: SUBURB_DATA_SALS, as_of: "2026-08-31", minimum: 10 }),
      checks: neighbourChecks(1),
      insert: (id) =>
        db.query("INSERT INTO ref_suburb_neighbour (dataset_version_id, sal_code, neighbour_sal_code, sal_match_type, neighbour_match_type) VALUES ($1, $2, $3, 'exact', 'exact')", [id, DOCKLANDS, SOUTHBANK]),
    });
    expect(failures).toContain("ref_suburb_neighbour has a suburb next to itself or a one-way pair");
  });

  const price = (id, sal, dwelling) =>
    db.query("INSERT INTO series_price (dataset_version_id, sal_code, dwelling_type, period_type, period, median_cents) VALUES ($1, $2, $3, 'year', '2025-12-31', 50000000)", [id, sal, dwelling]);
  const goodVgv = async () => runVgvMedians(db, { dir: await writeVgvFixtures(tmp), sals: SUBURB_DATA_SALS, minimum: 10 });

  it("a SAL code absent from ref_suburb", async () => {
    const failures = await violate({
      source: "vgv_medians",
      good: goodVgv,
      checks: vgvChecks(1),
      rows: 2,
      insert: async (id) => {
        await price(id, "29999", "unit");
        await price(id, "29999", "house"); // both kinds present, so the house-rows check cannot be the one that fails
      },
    });
    expect(failures).toContain("series_price.sal_code has codes that are not in the published suburb list");
  });

  it("no house rows", async () => {
    const failures = await violate({
      source: "vgv_medians",
      good: goodVgv,
      checks: vgvChecks(1),
      insert: (id) => price(id, DOCKLANDS, "unit"),
    });
    expect(failures).toContain("series_price has no unit rows or no house rows");
  });
});

// End to end on the REAL files in data/raw: all five suburb loaders into one in-process PGlite database (suburbs first), then the
// four layers for a Docklands unit, spot-checked against the research files data/suburb_context.json and data/vgv_unit_growth.json.
// Skipped when data/raw is absent (it is gitignored). Prints the counts and unmatched names that the implementation notes record.
// The G-NAF address load (4 million rows) is not repeated here: the address is built by hand with the real Docklands SAL code.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { ANONYMOUS } from "../../src/server/contracts/address";
import { assembleReport } from "../../src/server/services/assemble-report";
import { openPglite } from "../lib/db.mjs";
import { runCensus, DEFAULT_ZIP as CENSUS_ZIP } from "./census-sal.mjs";
import { runHomesVicRents, DEFAULT_FILE as RENT_FILE } from "./homes-vic-rents.mjs";
import { runNeighbours, DEFAULT_ZIP as GNAF_ZIP } from "./locality-neighbours.mjs";
import { runSeifa, DEFAULT_FILE as SEIFA_FILE } from "./seifa-sal.mjs";
import { DEFAULT_XLSX, loadSuburbs, readVicSals } from "./suburbs-sal.mjs";
import { runVgvMedians, DEFAULT_DIR as VGV_DIR } from "./vgv-medians.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const have = [DEFAULT_XLSX, RENT_FILE, SEIFA_FILE, CENSUS_ZIP, GNAF_ZIP, path.join(VGV_DIR, "units-by-suburb-2015-2025.xlsx")].every(existsSync)
  && existsSync(path.join(root, "data", "suburb_context.json"));

describe.skipIf(!have)("real files into PGlite", () => {
  let db;
  let close;
  const summaries = {};
  let layers;
  beforeAll(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    const sals = await readVicSals();
    await loadSuburbs(db, { sals, minimum: 2500 });
    summaries.vgv = await runVgvMedians(db, { sals });
    summaries.rents = await runHomesVicRents(db, { sals });
    summaries.census = await runCensus(db, { sals });
    summaries.seifa = await runSeifa(db, { sals });
    summaries.neighbours = await runNeighbours(db, { sals });

    const docklands = sals.find((s) => s.name === "Docklands");
    const address = {
      gnaf_pid: "GAVIC000000000", building_id: "GAVIC000000001", sal_code: docklands.sal_code, sal_name: "Docklands", sal_match_type: "exact",
      state: "VIC", match: "unit", unit_requested: null, is_multi_unit: true, tier: "A", display_address: "310/628 Flinders Street, Docklands VIC 3008",
      unit_number: "310", flat_type: "UNIT", level_number: null, building_name: null, street_number: "628", street: "Flinders Street", locality: "Docklands",
      postcode: "3008", lat: -37.823, lon: 144.949, gnaf_as_of: "2026-08-31", suburb_as_of: "2021-07-01",
    };
    const report = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "real" });
    layers = Object.fromEntries(report.layers.map((l) => [l.layer_id, l]));
  }, 600_000);
  afterAll(() => close?.());

  it("loads every dataset and prints what the notes record", async () => {
    const lines = [];
    for (const [name, s] of Object.entries(summaries)) {
      const distinct = new Map();
      for (const f of s.files) for (const u of f.unmatched) distinct.set(`${u.source_name}|${u.reason}|${u.reason === "out_of_range" ? u.detail : ""}`, u);
      const byReason = {};
      for (const u of distinct.values()) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1;
      lines.push(`${name}: version ${s.dataset_version_id}, ${s.rows} rows, as_of ${s.as_of}, set aside (distinct) ${JSON.stringify(byReason)}`);
      lines.push(`  files: ${s.files.map((f) => `${f.file}=${f.matched}/${f.records}`).join("; ")}`);
      if (name !== "neighbours") lines.push(`  set-aside names: ${[...distinct.values()].map((u) => `${u.source_name}${u.reason === "out_of_range" ? ` [${u.detail}]` : ""}`).join(", ")}`);
    }
    console.log(`\n${lines.join("\n")}\n`);
    for (const s of Object.values(summaries)) expect(s.rows).toBeGreaterThan(5000);
  });

  it("L01, L02, L03, L07 and L09 are ok for a Docklands unit, each figure with a chip, source ids and as_of", () => {
    for (const id of ["L01-property", "L02-rent", "L03-price", "L07-history", "L09-suburb-compare"]) {
      expect(layers[id].status, `${id}: ${layers[id].message ?? ""}`).toBe("ok");
      for (const f of layers[id].figures) {
        expect(f.chip).toBeTruthy();
        expect(f.source_ids.length).toBeGreaterThan(0);
        expect(f.as_of, `${id} ${f.key}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("matches data/suburb_context.json: Docklands 2-bedroom flat $800 a week, 1,471 lettings, $750 a year ago", () => {
    const ctx = JSON.parse(readFileSync(path.join(root, "data", "suburb_context.json"), "utf8")).dffh.Docklands;
    const f = Object.fromEntries(layers["L02-rent"].figures.map((x) => [x.key, x]));
    expect(f.rent_2bed_flat.value).toBe(ctx.median_weekly * 100);
    expect(f.rent_2bed_flat_lettings.value).toBe(ctx.lettings);
    expect(f.rent_2bed_flat_change_1y.value * 100).toBeCloseTo(ctx.change_pct, 1);
    expect(f.rent_2bed_flat_change_1y.note).toContain(`($${ctx.median_year_ago} a week)`);
  });

  it("matches data/vgv_unit_growth.json: Docklands units, March-quarter median, sales, change, calendar-year median and growth", () => {
    const g = JSON.parse(readFileSync(path.join(root, "data", "vgv_unit_growth.json"), "utf8")).DOCKLANDS;
    const price = Object.fromEntries(layers["L03-price"].figures.map((x) => [x.key, x]));
    expect(price.unit_median_price.value).toBe(g.q[4] * 100);
    expect(price.unit_sales_count.value).toBe(g.sales_q1_26);
    expect(price.unit_price_change_1y.value * 100).toBeCloseTo(g.yoy_pct, 1);
    expect(price.unit_median_price_year.value).toBe(g.latest_2025 * 100);
    const hist = Object.fromEntries(layers["L07-history"].figures.map((x) => [x.key, x]));
    expect(hist.unit_price_cagr_5y.value * 100).toBeCloseTo(g.cagr5, 1);
    expect(hist.unit_price_cagr_10y.value * 100).toBeCloseTo(g.cagr10, 1);
    expect(layers["L07-history"].payload.price_series.unit.map((p) => p.median_cents / 100)).toEqual(Object.values(g.series));
    // Docklands has no house medians: a gap figure, not a zero.
    expect(price.house_median_price).toMatchObject({ value: null, chip: "Unknown" });
  });

  it("L09 compares Docklands with real neighbours", () => {
    const t = layers["L09-suburb-compare"].payload.table;
    console.log(`L09 Docklands neighbours shown: ${t.rows.slice(1).map((r) => r.name).join(", ")} (left out: ${layers["L09-suburb-compare"].payload.left_out})`);
    expect(t.rows[0]).toMatchObject({ name: "Docklands", is_subject: true });
    expect(t.rows.map((r) => r.name)).toEqual(expect.arrayContaining(["Southbank", "Melbourne"]));
  });
});

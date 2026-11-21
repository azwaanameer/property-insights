// The rating on the REAL Census and Valuer-General files, in PGlite, against data/backtest_multistate_results.json (the a-priori
// "VIC unit price" 2021-origin windows, which the spine says the Victorian unit rating is regression-tested against).
// The backtest matched suburbs by name and this pipeline by SAL code, so a few suburbs differ; the tolerances say how few.
// Skipped when data/raw is absent (it is gitignored).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { DEFAULT_ZIP as CENSUS_ZIP, runCensus } from "../ingest/census-sal.mjs";
import { DEFAULT_XLSX, loadSuburbs, readVicSals } from "../ingest/suburbs-sal.mjs";
import { DEFAULT_DIR as VGV_DIR, runVgvMedians } from "../ingest/vgv-medians.mjs";
import { openPglite } from "../lib/db.mjs";
import { runRating } from "./rating.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = path.join(root, "data", "backtest_multistate_results.json");
const have = [DEFAULT_XLSX, CENSUS_ZIP, path.join(VGV_DIR, "units-by-suburb-2015-2025.xlsx"), results].every(existsSync);

describe.skipIf(!have)("real files into PGlite: the Victorian unit rating", () => {
  let db;
  let close;
  let out;
  beforeAll(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    const sals = await readVicSals();
    await loadSuburbs(db, { sals, minimum: 2500 });
    await runVgvMedians(db, { sals });
    await runCensus(db, { sals });
    out = await runRating(db);
  }, 600_000);
  afterAll(() => close?.());

  it("rates about as many suburbs as the backtest scored, in five near-equal fifths", () => {
    const ref = JSON.parse(readFileSync(results, "utf8")).windows["apriori|VIC unit price|2021|3"];
    expect(Math.abs(out.rows - ref.n)).toBeLessThanOrEqual(10);
    for (const n of out.fifths) expect(Math.abs(n - out.rows / 5)).toBeLessThanOrEqual(2);
    console.log(`\nrated ${out.rows} (backtest n ${ref.n}); fifths ${out.fifths.join("/")}; left out ${JSON.stringify(out.left_out)}\n`);
  });

  it("the 2021-origin pairwise reads what the backtest read, to within two points, and clears the 70% floor", () => {
    const w = JSON.parse(readFileSync(results, "utf8")).windows;
    for (const win of out.regression) {
      const ref = w[`apriori|VIC unit price|2021|${win.forward}`].pair;
      expect(win.pairwise, `2021 to ${2021 + win.forward}`).toBeGreaterThanOrEqual(0.7);
      expect(Math.abs(win.pairwise - ref), `2021 to ${2021 + win.forward}`).toBeLessThan(0.02);
    }
  });
});

// End to end on the REAL harvest files in data/ (data/rp_harvest.json and data/rp_sold_harvest.json), through the real loader with its DEFAULT
// thresholds, into in-process PGlite, then the real price-driver model on what was loaded. Skipped when the files are absent (data/ is gitignored).
// Counts at 2026-11-21: 5,698 sales in 26 suburbs (two listings dropped for a price under $50,000), sold 2025-03-03 to 2026-11-21; the model used
// 1,634 of 3,387 apartment sales in 20 suburbs; 2 bed against 1 bed about +32%.
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { runPriceDrivers } from "../derive/price-drivers.mjs";
import { openPglite } from "../lib/db.mjs";
import { DEFAULT_FILES, runSold } from "./rp-sold.mjs";

const present = existsSync(DEFAULT_FILES.harvest) && existsSync(DEFAULT_FILES.sold);

describe.skipIf(!present)("the real sold-listing files into PGlite", () => {
  let db;
  let close;
  let sales;
  let model;
  beforeAll(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    sales = await runSold(db, {});
    model = await runPriceDrivers(db, {});
  }, 300_000);
  afterAll(() => close?.());

  it("loads the sold listings of 26 suburbs and publishes with every default check passing", () => {
    expect(sales.rows).toBeGreaterThan(5_000);
    expect(sales.rows).toBeLessThanOrEqual(5_700);
    expect(sales.suburbs).toBe(26);
    expect(sales.left_out.no_price + sales.left_out.bad_date + sales.left_out.outside_window + sales.left_out.not_victorian + sales.left_out.duplicate).toBe(0);
    expect(sales.as_of).toMatch(/^2026-11-\d\d$/);
  });

  it("holds no agent, agency or phone value from the files, anywhere in the loaded rows", async () => {
    const harvest = JSON.parse(readFileSync(DEFAULT_FILES.harvest, "utf8"));
    const sold = JSON.parse(readFileSync(DEFAULT_FILES.sold, "utf8"));
    const rows = [...harvest.sold, ...Object.values(sold.suburbs).flatMap((s) => s.rows ?? [])];
    const secrets = new Set();
    for (const r of rows) for (const k of ["agent", "agency", "agentPhone"]) if (typeof r[k] === "string" && r[k].length >= 6) secrets.add(r[k]);
    expect(secrets.size).toBeGreaterThan(50); // the files do carry them, so the check below means something
    const dump = JSON.stringify(await db.query("SELECT * FROM fact_reported_sale")) + JSON.stringify(sales);
    for (const s of secrets) expect(dump.includes(s), `${s} is in the loaded data`).toBe(false);
  });

  it("every sale has a date inside the two years before the harvest date, a price in range and a listing path", async () => {
    const [r] = await db.query(
      `SELECT min(price_aud)::int AS lo, max(price_aud)::int AS hi, to_char(min(sold_on), 'YYYY-MM-DD') AS first, to_char(max(sold_on), 'YYYY-MM-DD') AS last,
              count(*) FILTER (WHERE url !~ '^property-')::int AS bad_urls
       FROM fact_reported_sale`,
    );
    expect(r.lo).toBeGreaterThanOrEqual(50_000);
    expect(r.hi).toBeLessThanOrEqual(20_000_000);
    expect(r.first >= "2024-11-21").toBe(true);
    expect(r.last <= sales.as_of).toBe(true);
    expect(r.bad_urls).toBe(0);
  });

  it("fits the model on over a thousand apartment sales, 2 bed against 1 bed near the +30% of the 2026-11-11 analysis, with the Docklands layouts", async () => {
    const by = Object.fromEntries((await db.query("SELECT driver, effect_pct, se_pct FROM derived_price_driver")).map((r) => [r.driver, r]));
    expect(model.model.n_used).toBeGreaterThan(1_000);
    expect(by.bed_2.effect_pct).toBeGreaterThan(25);
    expect(by.bed_2.effect_pct).toBeLessThan(40);
    expect(by.bed_3.effect_pct).toBeGreaterThan(80);
    expect(by.car_space.effect_pct).toBeGreaterThan(10);
    expect(by["suburb:21640"].effect_pct).toBe(0);
    const cells = await db.query("SELECT beds, baths, has_car, n FROM derived_layout_median WHERE sal_code = '20766'");
    expect(cells.length).toBeGreaterThanOrEqual(3);
    for (const c of cells) expect(c.n).toBeGreaterThanOrEqual(20);
  });
});

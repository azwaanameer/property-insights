// The price-driver model: the least-squares maths against a hand-worked answer, the model against synthetic sales built with known effects (so the
// answer is known exactly), the layout medians, and the publish path on the committed excerpt of the real sold listings.
// The real files are exercised by `node pipeline/derive/price-drivers.mjs --pglite` and by price-drivers.real.test.mjs.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { parsePrice } from "../lib/sold.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { runSold } from "../ingest/rp-sold.mjs";
import { DRIVER_OPTIONS, SOLD_AS_OF, SOLD_OPTIONS, SOLD_TEXTS, soldClone } from "../ingest/fixtures/sold.mjs";
import { ModelError, POOLED, fitOls, fitPriceModel, layoutMedians, runPriceDrivers } from "./price-drivers.mjs";

describe("fitOls, against a case worked by hand", () => {
  // Two groups of three: y = 1,2,3 without the dummy and 3,4,5 with it. Intercept 2, slope 2; residuals -1,0,1 in each group, so SSE 4,
  // sigma squared 4 / (6 - 2) = 1, se(slope) = sqrt(1/3 + 1/3), se(intercept) = sqrt(1/3), and R squared = 1 - 4 / SST with SST = 4+1+0+0+1+4 = 10.
  const X = [[1, 0], [1, 0], [1, 0], [1, 1], [1, 1], [1, 1]];
  const y = [1, 2, 3, 3, 4, 5];
  it("recovers the coefficients, their standard errors, R squared and the residual spread", () => {
    const fit = fitOls(X, y);
    expect(fit.beta[0]).toBeCloseTo(2, 10);
    expect(fit.beta[1]).toBeCloseTo(2, 10);
    expect(fit.se[1]).toBeCloseTo(Math.sqrt(2 / 3), 10);
    expect(fit.se[0]).toBeCloseTo(Math.sqrt(1 / 3), 10);
    expect(fit.r2).toBeCloseTo(0.6, 10);
    expect(fit.sigma).toBeCloseTo(1, 10);
    expect([fit.n, fit.k]).toEqual([6, 2]);
  });

  it("refuses a design where two columns move together, and one with no more sales than coefficients", () => {
    expect(() => fitOls([[1, 1, 1], [1, 0, 0], [1, 1, 1], [1, 0, 0]], [1, 2, 3, 4])).toThrow(/singular/);
    expect(() => fitOls([[1, 0], [1, 1]], [1, 2])).toThrow(ModelError);
  });
});

// ---------------------------------------------------------------- sales built with known effects

const EFFECTS = { bed_2: 0.3, bed_3: 1.0, bath_2plus: 0.25, car_space: 0.2, floor_10_19: -0.03, floor_20_29: 0.0, floor_30plus: 0.07, suburbB: 0.1 };
const FLOORS = [5, 15, 25, 35];
/** Every combination of suburb (2), bedrooms (3), bathrooms (2), car space (2) and floor band (4): 96 sales whose price is exactly multiplicative. */
function synthetic(n = 1) {
  const out = [];
  let id = 1;
  for (const sal of ["21640", "22315"]) {
    for (const bed of [1, 2, 3]) {
      for (const bath of [1, 2]) {
        for (const park of [0, 1]) {
          for (const floor of FLOORS) {
            for (let copy = 0; copy < n; copy++) {
              const f =
                (sal === "22315" ? 1 + EFFECTS.suburbB : 1) *
                (bed === 2 ? 1 + EFFECTS.bed_2 : bed === 3 ? 1 + EFFECTS.bed_3 : 1) *
                (bath === 2 ? 1 + EFFECTS.bath_2plus : 1) *
                (park ? 1 + EFFECTS.car_space : 1) *
                (floor === 15 ? 1 + EFFECTS.floor_10_19 : floor === 25 ? 1 + EFFECTS.floor_20_29 : floor === 35 ? 1 + EFFECTS.floor_30plus : 1);
              out.push({
                listing_id: String(id++),
                address_text: `${floor}05/${10 + id} Test Street`,
                sal_code: sal,
                harvest_suburb: sal === "21640" ? "Melbourne CBD" : "Southbank",
                price_aud: Math.round(400_000 * f),
                bed,
                bath,
                park,
                property_type: "apartment",
                sold_on: `2026-0${1 + (id % 9)}-1${id % 9}`,
              });
            }
          }
        }
      }
    }
  }
  return out;
}

describe("fitPriceModel on sales whose price is built from known effects", () => {
  const model = fitPriceModel(synthetic(), { minSuburb: 5 });
  const by = Object.fromEntries(model.drivers.map((d) => [d.driver, d]));

  it("recovers every effect, in percent, and the suburb effect against the reference suburb", () => {
    for (const [driver, effect] of Object.entries({ bed_2: EFFECTS.bed_2, bed_3: EFFECTS.bed_3, bath_2plus: EFFECTS.bath_2plus, car_space: EFFECTS.car_space, floor_10_19: EFFECTS.floor_10_19, floor_20_29: EFFECTS.floor_20_29, floor_30plus: EFFECTS.floor_30plus })) {
      expect(by[driver].effect_pct, driver).toBeCloseTo(effect * 100, 2);
    }
    expect(by["suburb:22315"].effect_pct).toBeCloseTo(EFFECTS.suburbB * 100, 2);
    expect(by["suburb:22315"].is_reference).toBe(false);
  });

  it("makes Melbourne the reference suburb with an effect of exactly 0, and says which it is", () => {
    expect(by["suburb:21640"]).toMatchObject({ is_reference: true, effect_pct: 0, se_pct: 0, suburb_name: "Melbourne CBD" });
    expect(model.reference).toEqual({ sal_code: "21640", name: "Melbourne CBD" });
    expect(model.drivers.filter((d) => d.is_reference)).toHaveLength(1);
  });

  it("counts the sales used and the sales in each group, and gives every driver the same window and fit", () => {
    expect(model).toMatchObject({ n_total: 96, n_used: 96, suburbs: 2, dropped: [] });
    expect(by.bed_2.n_group).toBe(32);
    expect(by.bed_3.n_group).toBe(32);
    expect(by.bath_2plus.n_group).toBe(48);
    expect(by.car_space.n_group).toBe(48);
    expect(by.floor_30plus.n_group).toBe(24);
    expect(by["suburb:22315"].n_group).toBe(48);
    expect(new Set(model.drivers.map((d) => `${d.n_used}|${d.n_total}|${d.window_from}|${d.window_to}`)).size).toBe(1);
    expect(model.r2).toBeGreaterThan(0.999999);
    expect(model.residual_pct).toBeLessThan(0.001);
  });

  it("lists the pooled drivers first, in the report's order, then the suburbs", () => {
    expect(model.drivers.map((d) => d.driver)).toEqual([...POOLED.map((p) => p.driver), "suburb:21640", "suburb:22315"]);
  });
});

describe("fitPriceModel: which sales are used", () => {
  const base = synthetic();
  const extra = (over, id) => ({ ...base[0], listing_id: `x${id}`, ...over });

  it("counts apartment, unit and flat sales as the total, and leaves a house out of it altogether", () => {
    const m = fitPriceModel([...base, extra({ property_type: "house" }, 1), extra({ property_type: "unit" }, 2), extra({ property_type: "flat" }, 3)], { minSuburb: 5 });
    expect(m.n_total).toBe(98);
    expect(m.n_used).toBe(98);
  });

  it("counts, by reason and never silently, a price outside $150,000 to $2,500,000, 0 or 4 bedrooms, a unit number under three digits and a thin suburb", () => {
    const m = fitPriceModel(
      [
        ...base,
        extra({ price_aud: 149_999 }, 1),
        extra({ price_aud: 2_500_001 }, 2),
        extra({ bed: 4 }, 3),
        extra({ bed: 0 }, 4),
        extra({ bath: 0 }, 5),
        extra({ address_text: "12/30 Foo Street" }, 6),
        extra({ sal_code: "29999", harvest_suburb: "Thin" }, 7),
      ],
      { minSuburb: 5 },
    );
    expect(m.excluded).toEqual({ price_out_of_range: 2, bedrooms_out_of_range: 2, no_bathrooms: 1, no_unit_number: 1, thin_suburb: 1 });
    expect(m.n_total).toBe(96 + 7);
    expect(m.n_used).toBe(96);
  });

  it("measures against the largest suburb when Melbourne does not qualify", () => {
    const sales = base.filter((r) => r.sal_code === "22315" || r.bed === 1).map((r) => r);
    const m = fitPriceModel(sales, { minSuburb: 5 });
    // Southbank has 48 sales and Melbourne 16, so with a bar of 20 only Southbank remains, and it is the reference.
    const high = fitPriceModel(sales, { minSuburb: 20 });
    expect(m.reference.sal_code).toBe("21640");
    expect(high.reference).toEqual({ sal_code: "22315", name: "Southbank" });
    expect(high.excluded.thin_suburb).toBe(16);
  });

  it("drops a driver that no used sale has (here: no floor 30 and above), says so, and still fits the rest", () => {
    const m = fitPriceModel(base.filter((r) => !/^35/.test(r.address_text)), { minSuburb: 5 });
    expect(m.dropped).toEqual(["floor_30plus"]);
    expect(m.drivers.map((d) => d.driver)).not.toContain("floor_30plus");
    expect(m.drivers.find((d) => d.driver === "bed_2").effect_pct).toBeCloseTo(30, 2);
  });

  it("refuses when no suburb reaches the bar", () => {
    expect(() => fitPriceModel(base, { minSuburb: 1000 })).toThrow(/no suburb has 1000 usable apartment sales/);
  });
});

describe("layoutMedians", () => {
  const sale = (over) => ({ sal_code: "20766", price_aud: 500_000, bed: 2, bath: 1, park: 1, property_type: "apartment", ...over });
  const cell = (n, over = {}, price = (i) => 400_000 + i * 10_000) => Array.from({ length: n }, (_, i) => sale({ ...over, price_aud: price(i) }));

  it("keeps a layout only where the suburb has at least 20 sales of it, and omits a thinner cell", () => {
    const rows = layoutMedians([...cell(20), ...cell(19, { bed: 3 })]);
    expect(rows).toEqual([{ sal_code: "20766", beds: 2, baths: 1, has_car: true, median_price: 495_000, n: 20 }]);
  });

  it("takes the mean of the middle two for an even count, rounded to whole dollars, and merges 2 and more bathrooms", () => {
    const rows = layoutMedians([...cell(10, { bath: 2 }), ...cell(10, { bath: 3 })], { minLayout: 20 });
    // Sorted: 400k 400k 410k 410k ... 490k 490k, so the middle two are 440k and 450k.
    expect(rows).toEqual([{ sal_code: "20766", beds: 2, baths: 2, has_car: true, median_price: 445_000, n: 20 }]);
    const odd = layoutMedians(cell(20, {}, (i) => (i < 10 ? 200_001 : 200_002)), { minLayout: 20 });
    expect(odd[0].median_price).toBe(200_002); // 200,001.5 rounds to a whole dollar
  });

  it("splits by car space, uses the sales of every suburb apart, and ignores houses, other prices and other layouts", () => {
    const rows = layoutMedians(
      [...cell(20), ...cell(20, { park: 0 }), ...cell(20, { sal_code: "22315" }), ...cell(30, { property_type: "house" }), ...cell(30, { price_aud: 100 }, () => 100_000), ...cell(30, { bed: 4 }), ...cell(30, { bed: 0 })],
      { minLayout: 20 },
    );
    expect(rows.map((r) => `${r.sal_code}|${r.beds}|${r.baths}|${r.has_car}|${r.n}`)).toEqual(["20766|2|1|false|20", "20766|2|1|true|20", "22315|2|1|true|20"]);
  });

  it("is hand-checkable on the Docklands excerpt: the median of the 2 bed, 2 bath, car-space sales is computed here again from the raw text", () => {
    const harvest = soldClone().harvest;
    const prices = harvest.sold
      .filter((r) => r.crm_suburb === "Docklands" && /^(apartment|unit|flat)$/.test(r.type) && r.bed === 2 && r.bath >= 2 && r.park >= 1)
      .map((r) => parsePrice(r.price))
      .filter((p) => p >= 150_000 && p <= 2_500_000)
      .sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const want = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    expect(prices.length).toBe(47);
    expect(want).toBe(698_000);
  });
});

describe("runPriceDrivers on the committed excerpt of the real sold listings", () => {
  let db;
  let close;
  beforeEach(async () => {
    ({ db, close } = await openPglite());
    await applyMigrations(db);
  });
  afterEach(() => close());
  const load = () => runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
  const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'rp_sold_model'"))[0]?.id ?? null;

  it("publishes the model as its own dataset with the sales' harvest date, and the effects fall where the 2026-11-11 analysis put them", async () => {
    const sales = await load();
    const out = await runPriceDrivers(db, DRIVER_OPTIONS);
    expect(await pointer()).toBe(out.dataset_version_id);
    expect(out).toMatchObject({ source_id: "rp_sold_model", as_of: SOLD_AS_OF, sales_dataset_version_id: sales.dataset_version_id });
    const [v] = await db.query("SELECT status, row_count::int AS n, to_char(as_of, 'YYYY-MM-DD') AS as_of, states FROM src_dataset_version WHERE dataset_version_id = $1", [out.dataset_version_id]);
    expect(v).toEqual({ status: "published", n: out.rows, as_of: SOLD_AS_OF, states: ["VIC"] });
    const by = Object.fromEntries((await db.query("SELECT driver, effect_pct, se_pct, n_group, n_used, n_total FROM derived_price_driver")).map((r) => [r.driver, r]));
    expect(by.bed_2.effect_pct).toBeGreaterThan(20);
    expect(by.bed_2.effect_pct).toBeLessThan(45);
    expect(by.bed_3.effect_pct).toBeGreaterThan(by.bed_2.effect_pct);
    expect(by.car_space.effect_pct).toBeGreaterThan(10);
    expect(by.bath_2plus.effect_pct).toBeGreaterThan(5);
    expect(by["suburb:21640"]).toMatchObject({ effect_pct: 0 });
    expect(by.bed_2.n_used).toBe(out.model.n_used);
    expect(by.bed_2.n_total).toBe(out.model.n_total);
  });

  it("stores the Docklands layout medians the sales give, each with at least 20 sales, and none for a thinner layout", async () => {
    await load();
    await runPriceDrivers(db, DRIVER_OPTIONS);
    const rows = await db.query("SELECT beds, baths, has_car, median_price, n FROM derived_layout_median WHERE sal_code = '20766' ORDER BY beds, baths, has_car");
    expect(rows).toEqual([
      { beds: 1, baths: 1, has_car: false, median_price: 370_000, n: 28 },
      { beds: 1, baths: 1, has_car: true, median_price: 420_000, n: 23 },
      { beds: 2, baths: 1, has_car: true, median_price: 565_000, n: 31 },
      { beds: 2, baths: 2, has_car: true, median_price: 698_000, n: 47 },
    ]);
    expect((await db.query("SELECT count(*)::int AS n FROM derived_layout_median WHERE n < 20"))[0].n).toBe(0);
  });

  it("refuses when no sold-listings dataset is published", async () => {
    await expect(runPriceDrivers(db, DRIVER_OPTIONS)).rejects.toThrow(/no published sold-listings dataset/);
    expect(await pointer()).toBeNull();
  });

  it("refuses an implausible fit (a 2 bed effect outside +5% to +60%), leaving the old model live", async () => {
    await load();
    const first = await runPriceDrivers(db, DRIVER_OPTIONS);
    // Every apartment sells for the same price: bedrooms then explain nothing, so the 2-bed effect is about 0%.
    await db.query("UPDATE fact_reported_sale SET price_aud = 500000 + (listing_id::bigint % 7) * 1000");
    const err = await runPriceDrivers(db, DRIVER_OPTIONS).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.message).toMatch(/2-bed effect is missing or outside \+5% to \+60%/);
    expect(await pointer()).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE source_id = 'rp_sold_model' AND status = 'failed'");
    expect(failed).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS n FROM derived_price_driver WHERE dataset_version_id = $1", [failed[0].id]))[0].n).toBe(0);
  });

  it("refuses a model that rests on fewer sales than the bar", async () => {
    await load();
    await expect(runPriceDrivers(db, { ...DRIVER_OPTIONS, minimumUsed: 100_000 })).rejects.toThrow(/model used fewer than 100000 sales/);
  });
});

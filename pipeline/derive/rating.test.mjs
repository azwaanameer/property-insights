// The conditions rating pipeline: the maths against hand-worked cases, and the publish path on a synthetic Victorian dataset
// (60 suburbs whose Census shares and unit price history are built so the rating does, or does not, predict later growth).
// The real files are exercised by `node pipeline/derive/rating.mjs --pglite` and by rating.real.test.mjs.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { createDatasetVersion, makeBatchInserter } from "../lib/dataset.mjs";
import { openPglite } from "../lib/db.mjs";
import { insertMarkers } from "../ingest/census-sal.mjs";
import { loadSuburbs } from "../ingest/suburbs-sal.mjs";
import { PublishCheckError, publish } from "../publish/publish.mjs";
import { assignFifths, buildRating, evaluateRegression, MIN_DWELLINGS, pairwise, readRatingInputs, runRating, scoreRows, smoothedGrowth, zscores } from "./rating.mjs";

describe("maths", () => {
  it("z-scores use the population standard deviation, and a flat column does not divide by zero", () => {
    const z = zscores([1, 2, 3]);
    expect(z[0]).toBeCloseTo(-1.2247, 4); // (1 - 2) / sqrt(2/3)
    expect(z[1]).toBe(0);
    expect(z[2]).toBeCloseTo(1.2247, 4);
    expect(zscores([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it("score = z(owner) - z(flat) - z(unoccupied), so the suburb with more owners and fewer flats and empty homes scores highest", () => {
    const rows = [
      { sal_code: "A", owner_share: 0.8, flat_share: 0.1, unoccupied_share: 0.05 },
      { sal_code: "B", owner_share: 0.5, flat_share: 0.5, unoccupied_share: 0.1 },
      { sal_code: "C", owner_share: 0.2, flat_share: 0.9, unoccupied_share: 0.2 },
    ];
    const scored = scoreRows(rows);
    const z = (xs) => zscores(xs);
    const expectA = z([0.8, 0.5, 0.2])[0] - z([0.1, 0.5, 0.9])[0] - z([0.05, 0.1, 0.2])[0];
    expect(scored[0].score).toBeCloseTo(expectA, 10);
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[1].score).toBeGreaterThan(scored[2].score);
    expect(scored[1].score).toBeCloseTo(0 - 0 - z([0.05, 0.1, 0.2])[1], 10);
  });

  it("positions share a place on a tie, and the fifth follows from the position", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ sal_code: String(i), score: 10 - i }));
    const placed = assignFifths(rows);
    expect(placed.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(placed.map((r) => r.fifth)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const tied = assignFifths([{ score: 3 }, { score: 3 }, { score: 1 }]);
    expect(tied.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it("pairwise: 1 when the top fifth always outgrows the bottom, 0 when it never does, 0.5 on ties", () => {
    const rising = Array.from({ length: 15 }, (_, i) => ({ score: i, growth: i }));
    expect(pairwise(rising)).toBe(1);
    expect(pairwise(rising.map((r) => ({ ...r, growth: -r.growth })))).toBe(0);
    expect(pairwise(rising.map((r) => ({ ...r, growth: 1 })))).toBe(0.5);
  });

  it("smoothed growth is the annual rate between 2-year averages, as the backtest measured it", () => {
    const s = { 2020: 100, 2021: 110, 2022: 120, 2023: 130, 2024: 140, 2025: 150 };
    // origin 2021 -> avg(110, 100) = 105; 3 years on -> avg(140, 130) = 135: (135/105)^(1/3) - 1
    expect(smoothedGrowth(s, 2021, 3)).toBeCloseTo(((135 / 105) ** (1 / 3) - 1) * 100, 10);
    expect(smoothedGrowth({ ...s, 2023: undefined }, 2021, 3)).toBeNull();
  });
});

// ---------------------------------------------------------------- a synthetic dataset

const N = 60;
const sal = (i) => `2${String(9000 + i)}`; // 29000 ... 29059
/** A permutation of 0..1 so no two suburbs tie. */
const quality = (i) => ((i * 37) % N) / (N - 1);

async function publishCensus(db, sals, { dwellings = () => 1000, drop = () => false } = {}) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const q = quality(i);
    const markers = { dwellings: dwellings(i), owner_share: 0.3 + 0.4 * q, flat_share: 0.8 - 0.5 * q, unoccupied_share: 0.15 - 0.1 * q };
    for (const [marker_key, value] of Object.entries(markers)) if (!drop(i, marker_key)) rows.push({ sal_code: sal(i), marker_key, value, flag: null });
  }
  const loaded = await insertMarkers(db, { source_id: "abs_census_2021", rows, sals, file: "synthetic", as_of: "2021-08-10", file_sha256: null, retrieved_at: new Date().toISOString() });
  await publish(db, { source_id: "abs_census_2021", dataset_version_id: loaded.dataset_version_id });
  return loaded.dataset_version_id;
}

/** Unit annual medians 2015 to 2025. `slope` > 0 means higher-quality suburbs grow faster; < 0 the reverse. */
async function publishPrices(db, { slope = 1, skipYear = () => null, count = N } = {}) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const growth = 0.02 + 0.06 * (slope > 0 ? quality(i) : 1 - quality(i));
    for (let y = 2015; y <= 2025; y++) {
      if (skipYear(i) === y) continue;
      rows.push([sal(i), "unit", `${y}-12-31`, Math.round(50_000_000 * (1 + growth) ** (y - 2015)), "year"]);
    }
  }
  const id = await createDatasetVersion(db, { source_id: "vgv_medians", retrieved_at: new Date().toISOString(), file_sha256: null, as_of: "2026-03-31", row_count: rows.length, states: ["VIC"] });
  const insert = makeBatchInserter(
    db,
    "series_price",
    [
      { name: "sal_code", type: "text" },
      { name: "dwelling_type", type: "text" },
      { name: "period", type: "date" },
      { name: "median_cents", type: "bigint" },
      { name: "period_type", type: "text" },
    ],
    id,
  );
  await insert(rows);
  await publish(db, { source_id: "vgv_medians", dataset_version_id: id });
  return id;
}

let db;
let close;
let sals;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
  sals = Array.from({ length: N }, (_, i) => ({ sal_code: sal(i), name: `Testville ${i}`, raw_name: `Testville ${i}`, area_sqkm: 1 }));
  await loadSuburbs(db, { sals });
});
afterEach(() => close());

const current = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'conditions_rating'"))[0]?.id ?? null;

describe("publish", () => {
  it("rates every eligible suburb, five even fifths, band 1 = the highest score, and moves the pointer", async () => {
    await publishCensus(db, sals);
    await publishPrices(db);
    const out = await runRating(db, { minimum: 30 });
    expect(out.rows).toBe(N);
    expect(out.fifths).toEqual([12, 12, 12, 12, 12]);
    expect(out.left_out).toEqual({ too_few_dwellings: 0, missing_marker: 0, no_price_history: 0 });
    expect(await current()).toBe(out.dataset_version_id);
    const rows = await db.query("SELECT sal_code, dwelling_type, score::float8 AS score, band FROM derived_rating WHERE dataset_version_id = $1 ORDER BY score DESC", [out.dataset_version_id]);
    expect(rows).toHaveLength(N);
    expect(rows.every((r) => r.dwelling_type === "unit")).toBe(true);
    expect(rows[0].band).toBe("1");
    expect(rows.at(-1).band).toBe("5");
    // The best-quality suburb (quality 1) has the highest owner share and the lowest flat and unoccupied shares.
    const best = Array.from({ length: N }, (_, i) => i).find((i) => quality(i) === 1);
    expect(rows[0].sal_code).toBe(sal(best));
    const [v] = await db.query("SELECT as_of::text AS as_of, status, row_count::int AS n FROM src_dataset_version WHERE dataset_version_id = $1", [out.dataset_version_id]);
    expect(v).toMatchObject({ as_of: "2021-08-10", status: "published", n: N });
    // The regression ran on both 2021-origin windows and the rating predicted growth by construction.
    expect(out.regression.map((w) => [w.origin, w.forward])).toEqual([[2021, 3], [2021, 4]]);
    for (const w of out.regression) expect(w.pairwise).toBe(1);
  });

  it("leaves out suburbs under 300 dwellings, with a marker missing, or without a full 2015 to 2025 unit history, and counts each", async () => {
    await publishCensus(db, sals, { dwellings: (i) => (i === 0 ? MIN_DWELLINGS - 1 : 1000), drop: (i, k) => i === 1 && k === "owner_share" });
    await publishPrices(db, { skipYear: (i) => (i === 2 ? 2018 : null) });
    const inputs = await readRatingInputs(db);
    expect(inputs.left_out).toEqual({ too_few_dwellings: 1, missing_marker: 1, no_price_history: 1 });
    expect(inputs.eligible).toHaveLength(N - 3);
    expect(buildRating(inputs.eligible)).toHaveLength(N - 3);
    // Exactly 300 dwellings is enough.
    await db.query("UPDATE fact_suburb_marker SET value = 300 WHERE marker_key = 'dwellings' AND sal_code = $1", [sal(0)]);
    expect((await readRatingInputs(db)).left_out.too_few_dwellings).toBe(0);
  });

  it("REGRESSION: a rating that no longer predicts 2021-origin growth is refused, the old rating stays live, and nothing is left behind", async () => {
    await publishCensus(db, sals);
    await publishPrices(db, { slope: 1 });
    const first = await runRating(db, { minimum: 30 });
    expect(await current()).toBe(first.dataset_version_id);

    // New Valuer-General data in which the highest-rated suburbs now grow slowest: pairwise falls to 0.
    await publishPrices(db, { slope: -1 });
    const windows = await evaluateRegression(db, first.dataset_version_id);
    expect(windows.map((w) => w.pairwise)).toEqual([0, 0]);
    await expect(runRating(db, { minimum: 30 })).rejects.toThrow(PublishCheckError);
    await expect(runRating(db, { minimum: 30 })).rejects.toThrow(/regression: 2021 to 2024 reads 0\.0%, 2021 to 2025 reads 0\.0%, below the 70% floor/);

    expect(await current()).toBe(first.dataset_version_id);
    const versions = await db.query("SELECT dataset_version_id::text AS id, status FROM src_dataset_version WHERE source_id = 'conditions_rating' ORDER BY dataset_version_id");
    expect(versions.map((v) => v.status)).toEqual(["published", "failed", "failed"]);
    const stray = await db.query("SELECT count(*)::int AS n FROM derived_rating WHERE dataset_version_id <> $1", [first.dataset_version_id]);
    expect(stray[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM derived_rating WHERE dataset_version_id = $1", [first.dataset_version_id]))[0].n).toBe(N);
  });

  it("refuses to publish when there are too few suburbs to run the regression, rather than skipping it", async () => {
    await publishCensus(db, sals);
    await publishPrices(db, { count: 20 });
    await expect(runRating(db, { minimum: 10 })).rejects.toThrow(/regression could not run/);
    expect(await current()).toBeNull();
    // Switching the regression off is for fixtures only and is explicit.
    const out = await runRating(db, { minimum: 10, regression: false });
    expect(out.rows).toBe(20);
    expect(await current()).toBe(out.dataset_version_id);
  });

  it("a regression with no windows to check fails rather than passing vacuously", async () => {
    await publishCensus(db, sals);
    await publishPrices(db);
    await expect(runRating(db, { minimum: 30, regression: { forwards: [] } })).rejects.toThrow(/no windows to check/);
    expect(await current()).toBeNull();
  });

  it("refuses a row count under the minimum", async () => {
    await publishCensus(db, sals);
    await publishPrices(db);
    await expect(runRating(db, { minimum: 100 })).rejects.toThrow(/fewer than the minimum 100/);
    expect(await current()).toBeNull();
  });

  it("fails clearly when the Census or the Valuer-General data has not been published", async () => {
    await expect(runRating(db, { minimum: 1 })).rejects.toThrow(/no published Census dataset/);
    await publishCensus(db, sals);
    await expect(runRating(db, { minimum: 1 })).rejects.toThrow(/no published Valuer-General dataset/);
  });
});

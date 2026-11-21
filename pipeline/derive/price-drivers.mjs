// What moves an apartment's sale price? -> derived_price_driver and derived_layout_median, then publish (AD-5-style derive, AD-7, AD-8).
//
//   node pipeline/derive/price-drivers.mjs --pglite            in-memory dry run on the real files (loads the sold listings first), prints the driver table
//   node --env-file=.env pipeline/derive/price-drivers.mjs      derive from the published rp_sold_listings dataset in DATABASE_URL
//   npm run pipeline:drivers                                     the same, as a script (npm scripts do not read .env: see RUNBOOK section 13)
//
// The method is that of scripts/23-price-drivers.mjs (2026-11-11): ordinary least squares on log(sale price) with suburb fixed effects, over
// apartments with a parseable price and unit number, here over every harvested suburb pooled instead of six. Its price and floor parsing is
// shared (pipeline/lib/sold.mjs). A sale is USED when it is an apartment (apartment, unit or flat), priced $150,000 to $2,500,000, has 1 to 3
// bedrooms and at least 1 bathroom, and a unit number of three digits or more (the floor is the hundreds: 2105 is floor 21), in a suburb with at
// least 20 such sales (a thinner suburb cannot carry its own effect). The rest are counted by reason, not hidden.
//
//   effect_pct = (exp(coefficient) - 1) x 100        the change in sale price, all else equal
//   se_pct     = the coefficient's standard error x 100   on the log-price scale, as the script printed it. For a large effect (three
//                bedrooms) it understates the spread in percent; the report says what it is.
//   Drivers: 2 bed and 3 bed (against 1), 2+ baths (against 1), a car space, floors 10-19, 20-29 and 30+ (against 1-9), and each suburb
//   against the reference suburb (Melbourne CBD when it qualifies, else the suburb with the most sales).
//
// These are ASSOCIATIONS in past sales, never causes, and no price is predicted (AD-10): no building quality, view, age, condition or sale date
// enters the model. Layout medians are the median reported sale price of apartments of one layout (1 to 3 bedrooms, 1 or 2+ bathrooms, with or
// without a car space) in one suburb, kept only where the suburb has at least 20 sales of it; they need no floor, so they use more sales.
//
// Publish checks: declared row count, minimums, no big shrink, the 2-bed effect between +5% and +60% (a plausibility check on the whole fit),
// exactly one reference suburb, every layout cell at least 20 sales with a price in range, every window ends on or before the harvest date.
// A failed check leaves the old model live.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createDatasetVersion, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { cliArg, runPointCli } from "../lib/point-run.mjs";
import { LayoutMedianRow, PriceDriverRow } from "../lib/schemas.mjs";
import { APARTMENT_TYPES, floorOf, median } from "../lib/sold.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { SOURCE_ID as SALES_SOURCE, runSold } from "../ingest/rp-sold.mjs";
import { notMuchSmallerThanPrevious, minRows, sqlCheck } from "../publish/publish.mjs";

export const SOURCE_ID = "rp_sold_model";
/** Melbourne (the CBD harvest), the suburb the 2026-11-11 analysis measured the others against. */
export const REFERENCE_SAL = "21640";
export const MODEL = { priceMin: 150_000, priceMax: 2_500_000, minSuburb: 20, minLayout: 20 };
/** The plausible range of the 2-bed effect, in percent, that the publish check holds the whole fit to. */
export const BED_2_RANGE = [5, 60];

export class ModelError extends Error {
  constructor(message) {
    super(`the price-driver model could not be fitted; nothing published: ${message}`);
    this.name = "ModelError";
  }
}

/** The pooled drivers in the order the report shows them. `test` says whether a used sale has the characteristic. */
export const POOLED = [
  { driver: "bed_2", test: (r) => r.bed === 2 },
  { driver: "bed_3", test: (r) => r.bed === 3 },
  { driver: "bath_2plus", test: (r) => r.bath >= 2 },
  { driver: "car_space", test: (r) => (r.park ?? 0) >= 1 },
  { driver: "floor_10_19", test: (r) => r.floor >= 10 && r.floor < 20 },
  { driver: "floor_20_29", test: (r) => r.floor >= 20 && r.floor < 30 },
  { driver: "floor_30plus", test: (r) => r.floor >= 30 },
];

// ---------------------------------------------------------------- ordinary least squares

/** Inverse of a square matrix by Gauss-Jordan with partial pivoting. Throws ModelError when it is singular. */
function invert(M) {
  const k = M.length;
  const m = M.map((r, i) => [...r, ...M.map((_, j) => +(i === j))]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) throw new ModelError("the design is singular (two drivers move together, so their effects cannot be told apart)");
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 2 * k; j++) m[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * k; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((r) => r.slice(k));
}

/**
 * Ordinary least squares y = X b. `X` rows include the intercept column. Returns the coefficients, their standard errors, R-squared and the
 * residual standard deviation (sigma, on the scale of y).
 * @param {number[][]} X
 * @param {number[]} y
 */
export function fitOls(X, y) {
  const n = X.length;
  const k = n === 0 ? 0 : X[0].length;
  if (n <= k) throw new ModelError(`${n} sales cannot fit ${k} coefficients`);
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const inv = invert(XtX);
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - X[i].reduce((s, x, j) => s + x * beta[j], 0);
    sse += e * e;
  }
  const mean = y.reduce((a, b) => a + b, 0) / n;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const sigma2 = sse / (n - k);
  return { beta, se: inv.map((row, j) => Math.sqrt(Math.max(0, row[j] * sigma2))), r2: sst === 0 ? 0 : 1 - sse / sst, sigma: Math.sqrt(sigma2), n, k };
}

// ---------------------------------------------------------------- selecting and fitting

/** Why an apartment sale is not used, or null when it is (before the suburb threshold). */
function exclusionReason(r, { priceMin, priceMax }) {
  if (r.price_aud < priceMin || r.price_aud > priceMax) return "price_out_of_range";
  if (r.bed === null || r.bed < 1 || r.bed > 3) return "bedrooms_out_of_range";
  if (r.bath === null || r.bath < 1) return "no_bathrooms";
  if (floorOf(r.address_text) === null) return "no_unit_number";
  return null;
}

/**
 * Pure. Fit the model on the sales ({ listing_id, address_text, sal_code, harvest_suburb, price_aud, bed, bath, park, property_type, sold_on }).
 * @returns {{ n_total: number, n_used: number, excluded: Record<string, number>, drivers: any[], r2: number, residual_pct: number,
 *             window_from: string, window_to: string, reference: { sal_code: string, name: string }, suburbs: number, dropped: string[] }}
 */
export function fitPriceModel(sales, { priceMin = MODEL.priceMin, priceMax = MODEL.priceMax, minSuburb = MODEL.minSuburb, referenceSal = REFERENCE_SAL } = {}) {
  const apartments = sales.filter((r) => APARTMENT_TYPES.has(String(r.property_type).toLowerCase()));
  const excluded = { price_out_of_range: 0, bedrooms_out_of_range: 0, no_bathrooms: 0, no_unit_number: 0, thin_suburb: 0 };
  const candidates = [];
  for (const r of apartments) {
    const why = exclusionReason(r, { priceMin, priceMax });
    if (why) excluded[why]++;
    else candidates.push({ ...r, floor: floorOf(r.address_text) });
  }
  const perSuburb = new Map();
  for (const r of candidates) perSuburb.set(r.sal_code, (perSuburb.get(r.sal_code) ?? 0) + 1);
  const kept = [...perSuburb].filter(([, n]) => n >= minSuburb).map(([sal]) => sal).sort();
  const used = candidates.filter((r) => kept.includes(r.sal_code));
  excluded.thin_suburb = candidates.length - used.length;
  if (kept.length === 0) throw new ModelError(`no suburb has ${minSuburb} usable apartment sales`);

  const reference = kept.includes(referenceSal) ? referenceSal : [...kept].sort((a, b) => perSuburb.get(b) - perSuburb.get(a) || a.localeCompare(b))[0];
  const nameOf = (sal) => used.find((r) => r.sal_code === sal).harvest_suburb;
  const others = kept.filter((s) => s !== reference);

  // Columns: intercept, one dummy per non-reference suburb, then the pooled drivers. A driver no used sale has cannot be estimated and is dropped.
  const cols = [
    ...others.map((sal) => ({ driver: `suburb:${sal}`, sal_code: sal, test: (r) => r.sal_code === sal })),
    ...POOLED.map((p) => ({ driver: p.driver, sal_code: null, test: p.test })),
  ];
  const present = cols.filter((c) => used.some((r) => c.test(r)));
  const dropped = cols.filter((c) => !present.includes(c)).map((c) => c.driver);
  const X = used.map((r) => [1, ...present.map((c) => +c.test(r))]);
  const y = used.map((r) => Math.log(r.price_aud));
  const fit = fitOls(X, y);

  const dates = used.map((r) => r.sold_on).sort();
  const base = { n_used: used.length, n_total: apartments.length, window_from: dates[0], window_to: dates.at(-1), r_squared: fit.r2, residual_pct: fit.sigma * 100 };
  const drivers = [];
  present.forEach((c, i) => {
    const row = {
      driver: c.driver,
      sal_code: c.sal_code,
      suburb_name: c.sal_code ? nameOf(c.sal_code) : null,
      is_reference: false,
      effect_pct: (Math.exp(fit.beta[i + 1]) - 1) * 100,
      se_pct: fit.se[i + 1] * 100,
      n_group: used.filter(c.test).length,
      ...base,
    };
    drivers.push(row);
  });
  drivers.push({
    driver: `suburb:${reference}`,
    sal_code: reference,
    suburb_name: nameOf(reference),
    is_reference: true,
    effect_pct: 0,
    se_pct: 0,
    n_group: perSuburb.get(reference),
    ...base,
  });
  // The report order: the pooled drivers first, then the suburbs by name.
  const order = (d) => (d.sal_code ? 100 : POOLED.findIndex((p) => p.driver === d.driver));
  drivers.sort((a, b) => order(a) - order(b) || String(a.suburb_name ?? "").localeCompare(String(b.suburb_name ?? "")));
  return {
    n_total: apartments.length,
    n_used: used.length,
    excluded,
    drivers,
    r2: fit.r2,
    residual_pct: fit.sigma * 100,
    window_from: dates[0],
    window_to: dates.at(-1),
    reference: { sal_code: reference, name: nameOf(reference) },
    suburbs: kept.length,
    dropped,
  };
}

/**
 * Pure. The median reported sale price of apartments by suburb and layout, only where a suburb has at least `minLayout` sales of the layout.
 * Uses every apartment sale with a price in range, 1 to 3 bedrooms and at least one bathroom (no floor needed). Baths is 1 or 2 (two or more).
 */
export function layoutMedians(sales, { priceMin = MODEL.priceMin, priceMax = MODEL.priceMax, minLayout = MODEL.minLayout } = {}) {
  const cells = new Map();
  for (const r of sales) {
    if (!APARTMENT_TYPES.has(String(r.property_type).toLowerCase())) continue;
    if (r.price_aud < priceMin || r.price_aud > priceMax) continue;
    if (r.bed === null || r.bed < 1 || r.bed > 3 || r.bath === null || r.bath < 1) continue;
    const baths = r.bath >= 2 ? 2 : 1;
    const has_car = (r.park ?? 0) >= 1;
    const key = `${r.sal_code}|${r.bed}|${baths}|${has_car}`;
    if (!cells.has(key)) cells.set(key, { sal_code: r.sal_code, beds: r.bed, baths, has_car, prices: [] });
    cells.get(key).prices.push(r.price_aud);
  }
  return [...cells.values()]
    .filter((c) => c.prices.length >= minLayout)
    .map((c) => ({ sal_code: c.sal_code, beds: c.beds, baths: c.baths, has_car: c.has_car, median_price: Math.round(median(c.prices)), n: c.prices.length }))
    .sort((a, b) => a.sal_code.localeCompare(b.sal_code) || a.beds - b.beds || a.baths - b.baths || +a.has_car - +b.has_car);
}

// ---------------------------------------------------------------- reading the inputs from the current sales dataset (AD-7)

/** The sales of the CURRENT rp_sold_listings dataset, with its id and harvest date. Throws when none is published. */
export async function readSales(db) {
  const cur = await db.query(
    `SELECT c.dataset_version_id::text AS id, to_char(v.as_of, 'YYYY-MM-DD') AS as_of
     FROM src_dataset_current c JOIN src_dataset_version v ON v.dataset_version_id = c.dataset_version_id WHERE c.source_id = $1`,
    [SALES_SOURCE],
  );
  if (cur.length === 0) throw new Error(`no published sold-listings dataset (${SALES_SOURCE}). Run \`node --env-file=.env pipeline/ingest/rp-sold.mjs\` first.`);
  const sales = await db.query(
    `SELECT listing_id, address_text, sal_code, harvest_suburb, price_aud, bed, bath, park, property_type, to_char(sold_on, 'YYYY-MM-DD') AS sold_on
     FROM fact_reported_sale WHERE dataset_version_id = $1 ORDER BY listing_id`,
    [cur[0].id],
  );
  return { dataset_version_id: cur[0].id, as_of: cur[0].as_of, sales };
}

// ---------------------------------------------------------------- load and publish

const DRIVER_COLUMNS = [
  { name: "driver", type: "text" },
  { name: "sal_code", type: "text" },
  { name: "suburb_name", type: "text" },
  { name: "is_reference", type: "boolean" },
  { name: "effect_pct", type: "double precision" },
  { name: "se_pct", type: "double precision" },
  { name: "n_used", type: "integer" },
  { name: "n_total", type: "integer" },
  { name: "n_group", type: "integer" },
  { name: "window_from", type: "date" },
  { name: "window_to", type: "date" },
  { name: "r_squared", type: "double precision" },
  { name: "residual_pct", type: "double precision" },
];
const LAYOUT_COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "beds", type: "integer" },
  { name: "baths", type: "integer" },
  { name: "has_car", type: "boolean" },
  { name: "median_price", type: "integer" },
  { name: "n", type: "integer" },
];

/**
 * Publish checks (SQL, in the publish transaction).
 * @param {{ minimumDrivers?: number, minimumUsed?: number, minLayout?: number }} [opts]
 */
export const driverChecks = ({ minimumDrivers = 8, minimumUsed = 500, minLayout = MODEL.minLayout } = {}) => [
  sqlCheck(
    "derived_price_driver and derived_layout_median together do not equal the declared row count",
    `SELECT (SELECT count(*) FROM derived_price_driver WHERE dataset_version_id = $1) + (SELECT count(*) FROM derived_layout_median WHERE dataset_version_id = $1)
            = (SELECT row_count FROM src_dataset_version WHERE dataset_version_id = $1) AS ok`,
  ),
  minRows("derived_price_driver", minimumDrivers),
  notMuchSmallerThanPrevious(0.5),
  sqlCheck(
    `the model used fewer than ${minimumUsed} sales`,
    `SELECT COALESCE(min(n_used), 0) >= ${Number(minimumUsed)} AS ok FROM derived_price_driver WHERE dataset_version_id = $1`,
  ),
  sqlCheck(
    `the 2-bed effect is missing or outside +${BED_2_RANGE[0]}% to +${BED_2_RANGE[1]}%, so the fit is not plausible`,
    `SELECT EXISTS (SELECT 1 FROM derived_price_driver WHERE dataset_version_id = $1 AND driver = 'bed_2' AND effect_pct BETWEEN ${BED_2_RANGE[0]} AND ${BED_2_RANGE[1]}) AS ok`,
  ),
  sqlCheck(
    "derived_price_driver does not have exactly one reference suburb",
    `SELECT count(*) FILTER (WHERE is_reference) = 1 AS ok FROM derived_price_driver WHERE dataset_version_id = $1`,
  ),
  sqlCheck(
    "derived_price_driver has a standard error that is negative",
    `SELECT NOT EXISTS (SELECT 1 FROM derived_price_driver WHERE dataset_version_id = $1 AND se_pct < 0) AS ok`,
  ),
  sqlCheck(
    "derived_price_driver has a window that ends after the harvest date, or has more used sales than sales",
    `SELECT NOT EXISTS (
       SELECT 1 FROM derived_price_driver d JOIN src_dataset_version v ON v.dataset_version_id = d.dataset_version_id
       WHERE d.dataset_version_id = $1 AND (d.window_to > v.as_of OR d.window_from > d.window_to OR d.n_used > d.n_total)) AS ok`,
  ),
  sqlCheck(
    `derived_layout_median has a layout with fewer than ${minLayout} sales or a median price outside $50,000 to $20,000,000`,
    `SELECT NOT EXISTS (SELECT 1 FROM derived_layout_median WHERE dataset_version_id = $1 AND (n < ${Number(minLayout)} OR median_price < 50000 OR median_price > 20000000)) AS ok`,
  ),
];

/**
 * Fit the model on the current sold-listings dataset and publish it as a dataset of source rp_sold_model.
 * @param {any} db
 * @param {{ minSuburb?: number, minLayout?: number, referenceSal?: string, minimumDrivers?: number, minimumUsed?: number, log?: (m: string) => void }} [opts]
 */
export async function runPriceDrivers(db, { minSuburb = MODEL.minSuburb, minLayout = MODEL.minLayout, referenceSal = REFERENCE_SAL, minimumDrivers, minimumUsed, log = () => {} } = {}) {
  const input = await readSales(db);
  const model = fitPriceModel(input.sales, { minSuburb, referenceSal });
  const layouts = layoutMedians(input.sales, { minLayout });
  const bad = [];
  const driverRows = model.drivers.map((d) => {
    const ok = PriceDriverRow.safeParse(d);
    if (!ok.success) bad.push(`${d.driver}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
    return ok.success ? ok.data : d;
  });
  const layoutRows = layouts.map((l) => {
    const ok = LayoutMedianRow.safeParse(l);
    if (!ok.success) bad.push(`layout ${l.sal_code}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
    return ok.success ? ok.data : l;
  });
  if (bad.length) throw new ModelError(`${bad.length} row(s) failed the schema. First: ${bad.slice(0, 3).join(" | ")}`);

  const body = [...driverRows.map((d) => `${d.driver}|${d.effect_pct}|${d.se_pct}`), ...layoutRows.map((l) => `${l.sal_code}|${l.beds}|${l.baths}|${l.has_car}|${l.median_price}|${l.n}`)].join("\n");
  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: new Date().toISOString(),
    file_sha256: createHash("sha256").update(`${SALES_SOURCE}:${input.dataset_version_id}\n${body}`).digest("hex"),
    as_of: input.as_of,
    row_count: driverRows.length + layoutRows.length,
    states: ["VIC"],
  });
  const checks = driverChecks({ minimumDrivers, minimumUsed, minLayout });
  try {
    await makeBatchInserter(db, "derived_price_driver", DRIVER_COLUMNS, id)(
      driverRows.map((d) => [d.driver, d.sal_code, d.suburb_name, d.is_reference, d.effect_pct, d.se_pct, d.n_used, d.n_total, d.n_group, d.window_from, d.window_to, d.r_squared, d.residual_pct]),
    );
    await makeBatchInserter(db, "derived_layout_median", LAYOUT_COLUMNS, id)(layoutRows.map((l) => [l.sal_code, l.beds, l.baths, l.has_car, l.median_price, l.n]));
    log(`derived ${driverRows.length} effects and ${layoutRows.length} layout medians from ${model.n_used} of ${model.n_total} apartment sales`);
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
  // loadAndPublish publishes the version `load` returns and marks it failed if a check fails.
  const out = await loadAndPublish(db, { source_id: SOURCE_ID, checks, load: async () => ({ dataset_version_id: id }) });
  return {
    source_id: SOURCE_ID,
    dataset_version_id: out.dataset_version_id,
    rows: driverRows.length + layoutRows.length,
    files: [],
    as_of: input.as_of,
    sales_dataset_version_id: input.dataset_version_id,
    model,
    layouts: layoutRows,
  };
}

// ---------------------------------------------------------------- CLI

const money = (n) => `$${Math.round(n).toLocaleString("en-AU")}`;
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function printModel(summary, log = console.log, { sal } = {}) {
  const m = summary.model;
  log(`  sales as at ${summary.as_of}; used ${m.n_used} of ${m.n_total} apartment sales, sold ${m.window_from} to ${m.window_to}, ${m.suburbs} suburbs, reference ${m.reference.name}; R-squared ${m.r2.toFixed(3)}, typical unexplained spread about ${m.residual_pct.toFixed(0)}%`);
  log(`  left out: ${JSON.stringify(m.excluded)}${m.dropped.length ? `; not estimable: ${m.dropped.join(", ")}` : ""}`);
  for (const d of m.drivers) log(`    ${d.driver.padEnd(16)} ${pct(d.effect_pct).padStart(8)}  (se ${d.se_pct.toFixed(1)})  n ${d.n_group}${d.suburb_name ? `  ${d.suburb_name}${d.is_reference ? " (reference)" : ""}` : ""}`);
  const mine = summary.layouts.filter((l) => !sal || l.sal_code === sal);
  if (mine.length) log(`  layout medians${sal ? ` for ${sal}` : ""}:`);
  for (const l of mine) log(`    ${l.sal_code} ${l.beds} bed ${l.baths === 2 ? "2+" : "1"} bath ${l.has_car ? "car" : "no car"}: ${money(l.median_price)} (n ${l.n})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli(
    async (db, { log, argv, kind }) => {
      if (kind === "pglite") await runSold(db, { log });
      const out = await runPriceDrivers(db, { log });
      printModel(out, log, { sal: cliArg(argv, "--suburb", "20766") });
      return { ...out, rows: out.rows };
    },
    { require: { table: "derived_price_driver", migration: "0011" } },
  ).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

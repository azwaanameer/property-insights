// SQL only. The price-driver model written by pipeline/derive/price-drivers.mjs (derived_price_driver and derived_layout_median), read through the
// current dataset pointer of its source rp_sold_model (AD-7). Effects are percentages from ordinary least squares on log sale price: associations
// in past reported sales, not causes. Null when no model is published.
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export const DRIVERS_SOURCE = "rp_sold_model";

export interface DriverRow {
  /** bed_2, bed_3, bath_2plus, car_space, floor_10_19, floor_20_29, floor_30plus or suburb:SAL. */
  driver: string;
  sal_code: string | null;
  suburb_name: string | null;
  /** The suburb every other suburb is measured against (its own effect is 0). */
  is_reference: boolean;
  effect_pct: number;
  /** The standard error of effect_pct, on the same scale (percentage points of sale price): exp(coefficient) x the coefficient's standard error x 100 (delta method). */
  se_pct: number;
  n_used: number;
  n_total: number;
  /** The used sales that have the characteristic (or are in the suburb). */
  n_group: number;
  window_from: string;
  window_to: string;
  r_squared: number;
  residual_pct: number;
}

export interface LayoutMedianRow {
  beds: number;
  /** 1, or 2 for two or more. */
  baths: number;
  has_car: boolean;
  median_price: number;
  n: number;
}

export interface DriverModel {
  as_of: string;
  drivers: DriverRow[];
}

/** Every effect of the current model, or null when none is published. */
export async function getDriverModel(db: Db): Promise<DriverModel | null> {
  const ds = await currentDataset(db, DRIVERS_SOURCE);
  if (!ds) return null;
  const drivers = await db.query<DriverRow>(
    `SELECT d.driver, d.sal_code, d.suburb_name, d.is_reference, d.effect_pct::float8 AS effect_pct, d.se_pct::float8 AS se_pct,
            d.n_used::int AS n_used, d.n_total::int AS n_total, d.n_group::int AS n_group,
            to_char(d.window_from, 'YYYY-MM-DD') AS window_from, to_char(d.window_to, 'YYYY-MM-DD') AS window_to,
            d.r_squared::float8 AS r_squared, d.residual_pct::float8 AS residual_pct
     FROM derived_price_driver d JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = d.dataset_version_id
     ORDER BY d.driver`,
    [DRIVERS_SOURCE],
  );
  if (drivers.length === 0) return null;
  return { as_of: ds.as_of, drivers };
}

/** The layout medians of one suburb (only layouts with enough sales were stored), smallest layout first. */
export async function listLayoutMedians(db: Db, salCode: string): Promise<LayoutMedianRow[]> {
  return db.query<LayoutMedianRow>(
    `SELECT m.beds::int AS beds, m.baths::int AS baths, m.has_car, m.median_price::int AS median_price, m.n::int AS n
     FROM derived_layout_median m JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = m.dataset_version_id
     WHERE m.sal_code = $2 ORDER BY m.beds, m.baths, m.has_car`,
    [DRIVERS_SOURCE, salCode],
  );
}

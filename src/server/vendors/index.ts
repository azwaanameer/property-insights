// The live vendor adapters, built from the database, the environment and a fetch function. Handed to layers through `LayerContext.vendors`.
import type { Db } from "../db";
import type { Env } from "../config";
import type { FetchFn } from "./cache";
import { fetchShortStay } from "./airdna";
import { fetchStreetImages } from "./mapillary";
import { fetchPlaceImages } from "./wikimedia";
import type { VendorAdapters } from "./types";

export * from "./types";

export interface VendorOptions {
  db: Db;
  env: Env;
  /** Defaults to the global fetch. Tests pass a fake: no test reaches the network. */
  fetch?: FetchFn;
  now?: () => Date;
  timeout_ms?: number;
  /** Replaces the whole-call budget of every adapter (tests). */
  budget_ms?: number;
  /** Replaces the wait before the one AirDNA retry (tests). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The Mapillary token comes from `MAPILLARY_ACCESS_TOKEN` and the AirDNA key from `RAPIDAPI_KEY` (Cloudflare secrets). Without its secret an adapter reports
 * `no_key` and makes no call.
 */
export function createVendors(opts: VendorOptions): VendorAdapters {
  const fetchFn: FetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  const common = { db: opts.db, fetchFn, now: opts.now, timeout_ms: opts.timeout_ms, budget_ms: opts.budget_ms };
  const token = opts.env.MAPILLARY_ACCESS_TOKEN?.trim() || undefined;
  const rapidKey = opts.env.RAPIDAPI_KEY?.trim() || undefined;
  return {
    streetImages: (lat, lon) => fetchStreetImages({ ...common, token, lat, lon }),
    placeImages: (lat, lon) => fetchPlaceImages({ ...common, lat, lon }),
    shortStay: (query) => fetchShortStay({ ...common, key: rapidKey, query, sleep: opts.sleep }),
  };
}

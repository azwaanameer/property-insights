// The live vendor adapters, built from the database, the environment and a fetch function. Handed to layers through `LayerContext.vendors`.
import type { Db } from "../db";
import type { Env } from "../config";
import type { FetchFn } from "./cache";
import { fetchStreetImages } from "./mapillary";
import { fetchPlaces } from "./overpass";
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
}

/** The Mapillary token comes from `MAPILLARY_ACCESS_TOKEN` (a Cloudflare secret). Without it the street-image adapter reports `no_key`. */
export function createVendors(opts: VendorOptions): VendorAdapters {
  const fetchFn: FetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  const common = { db: opts.db, fetchFn, now: opts.now, timeout_ms: opts.timeout_ms };
  const token = opts.env.MAPILLARY_ACCESS_TOKEN?.trim() || undefined;
  return {
    streetImages: (lat, lon) => fetchStreetImages({ ...common, token, lat, lon }),
    placeImages: (lat, lon) => fetchPlaceImages({ ...common, lat, lon }),
    places: (lat, lon) => fetchPlaces({ ...common, lat, lon }),
  };
}

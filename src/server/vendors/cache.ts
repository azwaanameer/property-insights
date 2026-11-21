// The vendor cache helper (AD-8): the only code that writes `vendor_cache`. Public data is stored with `principal_id` null. The key is the
// vendor, the point snapped to about 100 m and the query parameters, so two addresses on the same block share one outside call. The adapters
// query around the snapped point (not the address), so a cached answer is the same whichever address asked first.
import type { Db } from "../db";
import { errorFields, log } from "../log";
import type { VendorResult } from "./types";

/** `vendor_cache` allows at most 30 days (CHECK in 0001). */
export const MAX_CACHE_DAYS = 30;
/** Outside calls give up after this long (AD-9). */
export const VENDOR_TIMEOUT_MS = 8000;
export const USER_AGENT = "VicProp/1.0 (property report tool)";

/** Three decimal places of latitude is about 111 m. */
const SNAP_DECIMALS = 3;
const snap = (v: number) => Number(v.toFixed(SNAP_DECIMALS));

/** The point an adapter queries around. It is at most about 80 m from the address it was asked about. */
export function snapPoint(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: snap(lat), lon: snap(lon) };
}
/** The most the snapped point can be from the address (metres, with margin): adapters widen their search by this much. */
export const SNAP_ERROR_M = 90;

export function cacheKey(vendor: string, lat: number, lon: number, params = ""): string {
  const p = snapPoint(lat, lon);
  return `${vendor}:${p.lat.toFixed(SNAP_DECIMALS)},${p.lon.toFixed(SNAP_DECIMALS)}${params ? `:${params}` : ""}`;
}

export class VendorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorError";
  }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * One outside call with a hard time limit. Throws VendorError (its message never contains the URL, which may carry a key) on a timeout, a
 * non-200 answer or a body that is not JSON.
 */
export async function fetchJson(fetchFn: FetchFn, url: string, init: RequestInit = {}, timeoutMs = VENDOR_TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new VendorError(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  const call = (async () => {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, signal: ctrl.signal, headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init.headers as Record<string, string> | undefined) } });
    } catch (err) {
      throw new VendorError(`request failed (${err instanceof Error ? err.name : "error"})`);
    }
    if (res.status !== 200) throw new VendorError(`status ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new VendorError("body is not JSON");
    }
  })();
  call.catch(() => undefined); // a late failure after the timeout is not an unhandled rejection
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CachedOptions<T> {
  db: Db;
  vendor: string;
  key: string;
  ttl_days: number;
  now?: () => Date;
  /** Does the outside call and returns what is worth caching. May throw. */
  load: () => Promise<T>;
}

/** Reads a live cache row, else loads and stores (best effort: a cache read or write problem never fails the call). A failed load is never cached. */
export async function cached<T>(opts: CachedOptions<T>): Promise<VendorResult<T>> {
  const { db, vendor, key } = opts;
  const now = opts.now?.() ?? new Date();
  try {
    const rows = await db.query<{ payload: T; fetched_at: string | Date }>(
      "SELECT payload, fetched_at FROM vendor_cache WHERE cache_key = $1 AND vendor = $2 AND expires_at > $3::timestamptz",
      [key, vendor, now.toISOString()],
    );
    if (rows[0]) return { ok: true, data: rows[0].payload, as_of: new Date(rows[0].fetched_at).toISOString().slice(0, 10), cached: true };
  } catch (err) {
    log("warn", "vendor_cache_read_failed", { vendor, ...errorFields(err) });
  }
  let data: T;
  try {
    data = await opts.load();
  } catch (err) {
    log("warn", "vendor_failed", { vendor, ...errorFields(err) });
    return { ok: false, reason: "unavailable" };
  }
  const days = Math.max(0, Math.min(opts.ttl_days, MAX_CACHE_DAYS));
  try {
    await db.query(
      `INSERT INTO vendor_cache (cache_key, vendor, principal_id, payload, fetched_at, expires_at)
       VALUES ($1, $2, NULL, $3::jsonb, $4::timestamptz, $4::timestamptz + make_interval(days => $5::int))
       ON CONFLICT (cache_key) DO UPDATE SET vendor = EXCLUDED.vendor, principal_id = NULL, payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at`,
      [key, vendor, JSON.stringify(data), now.toISOString(), days],
    );
  } catch (err) {
    log("warn", "vendor_cache_write_failed", { vendor, ...errorFields(err) });
  }
  return { ok: true, data, as_of: now.toISOString().slice(0, 10), cached: false };
}

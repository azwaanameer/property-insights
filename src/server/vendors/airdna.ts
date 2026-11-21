// AirDNA rentalizer (RapidAPI host airdna1): a short-stay income estimate and the comparable listings behind it, for one address. The request and
// the field names follow the City Retreats CRM (src/lib/airdna.parse.ts, read-only reference): GET /rentalizer?address=...&currency=native&bedrooms=N&bathrooms=N,
// headers x-rapidapi-key and x-rapidapi-host. The key is read from RAPIDAPI_KEY by the caller and goes only in a request header: it is never in a
// URL, a cache row, a log line or an error message. The answer is cached up to 30 days by the address point snapped to about 100 m plus
// bedrooms and bathrooms (AD-8), so a crawler walking a block costs one call. An answer with no usable income and no comparable listings is kept
// 1 day, not 30. A failed lookup (429, 5xx, timeout, anything else) leaves a 10 minute failure marker so an outage or abuse cannot cause a paid call
// per request; the marker is never served as data.
// The plan has a per-second rate limit and AirDNA sometimes answers 503, so a 429 or a 5xx gets ONE retry after a short wait, inside the time
// budget, and then the adapter gives up. A 429 whose quota header says no requests remain is not retried (the month is spent).
import type { Db } from "../db";
import { log } from "../log";
import { cacheKey, cached, fetchJson, NEGATIVE_CACHE_SECONDS, VendorError, type FetchFn } from "./cache";
import { VENDOR_BUDGET_MS, type ShortStayComp, type ShortStayEstimate, type ShortStayQuery, type VendorResult } from "./types";

export const AIRDNA_VENDOR = "airdna_rentalizer";
export const AIRDNA_TTL_DAYS = 30;
/** An answer with no income and no comparable listing with income is kept this long instead (AirDNA may have no data for it yet). */
export const AIRDNA_EMPTY_TTL_DAYS = 1;
export const AIRDNA_HOST = "airdna1.p.rapidapi.com";
const ENDPOINT = `https://${AIRDNA_HOST}/rentalizer`;
/** Wait before the one retry. */
export const RETRY_WAIT_MS = 1500;
/** The whole adapter call (cache read, both outside calls, the wait and the cache write) must fit inside this. */
export const TOTAL_BUDGET_MS: number = VENDOR_BUDGET_MS.airdna;
/** One outside call may take this long (so a quick failure still leaves room for the one retry). */
export const CALL_TIMEOUT_MS = 4500;
/** A retry is worth trying only if at least this long is left after the wait. */
const MIN_RETRY_MS = 1000;
/** An outside call is not started with less than this left. */
const MIN_CALL_MS = 500;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A public listing page on airbnb.com or airbnb.com.au; anything else is not kept. */
const LISTING_URL = /^https:\/\/([a-z0-9-]+\.)*airbnb\.(com|com\.au)\//i;

/**
 * The fields of an AirDNA rentalizer answer the report uses. Throws VendorError for a body that is not the expected shape (no statistics and no
 * comps at all). A comp keeps its revenue from `comps_revenues` at the same position, as the CRM does.
 */
export function parseRentalizer(body: unknown): ShortStayEstimate {
  const root = body as { data?: unknown } | null;
  const data = (root && typeof root === "object" && root.data && typeof root.data === "object" ? root.data : root) as Record<string, any> | null;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new VendorError("unexpected response shape");
  const stats = data.property_statistics;
  const rawComps: unknown = data.comps;
  const hasStats = stats !== null && typeof stats === "object";
  if (!hasStats && !Array.isArray(rawComps)) throw new VendorError("unexpected response shape");
  const revenues: unknown[] = Array.isArray(data.comps_revenues) ? data.comps_revenues : [];
  const comps: ShortStayComp[] = (Array.isArray(rawComps) ? rawComps : []).map((c: any, i: number) => {
    const url = c?.airbnb_listing_url ?? c?.listing_url;
    const revenue = num(revenues[i]);
    return {
      id: String(c?.airbnb_property_id ?? c?.platforms?.airbnb_property_id ?? c?.static_combined_property_id ?? i),
      distance_m: num(c?.distance_meters),
      bedrooms: num(c?.bedrooms),
      bathrooms: num(c?.bathrooms),
      revenue: revenue === null ? null : Math.round(revenue),
      reviews: num(c?.reviews),
      url: typeof url === "string" && LISTING_URL.test(url) ? url : null,
    };
  });
  const annual = num(stats?.revenue?.ltm);
  const level = stats?.confidence_score?.level;
  return {
    annual_revenue: annual === null ? null : Math.round(annual),
    occupancy: num(stats?.occupancy?.ltm),
    adr: num(stats?.adr?.ltm),
    confidence_level: typeof level === "string" && level.trim() ? level.trim() : null,
    confidence_score: num(stats?.confidence_score?.score),
    total_comps: num(stats?.total_comps),
    used_bedrooms: num(data.property_details?.bedrooms),
    used_bathrooms: num(data.property_details?.bathrooms),
    comps,
  };
}

/** The request URL: always the bedrooms and bathrooms the report uses, whole numbers of at least 1. */
export function buildRentalizerUrl(q: Pick<ShortStayQuery, "address" | "bedrooms" | "bathrooms">): string {
  const p = new URLSearchParams({ address: q.address, currency: "native" });
  p.set("bedrooms", String(wholeNumber(q.bedrooms)));
  p.set("bathrooms", String(wholeNumber(q.bathrooms)));
  return `${ENDPOINT}?${p.toString()}`;
}

/** The same whole numbers the request asks for, so two queries that send the same request share a row. */
const wholeNumber = (n: number) => Math.max(1, Math.round(n));

/** Vendor, the address point snapped to about 100 m, bedrooms and bathrooms. The address pid is not part of it. */
export const airdnaCacheKey = (q: Pick<ShortStayQuery, "lat" | "lon" | "bedrooms" | "bathrooms">) =>
  cacheKey(AIRDNA_VENDOR, q.lat, q.lon, `b${wholeNumber(q.bedrooms)}:ba${wholeNumber(q.bathrooms)}`);

/** True when the answer holds no income of AirDNA's own and no comparable listing with income: worth keeping for a day only. */
export const isEmptyEstimate = (e: ShortStayEstimate): boolean => !(e.annual_revenue !== null && e.annual_revenue > 0) && !e.comps.some((c) => c.revenue !== null && c.revenue > 0);

const retryable = (err: unknown) => err instanceof VendorError && err.status !== undefined && (err.status === 429 || err.status >= 500);

export interface FetchShortStayOptions {
  db: Db;
  /** From RAPIDAPI_KEY. Without it the adapter reports `no_key` and makes no call. */
  key: string | undefined;
  fetchFn: FetchFn;
  query: ShortStayQuery;
  now?: () => Date;
  /** The most one outside call may take. Default 4.5 s. */
  timeout_ms?: number;
  /** Replaced in tests so the retry wait costs nothing. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock used for the time budget; replaced in tests. */
  clock?: () => number;
  /** The whole call's budget; default 6 s. Replaced in tests. */
  budget_ms?: number;
}

export async function fetchShortStay(opts: FetchShortStayOptions): Promise<VendorResult<ShortStayEstimate>> {
  const { db, key, fetchFn, query } = opts;
  if (!key) return { ok: false, reason: "no_key" };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const clock = opts.clock ?? Date.now;
  const budget = opts.budget_ms ?? TOTAL_BUDGET_MS;
  const perCall = opts.timeout_ms ?? CALL_TIMEOUT_MS;
  const started = clock(); // the budget includes the cache read
  const url = buildRentalizerUrl(query);
  const init: RequestInit = { headers: { "x-rapidapi-key": key, "x-rapidapi-host": AIRDNA_HOST } };
  // The remaining monthly quota is worth logging; the key never is. A 429 with none remaining is not retried.
  let quotaRemaining: number | null = null;
  const onResponse = (res: Response) => {
    const remaining = res.headers.get("x-ratelimit-requests-remaining");
    const limit = res.headers.get("x-ratelimit-requests-limit");
    quotaRemaining = remaining === null ? null : num(remaining);
    if (remaining !== null) log("info", "airdna_quota", { status: res.status, remaining: num(remaining), limit: num(limit) });
  };
  return cached({
    db,
    vendor: AIRDNA_VENDOR,
    key: airdnaCacheKey(query),
    ttl_days: (e) => (isEmptyEstimate(e) ? AIRDNA_EMPTY_TTL_DAYS : AIRDNA_TTL_DAYS),
    now: opts.now,
    negative_ttl_seconds: NEGATIVE_CACHE_SECONDS,
    budget_ms: budget,
    load: async () => {
      const first = budget - (clock() - started);
      if (first < MIN_CALL_MS) throw new VendorError("no time left for the call");
      try {
        return parseRentalizer(await fetchJson(fetchFn, url, init, Math.min(perCall, first), onResponse));
      } catch (err) {
        if (!retryable(err)) throw err;
        if (err instanceof VendorError && err.status === 429 && quotaRemaining === 0) throw err;
        const left = budget - (clock() - started) - RETRY_WAIT_MS;
        if (left < MIN_RETRY_MS) throw err;
        await sleep(RETRY_WAIT_MS);
        return parseRentalizer(await fetchJson(fetchFn, url, init, Math.min(perCall, left), onResponse));
      }
    },
  });
}

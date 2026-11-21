// The AirDNA rentalizer adapter: a fake fetch and an in-process database. No test reaches the network, and the key is a made-up string that must
// never appear in a cache row, a log line or an error.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../testing/db";
import { fakeFetch, json } from "../testing/fake-vendors";
import { FAILED_MARKER, NEGATIVE_CACHE_SECONDS, USER_AGENT } from "./cache";
import { AIRDNA_HOST, airdnaCacheKey, buildRentalizerUrl, fetchShortStay, isEmptyEstimate, parseRentalizer, RETRY_WAIT_MS, TOTAL_BUDGET_MS } from "./airdna";
import { createVendors } from "./index";
import type { ShortStayQuery } from "./types";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb({ devSeed: false }));
});
afterAll(() => close());
/** The cache rows that hold an answer (not a failure marker). */
const dataRows = () => db.query(`SELECT 1 FROM vendor_cache WHERE NOT (payload ? '${FAILED_MARKER}')`);
const markerRows = () => db.query(`SELECT cache_key, EXTRACT(EPOCH FROM (expires_at - fetched_at)) AS seconds FROM vendor_cache WHERE payload ? '${FAILED_MARKER}'`);

afterEach(async () => {
  await db.query("DELETE FROM vendor_cache");
  vi.restoreAllMocks();
});

const KEY = "rapid-key-do-not-leak-9f3a";
const QUERY: ShortStayQuery = { gnaf_pid: "GAVIC720519114", lat: -37.8142, lon: 144.9528, address: "310/628 Flinders St, Docklands VIC 3008, Australia", bedrooms: 2, bathrooms: 2 };

/** A small answer that follows the field names the City Retreats CRM reads (property_statistics, property_details, comps, comps_revenues). */
const body = (over: Record<string, unknown> = {}) => ({
  data: {
    property_details: { bedrooms: 2, bathrooms: 2, accommodates: 4, address: "310/628 Flinders St", location: { lat: -37.82, lng: 144.95 } },
    property_statistics: {
      revenue: { ltm: 60812.4 },
      occupancy: { ltm: 0.72 },
      adr: { ltm: 231.4 },
      confidence_score: { level: "High", score: 85 },
      total_comps: 12,
    },
    comps: [
      { airbnb_property_id: 111, title: "Bright Docklands 2BR", distance_meters: 180, bedrooms: 2, bathrooms: 2, reviews: 64, accommodates: 4, rating: 4.9, cover_img: "https://a0.muscache.com/im/x.jpg", airbnb_listing_url: "https://www.airbnb.com.au/rooms/111", location: { lat: -37.82, lng: 144.95 } },
      { platforms: { airbnb_property_id: 222 }, title: "Harbour view", distance_meters: 320, bedrooms: 2, bathrooms: 1, reviews: 8, listing_url: "https://evil.example.com/rooms/222" },
      { static_combined_property_id: "abc", title: "No revenue", distance_meters: null, bedrooms: 1, bathrooms: 1, reviews: null },
    ],
    comps_revenues: [58000.6, 41000, null],
    ...over,
  },
});

describe("parseRentalizer", () => {
  it("reads the CRM's fields: AirDNA's income, occupancy, nightly rate, confidence, comp count, the size it used, and the comps with revenue by position", () => {
    const e = parseRentalizer(body());
    expect(e).toMatchObject({ annual_revenue: 60812, occupancy: 0.72, adr: 231.4, confidence_level: "High", confidence_score: 85, total_comps: 12, used_bedrooms: 2, used_bathrooms: 2 });
    expect(e.comps).toEqual([
      { id: "111", distance_m: 180, bedrooms: 2, bathrooms: 2, revenue: 58001, reviews: 64, url: "https://www.airbnb.com.au/rooms/111" },
      { id: "222", distance_m: 320, bedrooms: 2, bathrooms: 1, revenue: 41000, reviews: 8, url: null }, // a link that is not Airbnb's own is not kept
      { id: "abc", distance_m: null, bedrooms: 1, bathrooms: 1, revenue: null, reviews: null, url: null },
    ]);
  });

  it("keeps no photo, title, rating or location of a comparable listing", () => {
    const text = JSON.stringify(parseRentalizer(body()));
    expect(text).not.toMatch(/muscache|Bright Docklands|Harbour view|cover_img|rating|lat|lng|title/);
  });

  it("accepts an answer without the data wrapper, tolerates missing fields, and reads stats-only or comps-only answers", () => {
    expect(parseRentalizer(body().data).annual_revenue).toBe(60812);
    const statsOnly = parseRentalizer({ data: { property_statistics: {} } });
    expect(statsOnly).toMatchObject({ annual_revenue: null, confidence_level: null, comps: [] });
    expect(parseRentalizer({ data: { comps: [] } }).comps).toEqual([]);
  });

  it.each([[null], ["text"], [[]], [{}], [{ data: { hello: "world" } }], [{ code: "authentication_unavailable", error: "Service temporarily unavailable" }]])("throws for a body of the wrong shape (%j)", (b) => {
    expect(() => parseRentalizer(b)).toThrow(/unexpected response shape/);
  });
});

describe("buildRentalizerUrl", () => {
  it("uses the rentalizer path, the native currency and always the bedrooms and bathrooms (whole numbers of at least 1)", () => {
    const u = new URL(buildRentalizerUrl({ address: "1 A St, Docklands VIC 3008, Australia", bedrooms: 2.4, bathrooms: 0 }));
    expect(u.origin + u.pathname).toBe(`https://${AIRDNA_HOST}/rentalizer`);
    expect(u.searchParams.get("address")).toBe("1 A St, Docklands VIC 3008, Australia");
    expect(u.searchParams.get("currency")).toBe("native");
    expect(u.searchParams.get("bedrooms")).toBe("2");
    expect(u.searchParams.get("bathrooms")).toBe("1");
  });
});

describe("AirDNA adapter", () => {
  const make = (f: ReturnType<typeof fakeFetch>, extra: { sleep?: (ms: number) => Promise<void>; timeout_ms?: number; now?: () => Date } = {}) =>
    createVendors({ db, env: { RAPIDAPI_KEY: KEY }, fetch: f, sleep: extra.sleep ?? (async () => {}), timeout_ms: extra.timeout_ms, now: extra.now });

  it("returns the parsed estimate and sends the key and host in headers only, with the descriptive User-Agent", async () => {
    const f = fakeFetch({ "airdna1.p.rapidapi.com": () => json(body()) });
    const r = await make(f).shortStay(QUERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cached).toBe(false);
    expect(r.data.annual_revenue).toBe(60812);
    expect(f.calls).toHaveLength(1);
    const h = f.calls[0].init?.headers as Record<string, string>;
    expect(h["x-rapidapi-key"]).toBe(KEY);
    expect(h["x-rapidapi-host"]).toBe("airdna1.p.rapidapi.com");
    expect(h["user-agent"]).toBe(USER_AGENT);
    expect(f.calls[0].url).not.toContain(KEY);
    const u = new URL(f.calls[0].url);
    expect(u.searchParams.get("bedrooms")).toBe("2");
    expect(u.searchParams.get("bathrooms")).toBe("2");
    expect(u.searchParams.get("currency")).toBe("native");
  });

  it("caches for 30 days by the snapped point, bedrooms and bathrooms, with no principal and without the key, and a second call makes no outside call", async () => {
    const f = fakeFetch({ rentalizer: () => json(body()) });
    const v = make(f);
    await v.shortStay(QUERY);
    const rows = await db.query("SELECT cache_key, vendor, principal_id, payload::text AS payload, EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cache_key: "airdna_rentalizer:-37.814,144.953:b2:ba2", vendor: "airdna_rentalizer", principal_id: null });
    expect(rows[0].cache_key).not.toContain("GAVIC");
    expect(Number(rows[0].ttl_days)).toBe(30);
    expect(rows[0].payload).not.toContain(KEY);
    expect(rows[0].payload).not.toMatch(/muscache|Bright Docklands/);
    // Another address pid and another spelling on the same block (about 25 m away) share the row: one paid call for the block.
    const again = await v.shortStay({ ...QUERY, gnaf_pid: "GAVIC720519999", lat: QUERY.lat + 0.0002, lon: QUERY.lon + 0.0002, address: "a different spelling of a neighbouring address" });
    expect(again.ok && again.cached).toBe(true);
    expect(again.ok && again.data.annual_revenue).toBe(60812);
    expect(f.calls).toHaveLength(1);
  });

  it("a different bedroom or bathroom count, or a point in another 100 m cell, is another cache entry and another call", async () => {
    const f = fakeFetch({ rentalizer: () => json(body()) });
    const v = make(f);
    await v.shortStay(QUERY);
    await v.shortStay({ ...QUERY, bedrooms: 1 });
    await v.shortStay({ ...QUERY, bathrooms: 1 });
    await v.shortStay({ ...QUERY, lat: QUERY.lat + 0.01 });
    expect(f.calls).toHaveLength(4);
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(4);
    expect(airdnaCacheKey({ lat: -37.81421, lon: 144.95283, bedrooms: 2.4, bathrooms: 1.6 })).toBe(airdnaCacheKey({ lat: -37.81399, lon: 144.95301, bedrooms: 2, bathrooms: 2 }));
  });

  it("refetches once the 30 day row has expired", async () => {
    const f = fakeFetch({ rentalizer: () => json(body()) });
    let now = new Date("2026-11-01T00:00:00Z");
    const v = make(f, { now: () => now });
    await v.shortStay(QUERY);
    now = new Date("2026-11-30T00:00:00Z");
    await v.shortStay(QUERY);
    expect(f.calls).toHaveLength(1);
    now = new Date("2026-12-02T00:00:00Z");
    await v.shortStay(QUERY);
    expect(f.calls).toHaveLength(2);
  });

  it("without a key it reports no_key and makes no outside call", async () => {
    const f = fakeFetch({});
    for (const env of [{}, { RAPIDAPI_KEY: "   " }]) {
      expect(await createVendors({ db, env, fetch: f }).shortStay(QUERY)).toEqual({ ok: false, reason: "no_key" });
    }
    expect(f.calls).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
  });

  it.each([
    ["a 404", () => json({ message: "not found" }, 404)],
    ["a 401", () => json({ message: "Invalid API key" }, 401)],
    ["a body that is not JSON", () => new Response("<html>nope</html>", { status: 200 })],
    ["JSON of the wrong shape", () => json({ hello: "world" })],
  ])("%s is unavailable, is not retried, is never cached as data and is remembered as a failure for 10 minutes", async (_name, answer) => {
    const f = fakeFetch({ rentalizer: answer });
    const sleep = vi.fn(async () => {});
    const v = make(f, { sleep });
    expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(await dataRows()).toHaveLength(0);
    const [marker] = await markerRows();
    expect(Number(marker.seconds)).toBe(NEGATIVE_CACHE_SECONDS);
    expect(NEGATIVE_CACHE_SECONDS).toBe(600);
    // A second request, and a crawler's hundredth, make no paid call while the marker lives.
    for (let i = 0; i < 3; i++) expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
  });

  it("a 503 (AirDNA's authentication_unavailable) is retried once after about 1.5 s, and a success then is returned and cached", async () => {
    const answers = [() => json({ code: "authentication_unavailable", error: "Service temporarily unavailable" }, 503), () => json(body())];
    const f = fakeFetch({ rentalizer: () => answers.shift()!() });
    const sleep = vi.fn(async (_ms: number) => {});
    const r = await make(f, { sleep }).shortStay(QUERY);
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(RETRY_WAIT_MS);
    expect(RETRY_WAIT_MS).toBe(1500);
    expect(await dataRows()).toHaveLength(1);
    expect(await markerRows()).toHaveLength(0);
  });

  it.each([[429], [500], [503]])("a %s twice gives up after exactly two calls (never a loop), is unavailable, is not cached as data, and the next request makes no call", async (status) => {
    const f = fakeFetch({ rentalizer: () => json({ message: "You have exceeded the rate limit per second" }, status) });
    const sleep = vi.fn(async () => {});
    const v = make(f, { sleep });
    expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(await dataRows()).toHaveLength(0);
    expect(await markerRows()).toHaveLength(1);
    expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(2);
  });

  it("a 429 whose quota header says no requests remain is not retried at all", async () => {
    const f = fakeFetch({ rentalizer: () => new Response("{}", { status: 429, headers: { "x-ratelimit-requests-remaining": "0", "x-ratelimit-requests-limit": "3000" } }) });
    const sleep = vi.fn(async () => {});
    expect(await make(f, { sleep }).shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(await markerRows()).toHaveLength(1);
  });

  it("a 429 with quota left (a per-second limit) is still retried once", async () => {
    const answers = [() => new Response("{}", { status: 429, headers: { "x-ratelimit-requests-remaining": "2500" } }), () => json(body())];
    const f = fakeFetch({ rentalizer: () => answers.shift()!() });
    const r = await make(f).shortStay(QUERY);
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(2);
  });

  it("a timeout is unavailable, is not retried, is never cached as data and is remembered as a failure", async () => {
    const f = fakeFetch({ rentalizer: () => new Promise<Response>(() => {}) });
    const v = make(f, { timeout_ms: 25 });
    expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
    expect(await dataRows()).toHaveLength(0);
    expect(await markerRows()).toHaveLength(1);
    expect(await v.shortStay(QUERY)).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
  });

  it("the failure marker expires after 10 minutes and the vendor is asked again", async () => {
    let now = new Date("2026-11-21T00:00:00Z");
    const answers = [() => json({ message: "x" }, 500), () => json({ message: "x" }, 500), () => json(body())];
    const f = fakeFetch({ rentalizer: () => answers.shift()!() });
    const v = make(f, { now: () => now });
    expect((await v.shortStay(QUERY)).ok).toBe(false); // 2 calls (one retry)
    expect(f.calls).toHaveLength(2);
    now = new Date("2026-11-21T00:09:00Z");
    expect((await v.shortStay(QUERY)).ok).toBe(false);
    expect(f.calls).toHaveLength(2);
    now = new Date("2026-11-21T00:11:00Z");
    const r = await v.shortStay(QUERY);
    expect(r.ok && r.cached).toBe(false);
    expect(f.calls).toHaveLength(3);
  });

  it("an answer with no income and no comparable listing with income is cached for 1 day, not 30", async () => {
    const empty = { data: { property_statistics: { revenue: { ltm: null }, confidence_score: { level: "Low", score: 10 } }, comps: [], comps_revenues: [] } };
    expect(isEmptyEstimate(parseRentalizer(empty))).toBe(true);
    expect(isEmptyEstimate(parseRentalizer(body()))).toBe(false);
    expect(isEmptyEstimate(parseRentalizer({ data: { property_statistics: {}, comps: [{ airbnb_property_id: 1 }], comps_revenues: [0] } }))).toBe(true);
    expect(isEmptyEstimate(parseRentalizer({ data: { property_statistics: {}, comps: [{ airbnb_property_id: 1 }], comps_revenues: [30000] } }))).toBe(false);
    const f = fakeFetch({ rentalizer: () => json(empty) });
    const r = await make(f).shortStay(QUERY);
    expect(r.ok).toBe(true);
    const [row] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(Number(row.ttl_days)).toBe(1);
  });

  it("the whole call, cache read and write included, is held to the 6 s budget: a hung vendor or database is unavailable by then", async () => {
    expect(TOTAL_BUDGET_MS).toBe(6000);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // A vendor that hangs, with a long per-call limit: only the budget ends the call.
    const hang = fakeFetch({ rentalizer: () => new Promise<Response>(() => {}) });
    const t0 = Date.now();
    expect(await fetchShortStay({ db, key: KEY, fetchFn: hang, query: QUERY, timeout_ms: 60_000, budget_ms: 60 })).toEqual({ ok: false, reason: "unavailable" });
    expect(Date.now() - t0).toBeLessThan(1500);
    // A database that hangs.
    const slowDb = { query: () => new Promise<never[]>(() => {}) };
    const f = fakeFetch({ rentalizer: () => json(body()) });
    expect(await fetchShortStay({ db: slowDb, key: KEY, fetchFn: f, query: QUERY, budget_ms: 60 })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("does not retry when too little of the time budget is left (the budget includes the cache read)", async () => {
    let t = 0;
    const clock = () => t;
    // The first call "takes" 5 s of the 6 s budget before it fails: the wait and a second call no longer fit.
    const f = fakeFetch({
      rentalizer: () => {
        t += 5000;
        return json({ error: "Service temporarily unavailable" }, 503);
      },
    });
    const sleep = vi.fn(async () => {});
    const r = await fetchShortStay({ db, key: KEY, fetchFn: f, query: QUERY, clock, sleep });
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("makes no outside call when the cache read has already used up the budget", async () => {
    let t = 0;
    const clock = () => (t += 5800);
    const f = fakeFetch({ rentalizer: () => json(body()) });
    expect(await fetchShortStay({ db, key: KEY, fetchFn: f, query: QUERY, clock, sleep: async () => {} })).toEqual({ ok: false, reason: "unavailable" });
    expect(f.calls).toHaveLength(0);
  });

  it("the key never appears in a log line, a cache row or an error, whatever the answer", async () => {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    const answers: (() => Response | Promise<Response>)[] = [() => json({ message: `bad key ${KEY}` }, 403), () => json(body()), () => new Response(`oops ${KEY}`, { status: 200 })];
    for (const answer of answers) {
      await db.query("DELETE FROM vendor_cache");
      const r = await make(fakeFetch({ rentalizer: answer })).shortStay(QUERY);
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
    const f = fakeFetch({ rentalizer: () => Promise.reject(new Error(`connect failed with ${KEY}`)) });
    await db.query("DELETE FROM vendor_cache");
    expect(JSON.stringify(await make(f).shortStay(QUERY))).not.toContain(KEY);
    expect(lines.join("\n")).not.toContain(KEY);
    expect(JSON.stringify(await db.query("SELECT * FROM vendor_cache"))).not.toContain(KEY);
  });

  it("logs the remaining monthly quota from the rate limit headers, without the key", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    const f = fakeFetch({ rentalizer: () => new Response(JSON.stringify(body()), { status: 200, headers: { "x-ratelimit-requests-remaining": "2987", "x-ratelimit-requests-limit": "3000" } }) });
    await make(f).shortStay(QUERY);
    const quota = lines.map((l) => JSON.parse(l)).find((l) => l.event === "airdna_quota");
    expect(quota).toMatchObject({ remaining: 2987, limit: 3000, status: 200 });
    expect(lines.join("\n")).not.toContain(KEY);
  });
});

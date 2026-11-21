// The two vendor adapters (Mapillary, Wikimedia Commons) and the cache helper, with a fake fetch and an in-process database. No test reaches the network.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../testing/db";
import { fakeFetch, json } from "../testing/fake-vendors";
import { cacheKey, cached, FAILED_MARKER, MAX_CACHE_DAYS, USER_AGENT } from "./cache";
import { createVendors } from "./index";
import { parseMapillary } from "./mapillary";
import { parseWikimedia, stripHtml, WIKIMEDIA_MAX_KEPT, WIKIMEDIA_SEARCH_LIMIT } from "./wikimedia";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb({ devSeed: false }));
});
afterAll(() => close());
afterEach(async () => {
  await db.query("DELETE FROM vendor_cache");
  vi.restoreAllMocks();
});

const LAT = -37.8142;
const LON = 144.9528;
const TOKEN = "MLY|test-token-do-not-leak";

const mapillaryBody = {
  data: [
    { id: "111", captured_at: Date.UTC(2026, 2, 1), compass_angle: 10, is_pano: false, creator: { username: "alice", id: "1" }, thumb_1024_url: "https://scontent.example.net/a.jpg?sig=1", geometry: { type: "Point", coordinates: [144.9529, -37.8143] } },
    { id: "222", captured_at: Date.UTC(2025, 5, 1), compass_angle: 200, is_pano: true, creator: { username: "bob", id: "2" }, thumb_1024_url: "https://scontent.example.net/b.jpg", geometry: { coordinates: [144.9529, -37.8143] } },
    { id: "333", captured_at: Date.UTC(2024, 5, 1), is_pano: false, creator: {}, thumb_1024_url: "https://scontent.example.net/c.jpg", geometry: { coordinates: [144.9529, -37.8143] } },
    { id: "444", captured_at: Date.UTC(2024, 5, 1), is_pano: false, creator: { username: "dan" }, geometry: { coordinates: [144.9529, -37.8143] } },
  ],
};

const commonsPage = (title: string, extra: Record<string, unknown> = {}, meta: Record<string, string> = {}, mime = "image/jpeg") => ({
  title: `File:${title}`,
  coordinates: [{ lat: -37.8145, lon: 144.953 }],
  imageinfo: [
    {
      thumburl: `https://upload.wikimedia.org/thumb/${title}/640px.jpg`,
      url: `https://upload.wikimedia.org/${title}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`,
      mime,
      extmetadata: {
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' },
        ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { value: v }])),
      },
      ...extra,
    },
  ],
});

describe("Mapillary adapter", () => {
  it("returns usable images (no panoramas, creator and thumbnail required) with the source page link", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json(mapillaryBody) });
    const r = await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f }).streetImages(LAT, LON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((i) => i.id)).toEqual(["111"]);
    expect(r.data[0]).toMatchObject({ creator: "alice", captured_at: "2026-03-01T00:00:00.000Z", compass_angle: 10, source_url: "https://www.mapillary.com/app/?pKey=111" });
    expect(r.cached).toBe(false);
  });

  it("asks for a bounding box under 0.01 degrees square, sends the token in an Authorization header (never in the URL) and the descriptive User-Agent, and caches without the token", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json(mapillaryBody) });
    await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f }).streetImages(LAT, LON);
    expect(f.calls).toHaveLength(1);
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(f.calls[0].url).not.toContain(TOKEN);
    expect(f.calls[0].url).not.toContain(encodeURIComponent(TOKEN));
    expect((f.calls[0].init?.headers as Record<string, string>).authorization).toBe(`OAuth ${TOKEN}`);
    const [w, s, e, n] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(e - w).toBeLessThan(0.01);
    expect(n - s).toBeLessThan(0.01);
    expect(url.searchParams.get("limit")).toBe("200");
    expect((f.calls[0].init?.headers as Record<string, string>)["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("VicProp/1.0 (+https://vicprop.agenticapps.workers.dev)");
    const rows = await db.query("SELECT cache_key, vendor, principal_id, payload::text AS payload, EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(rows).toHaveLength(1);
    expect(rows[0].principal_id).toBeNull();
    expect(rows[0].vendor).toBe("mapillary");
    expect(rows[0].payload).not.toContain(TOKEN);
    expect(rows[0].cache_key).not.toContain(TOKEN);
    expect(Number(rows[0].ttl_days)).toBeLessThanOrEqual(7);
  });

  it("serves a second call for the same block from the cache with no outside call", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json(mapillaryBody) });
    const v = createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f });
    await v.streetImages(LAT, LON);
    const again = await v.streetImages(LAT + 0.0002, LON + 0.0002); // about 25 m away: the same 100 m cell
    expect(f.calls).toHaveLength(1);
    expect(again.ok && again.cached).toBe(true);
    expect(again.ok && again.data.map((i) => i.id)).toEqual(["111"]);
  });

  it("refetches once the cached row has expired", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json(mapillaryBody) });
    let now = new Date("2026-11-21T00:00:00Z");
    const v = createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f, now: () => now });
    await v.streetImages(LAT, LON);
    now = new Date("2026-11-23T00:00:00Z");
    expect((await v.streetImages(LAT, LON)).ok && (await v.streetImages(LAT, LON)).ok).toBe(true);
    expect(f.calls).toHaveLength(1); // 2 days: still cached (3 day ttl)
    now = new Date("2026-11-25T00:00:00Z");
    await v.streetImages(LAT, LON);
    expect(f.calls).toHaveLength(2);
  });

  it("without a token it reports no_key and makes no outside call", async () => {
    const f = fakeFetch({});
    const r = await createVendors({ db, env: {}, fetch: f }).streetImages(LAT, LON);
    expect(r).toEqual({ ok: false, reason: "no_key" });
    expect(f.calls).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
  });

  it.each([
    ["a non-200 answer", () => json({ error: { message: "bad" } }, 500)],
    ["a body that is not JSON", () => new Response("<html>nope</html>", { status: 200 })],
    ["JSON of the wrong shape", () => json({ hello: "world" })],
  ])("%s is unavailable, is not cached, and never logs the token", async (_name, answer) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const f = fakeFetch({ "graph.mapillary.com": answer });
    const r = await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f }).streetImages(LAT, LON);
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(TOKEN);
    expect(warn).toHaveBeenCalled();
  });

  it("the token never appears in a log line, an error or a cache row, whatever the answer", async () => {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    const answers: (() => Response | Promise<Response>)[] = [() => json({ error: { message: `bad token ${TOKEN}` } }, 401), () => json(mapillaryBody), () => Promise.reject(new Error(`connect failed with ${TOKEN}`))];
    for (const answer of answers) {
      await db.query("DELETE FROM vendor_cache");
      const r = await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: fakeFetch({ "graph.mapillary.com": answer }) }).streetImages(LAT, LON);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
    expect(lines.join("\n")).not.toContain(TOKEN);
    expect(JSON.stringify(await db.query("SELECT * FROM vendor_cache"))).not.toContain(TOKEN);
  });

  it("an empty list is cached for 1 day, not 3", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json({ data: [] }) });
    await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f }).streetImages(LAT, LON);
    const [row] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(Number(row.ttl_days)).toBe(1);
  });

  it("a call that never answers is unavailable after the time limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const never = () => new Promise<Response>(() => undefined);
    const r = await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: never, timeout_ms: 30 }).streetImages(LAT, LON);
    expect(r).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a network error is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const boom = async () => {
      throw new TypeError(`fetch failed for ${TOKEN}`);
    };
    const warn = vi.spyOn(console, "warn");
    const r = await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: boom }).streetImages(LAT, LON);
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    expect(warn.mock.calls.flat().join(" ")).not.toContain(TOKEN);
  });

  it("parseMapillary rejects a body without a data list", () => {
    expect(() => parseMapillary({})).toThrow();
    expect(parseMapillary({ data: [] })).toEqual([]);
  });
});

describe("Wikimedia Commons adapter", () => {
  const body = {
    query: {
      pages: {
        "1": commonsPage("Flinders_Street_Station.jpg"),
        "2": commonsPage("Noncommercial.jpg", {}, { LicenseShortName: "CC BY-NC 4.0" }),
        "3": commonsPage("NoDerivs.jpg", {}, { LicenseShortName: "CC BY-ND 2.0" }),
        "4": commonsPage("Logo.svg", {}, {}, "image/svg+xml"),
        "5": commonsPage("Docklands_map.jpg"),
        "6": commonsPage("Public_domain_photo.jpg", {}, { LicenseShortName: "Public domain", Artist: "" }),
        "7": commonsPage("No_author_CC.jpg", {}, { Artist: "" }),
        "8": commonsPage("Cc_zero.jpg", {}, { LicenseShortName: "CC0" }),
        "9": commonsPage("Cc_by_au.jpg", {}, { LicenseShortName: "CC BY 3.0 AU" }),
      },
    },
  };

  it("keeps public domain, CC0, CC BY and CC BY-SA photos, strips HTML from the author, and links the description page", async () => {
    const f = fakeFetch({ "commons.wikimedia.org": () => json(body) });
    const r = await createVendors({ db, env: {}, fetch: f }).placeImages(LAT, LON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((i) => i.title).sort()).toEqual(["Cc_by_au.jpg", "Cc_zero.jpg", "Flinders_Street_Station.jpg", "Public_domain_photo.jpg"]);
    const first = r.data.find((i) => i.title === "Flinders_Street_Station.jpg")!;
    expect(first).toMatchObject({ author: "Jane & Co", licence: "CC BY-SA 4.0", source_url: "https://commons.wikimedia.org/wiki/File:Flinders_Street_Station.jpg", lat: -37.8145 });
    expect(r.data.find((i) => i.title === "Public_domain_photo.jpg")!.author).toBe("Author not stated");
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.get("generator")).toBe("geosearch");
    expect(url.searchParams.get("ggsnamespace")).toBe("6");
    expect(url.searchParams.get("iiurlwidth")).toBe("640");
    expect(url.searchParams.get("ggslimit")).toBe("50");
    expect(WIKIMEDIA_SEARCH_LIMIT).toBe(50);
    expect(Number(url.searchParams.get("ggsradius"))).toBeGreaterThanOrEqual(1000);
    const [row] = await db.query("SELECT vendor, principal_id FROM vendor_cache");
    expect(row).toMatchObject({ vendor: "wikimedia_commons", principal_id: null });
  });

  it("a search with no results is an empty list, and a repeat is a cache hit", async () => {
    const f = fakeFetch({ "commons.wikimedia.org": () => json({ batchcomplete: "" }) });
    const v = createVendors({ db, env: {}, fetch: f });
    expect(await v.placeImages(LAT, LON)).toMatchObject({ ok: true, data: [] });
    expect(await v.placeImages(LAT, LON)).toMatchObject({ ok: true, data: [], cached: true });
    expect(f.calls).toHaveLength(1);
  });

  it("an empty answer is cached for 1 day, not 30, and a non-empty one for 30", async () => {
    await createVendors({ db, env: {}, fetch: fakeFetch({ "commons.wikimedia.org": () => json({ batchcomplete: "" }) }) }).placeImages(LAT, LON);
    const [empty] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(Number(empty.ttl_days)).toBe(1);
    await db.query("DELETE FROM vendor_cache");
    await createVendors({ db, env: {}, fetch: fakeFetch({ "commons.wikimedia.org": () => json(body) }) }).placeImages(LAT, LON);
    const [full] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(Number(full.ttl_days)).toBe(30);
  });

  it("caps the photos kept after filtering and keeps the nearest by the search's own rank", () => {
    const pages: Record<string, unknown> = {};
    for (let i = 0; i < 45; i++) pages[String(1000 + i)] = { ...commonsPage(`Photo_${i}.jpg`), index: 45 - i }; // the highest page id is the nearest
    pages["9"] = { ...commonsPage("Logo.svg", {}, {}, "image/svg+xml"), index: 1 };
    const kept = parseWikimedia({ query: { pages } });
    expect(kept).toHaveLength(WIKIMEDIA_MAX_KEPT);
    expect(kept[0].title).toBe("Photo_44.jpg");
    expect(kept.every((i) => i.title.startsWith("Photo_"))).toBe(true);
  });

  it("an API error body, a non-200 answer and bad JSON are unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const answer of [() => json({ error: { code: "x" } }), () => json({}, 503), () => new Response("not json", { status: 200 })]) {
      const r = await createVendors({ db, env: {}, fetch: fakeFetch({ "commons.wikimedia.org": answer }) }).placeImages(LAT, LON);
      expect(r).toEqual({ ok: false, reason: "unavailable" });
    }
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
  });

  it("stripHtml turns the author markup into plain text", () => {
    expect(stripHtml('<span lang="en">A &amp; B <b>C</b></span>')).toBe("A & B C");
    expect(parseWikimedia({ batchcomplete: "" })).toEqual([]);
  });
});

describe("the cache helper (AD-8, AD-4)", () => {
  it("clamps the lifetime to 30 days and keys on the vendor, the snapped point and the parameters", async () => {
    expect(cacheKey("v", -37.81421, 144.95283, "r1")).toBe(cacheKey("v", -37.81399, 144.95301, "r1"));
    expect(cacheKey("v", -37.8142, 144.9528, "r1")).not.toBe(cacheKey("v", -37.8142, 144.9528, "r2"));
    expect(cacheKey("a", -37.8142, 144.9528)).not.toBe(cacheKey("b", -37.8142, 144.9528));
    const r = await cached({ db, vendor: "t", key: "t:1", ttl_days: 365, load: async () => ({ x: 1 }) });
    expect(r).toMatchObject({ ok: true, cached: false, data: { x: 1 } });
    const [row] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache WHERE cache_key = 't:1'");
    expect(Number(row.ttl_days)).toBe(MAX_CACHE_DAYS);
  });

  it("the lifetime can depend on the answer, in fractions of a day", async () => {
    await cached({ db, vendor: "t", key: "t:fn", ttl_days: (d: number[]) => (d.length === 0 ? 0.5 : 10), load: async () => [] as number[] });
    const [row] = await db.query("SELECT EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 3600 AS hours FROM vendor_cache WHERE cache_key = 't:fn'");
    expect(Number(row.hours)).toBe(12);
  });

  it("with negative_ttl_seconds a failed load leaves a short marker: the next call is unavailable with no load, and the marker is never data", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let now = new Date("2026-11-21T00:00:00Z");
    const load = vi.fn(async (): Promise<number> => {
      throw new Error("boom");
    });
    const run = () => cached({ db, vendor: "t", key: "t:neg", ttl_days: 30, now: () => now, negative_ttl_seconds: 600, load });
    expect(await run()).toEqual({ ok: false, reason: "unavailable" });
    expect(load).toHaveBeenCalledTimes(1);
    const [row] = await db.query("SELECT payload, EXTRACT(EPOCH FROM (expires_at - fetched_at)) AS seconds FROM vendor_cache WHERE cache_key = 't:neg'");
    expect(row.payload).toEqual({ [FAILED_MARKER]: true });
    expect(Number(row.seconds)).toBe(600);
    now = new Date("2026-11-21T00:09:00Z");
    expect(await run()).toEqual({ ok: false, reason: "unavailable" });
    expect(load).toHaveBeenCalledTimes(1);
    now = new Date("2026-11-21T00:11:00Z"); // the marker has expired: the vendor is tried again
    expect(await run()).toEqual({ ok: false, reason: "unavailable" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("without negative_ttl_seconds a failure leaves nothing, and a success replaces an expired marker", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await cached({ db, vendor: "t", key: "t:none", ttl_days: 1, load: async (): Promise<number> => { throw new Error("x"); } });
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
    let now = new Date("2026-11-21T00:00:00Z");
    await cached({ db, vendor: "t", key: "t:swap", ttl_days: 1, now: () => now, negative_ttl_seconds: 60, load: async (): Promise<object> => { throw new Error("x"); } });
    now = new Date("2026-11-21T00:05:00Z");
    expect(await cached({ db, vendor: "t", key: "t:swap", ttl_days: 1, now: () => now, negative_ttl_seconds: 60, load: async () => ({ ok: 1 }) })).toMatchObject({ ok: true, data: { ok: 1 }, cached: false });
  });

  it("budget_ms ends the whole call (a slow load) as unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const t0 = Date.now();
    const r = await cached({ db, vendor: "t", key: "t:slow", ttl_days: 1, budget_ms: 40, load: () => new Promise<number>(() => undefined) });
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("budget_ms also covers a slow cache read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const slow = { query: () => new Promise<never[]>(() => undefined) };
    const r = await cached({ db: slow, vendor: "t", key: "t:db", ttl_days: 1, budget_ms: 40, load: async () => 1 });
    expect(r).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a cache write problem never fails the call", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = { query: async () => { throw new Error("db down"); } };
    const r = await cached({ db: broken, vendor: "t", key: "t:2", ttl_days: 1, load: async () => 5 });
    expect(r).toMatchObject({ ok: true, data: 5 });
  });
});

// The three vendor adapters and the cache helper, with a fake fetch and an in-process database. No test reaches the network.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../testing/db";
import { fakeFetch, json } from "../testing/fake-vendors";
import { cacheKey, cached, MAX_CACHE_DAYS, USER_AGENT } from "./cache";
import { createVendors } from "./index";
import { parseMapillary } from "./mapillary";
import { categoryOf, parseOverpass } from "./overpass";
import { parseWikimedia, stripHtml } from "./wikimedia";

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

  it("asks for a bounding box under 0.01 degrees square, sends the token and the descriptive User-Agent, and caches without the token", async () => {
    const f = fakeFetch({ "graph.mapillary.com": () => json(mapillaryBody) });
    await createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: TOKEN }, fetch: f }).streetImages(LAT, LON);
    expect(f.calls).toHaveLength(1);
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
    const [w, s, e, n] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(e - w).toBeLessThan(0.01);
    expect(n - s).toBeLessThan(0.01);
    expect(url.searchParams.get("limit")).toBe("200");
    expect((f.calls[0].init?.headers as Record<string, string>)["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("VicProp/1.0 (property report tool)");
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

describe("Overpass (OpenStreetMap places) adapter", () => {
  const body = {
    elements: [
      { type: "node", id: 1, lat: -37.8143, lon: 144.9529, tags: { shop: "supermarket", name: "Corner Grocer" } },
      { type: "way", id: 2, center: { lat: -37.815, lon: 144.954 }, tags: { leisure: "park", name: "Little Park" } },
      { type: "node", id: 3, lat: -37.8141, lon: 144.9527, tags: { amenity: "cafe" } },
      { type: "node", id: 4, lat: -37.8141, lon: 144.9527, tags: { amenity: "gym", leisure: "fitness_centre", name: "Gym" } },
      { type: "node", id: 4, lat: -37.8141, lon: 144.9527, tags: { amenity: "gym", name: "Gym" } },
      { type: "node", id: 5, lat: -37.8, lon: 144.9, tags: { highway: "bus_stop" } },
      { type: "way", id: 6, tags: { amenity: "library", name: "No centre" } },
    ],
  };

  it("sends the query by POST with the User-Agent, groups elements into categories, takes ways from their centre, and leaves unnamed places without a name", async () => {
    const f = fakeFetch({ "overpass-api.de": () => json(body) });
    const r = await createVendors({ db, env: {}, fetch: f }).places(LAT, LON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.truncated).toBe(false);
    const by = Object.fromEntries(r.data.places.map((p) => [p.osm_id, p]));
    expect(Object.keys(by).sort()).toEqual(["node/1", "node/3", "node/4", "way/2"]);
    expect(by["node/1"]).toMatchObject({ category: "groceries", name: "Corner Grocer" });
    expect(by["way/2"]).toMatchObject({ category: "parks", lat: -37.815, lon: 144.954 });
    expect(by["node/3"]).toMatchObject({ category: "food", name: null });
    expect(by["node/4"].category).toBe("fitness");
    expect(f.calls[0].init?.method).toBe("POST");
    expect((f.calls[0].init?.headers as Record<string, string>)["user-agent"]).toBe(USER_AGENT);
    const sent = decodeURIComponent(String(f.calls[0].init?.body).replace(/^data=/, ""));
    expect(sent).toContain("[out:json][timeout:20]");
    expect(sent).toContain("around:900");
    expect(sent).toContain("out center tags 400;");
    const [row] = await db.query("SELECT vendor, principal_id, EXTRACT(EPOCH FROM (expires_at - fetched_at)) / 86400 AS ttl_days FROM vendor_cache");
    expect(row).toMatchObject({ vendor: "openstreetmap", principal_id: null });
    expect(Number(row.ttl_days)).toBe(30);
  });

  it("flags a result that hit the element limit", () => {
    const many = { elements: Array.from({ length: 400 }, (_, i) => ({ type: "node", id: i, lat: -37.8, lon: 144.9, tags: { amenity: "cafe" } })) };
    expect(parseOverpass(many).truncated).toBe(true);
  });

  it("maps tags to one category and ignores everything else", () => {
    expect(categoryOf({ shop: "bakery" })).toBe("groceries");
    expect(categoryOf({ amenity: "restaurant" })).toBe("food");
    expect(categoryOf({ leisure: "playground" })).toBe("parks");
    expect(categoryOf({ amenity: "clinic" })).toBe("medical");
    expect(categoryOf({ amenity: "library" })).toBe("library");
    expect(categoryOf({ shop: "jewellery" })).toBeNull();
  });

  it("a timeout, a non-200 answer and bad JSON are unavailable and are not cached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const never = () => new Promise<Response>(() => undefined);
    expect(await createVendors({ db, env: {}, fetch: never, timeout_ms: 30 }).places(LAT, LON)).toEqual({ ok: false, reason: "unavailable" });
    expect(await createVendors({ db, env: {}, fetch: fakeFetch({ overpass: () => json({}, 429) }) }).places(LAT, LON)).toEqual({ ok: false, reason: "unavailable" });
    expect(await createVendors({ db, env: {}, fetch: fakeFetch({ overpass: () => new Response("oops", { status: 200 }) }) }).places(LAT, LON)).toEqual({ ok: false, reason: "unavailable" });
    expect(await db.query("SELECT 1 FROM vendor_cache")).toHaveLength(0);
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

  it("a cache write problem never fails the call", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = { query: async () => { throw new Error("db down"); } };
    const r = await cached({ db: broken, vendor: "t", key: "t:2", ttl_days: 1, load: async () => 5 });
    expect(r).toMatchObject({ ok: true, data: 5 });
  });
});

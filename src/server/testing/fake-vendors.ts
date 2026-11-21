// Test-only: fake vendor adapters and a fake fetch. No test touches the network.
import { UNAVAILABLE_VENDORS, type PlaceImage, type ShortStayComp, type ShortStayEstimate, type StreetImage, type VendorAdapters, type VendorResult } from "../vendors/types";

export const ok = <T>(data: T, as_of = "2026-11-21"): VendorResult<T> => ({ ok: true, data, as_of, cached: false });

export function fakeVendors(over: Partial<VendorAdapters> = {}): VendorAdapters {
  return {
    streetImages: async () => ok([]),
    placeImages: async () => ok([]),
    shortStay: async () => ({ ok: false, reason: "unavailable" }),
    ...over,
  };
}
export { UNAVAILABLE_VENDORS };

const M_PER_DEG = 111_320;
/** A point `north` and `east` metres from a start point (close enough for tests: short distances). */
export const moved = (lat: number, lon: number, north: number, east: number) => ({
  lat: lat + north / M_PER_DEG,
  lon: lon + east / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)),
});

export function streetImage(over: Partial<StreetImage> & { id: string }): StreetImage {
  return {
    captured_at: "2026-03-01T00:00:00.000Z",
    compass_angle: 0,
    creator: "street_walker",
    lat: -37.8,
    lon: 144.95,
    thumb_url: `https://scontent.example.net/${over.id}.jpg?sig=abc`,
    source_url: `https://www.mapillary.com/app/?pKey=${over.id}`,
    ...over,
  };
}

export function placeImage(over: Partial<PlaceImage> & { title: string }): PlaceImage {
  return {
    thumb_url: `https://upload.wikimedia.org/thumb/${encodeURIComponent(over.title)}/640px.jpg`,
    source_url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(over.title)}`,
    author: "Jane Photographer",
    licence: "CC BY-SA 4.0",
    licence_url: "https://creativecommons.org/licenses/by-sa/4.0",
    lat: null,
    lon: null,
    ...over,
  };
}

export function shortStayComp(over: Partial<ShortStayComp> & { id: string }): ShortStayComp {
  return { distance_m: 200, bedrooms: 2, bathrooms: 2, revenue: 50000, reviews: 40, url: `https://www.airbnb.com.au/rooms/${over.id}`, ...over };
}

/** `n` strong comps (revenue 40,000 upwards, 30 reviews) at 100 m intervals, nearest first. */
export function strongComps(n: number, revenue = (i: number) => 40000 + i * 1000): ShortStayComp[] {
  return Array.from({ length: n }, (_, i) => shortStayComp({ id: `c${i + 1}`, distance_m: 100 * (i + 1), revenue: revenue(i), reviews: 30 }));
}

export function shortStayEstimate(over: Partial<ShortStayEstimate> = {}): ShortStayEstimate {
  return {
    annual_revenue: 60800,
    occupancy: 0.72,
    adr: 231,
    confidence_level: "High",
    confidence_score: 85,
    total_comps: 20,
    used_bedrooms: 2,
    used_bathrooms: 2,
    comps: strongComps(8),
    ...over,
  };
}

/** A fake fetch that answers from a list of handlers by URL substring and counts calls. Never touches the network. */
export function fakeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    for (const [part, h] of Object.entries(handlers)) if (url.includes(part)) return h();
    throw new Error(`fakeFetch: no handler for ${url.split("?")[0]}`);
  };
  return Object.assign(fn, { calls });
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Mapillary street-level images (Graph API v4). Imagery is CC BY-SA 4.0 and credited to its creator. The token is read from the environment by
// the caller and is never logged: it is in the request URL, so no error message here contains the URL.
// Thumbnail URLs are signed CDN links whose lifetime Mapillary does not document, so the cache is kept short (3 days).
import { boxAround } from "../geo";
import type { Db } from "../db";
import { cacheKey, cached, fetchJson, SNAP_ERROR_M, snapPoint, VendorError, type FetchFn } from "./cache";
import type { StreetImage, VendorResult } from "./types";

export const MAPILLARY_TTL_DAYS = 3;
/** The layer shows images within this distance of the address; the search adds the snapping margin. */
export const MAPILLARY_RADIUS_M = 150;
const ENDPOINT = "https://graph.mapillary.com/images";
const FIELDS = "id,captured_at,compass_angle,is_pano,creator,thumb_1024_url,geometry";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Keeps the usable images: not panoramas, with a creator to credit, a thumbnail, a capture time and a position. Throws if the body is not the expected shape. */
export function parseMapillary(body: unknown): StreetImage[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new VendorError("unexpected response shape");
  const out: StreetImage[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, any>;
    const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : "";
    const captured = num(r.captured_at) ?? (typeof r.captured_at === "string" ? Date.parse(r.captured_at) : NaN);
    const creator = typeof r.creator?.username === "string" ? r.creator.username.trim() : "";
    const coords = Array.isArray(r.geometry?.coordinates) ? r.geometry.coordinates : [];
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    const thumb = typeof r.thumb_1024_url === "string" && r.thumb_1024_url.startsWith("https://") ? r.thumb_1024_url : "";
    if (!id || !Number.isFinite(captured) || !creator || !thumb || lat === null || lon === null || r.is_pano === true) continue;
    out.push({
      id,
      captured_at: new Date(captured).toISOString(),
      compass_angle: num(r.compass_angle),
      creator,
      lat,
      lon,
      thumb_url: thumb,
      source_url: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(id)}`,
    });
  }
  return out;
}

export async function fetchStreetImages(opts: { db: Db; token: string | undefined; fetchFn: FetchFn; lat: number; lon: number; now?: () => Date; timeout_ms?: number }): Promise<VendorResult<StreetImage[]>> {
  const { db, token, fetchFn, lat, lon } = opts;
  if (!token) return { ok: false, reason: "no_key" };
  const centre = snapPoint(lat, lon);
  return cached({
    db,
    vendor: "mapillary",
    key: cacheKey("mapillary", lat, lon, `r${MAPILLARY_RADIUS_M}`),
    ttl_days: MAPILLARY_TTL_DAYS,
    now: opts.now,
    load: async () => {
      const b = boxAround(centre.lat, centre.lon, MAPILLARY_RADIUS_M + SNAP_ERROR_M);
      const url = `${ENDPOINT}?access_token=${encodeURIComponent(token)}&fields=${FIELDS}&bbox=${b.min_lon},${b.min_lat},${b.max_lon},${b.max_lat}&limit=200`;
      return parseMapillary(await fetchJson(fetchFn, url, {}, opts.timeout_ms));
    },
  });
}

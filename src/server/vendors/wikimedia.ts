// Wikimedia Commons place images (MediaWiki geosearch). Only public domain, CC0, CC BY and CC BY-SA files are kept; each carries its own author
// and licence. Non-photos (SVG, maps, diagrams) are dropped by type and title. The images stay on Wikimedia's servers: only metadata is cached.
import type { Db } from "../db";
import { cacheKey, cached, fetchJson, SNAP_ERROR_M, snapPoint, VendorError, type FetchFn } from "./cache";
import { VENDOR_BUDGET_MS, type PlaceImage, type VendorResult } from "./types";

export const WIKIMEDIA_TTL_DAYS = 30;
/** A search that found no usable photo is kept this long only. */
export const WIKIMEDIA_EMPTY_TTL_DAYS = 1;
/** Files asked for from the geosearch (the filters below drop many), and the most photos kept after filtering. */
export const WIKIMEDIA_SEARCH_LIMIT = 50;
export const WIKIMEDIA_MAX_KEPT = 30;
/** The layer shows photos within this distance; the search adds the snapping margin. */
export const WIKIMEDIA_RADIUS_M = 1000;
const ENDPOINT = "https://commons.wikimedia.org/w/api.php";

/** Licences that allow reuse with credit. Anything else (NC, ND, GFDL only, fair use, unknown) is dropped. */
const OPEN_LICENCE = /^(public domain|pd([- ]|$)|cc0|cc[- ]by([- ]sa)?[- ]\d)/i;
const PUBLIC_DOMAIN = /^(public domain|pd([- ]|$)|cc0)/i;
const NOT_A_PHOTO_TITLE = /\b(map|maps|diagram|plan|logo|coat of arms|flag|chart|locator|icon|signature)\b/i;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&nbsp;": " ", "&apos;": "'" };

/** Plain text from the HTML snippets Commons returns for an author. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|#039|nbsp|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const text = (v: unknown): string => (typeof v === "string" ? stripHtml(v) : "");
const metaValue = (meta: Record<string, any>, key: string): string => text(meta?.[key]?.value);

/** The kept photos, nearest first. Throws if the body is not the expected shape. */
export function parseWikimedia(body: unknown): PlaceImage[] {
  const q = (body as { query?: { pages?: unknown } } | null)?.query;
  // A search with no result has no `query` at all.
  if (q === undefined && body && typeof body === "object" && !("error" in (body as object))) return [];
  const pages = q?.pages;
  if (typeof pages !== "object" || pages === null) throw new VendorError("unexpected response shape");
  const out: PlaceImage[] = [];
  // The geosearch ranks its files by distance in `index`; keep that order so the cap below keeps the nearest.
  const ranked = Object.values(pages as Record<string, any>).sort((a, b) => (typeof a?.index === "number" ? a.index : Infinity) - (typeof b?.index === "number" ? b.index : Infinity));
  for (const p of ranked) {
    const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    if (!info) continue;
    const title = typeof p.title === "string" ? p.title.replace(/^File:/, "") : "";
    const mime = typeof info.mime === "string" ? info.mime : "";
    const thumb = typeof info.thumburl === "string" ? info.thumburl : typeof info.url === "string" ? info.url : "";
    const page = typeof info.descriptionurl === "string" ? info.descriptionurl : "";
    const meta = (info.extmetadata ?? {}) as Record<string, any>;
    const licence = metaValue(meta, "LicenseShortName");
    if (mime !== "image/jpeg" || !/\.jpe?g$/i.test(title) || NOT_A_PHOTO_TITLE.test(title.replace(/[_.\-]+/g, " "))) continue;
    if (!thumb.startsWith("https://") || !page.startsWith("https://commons.wikimedia.org/")) continue;
    if (!OPEN_LICENCE.test(licence)) continue;
    let author = metaValue(meta, "Artist");
    if (!author) {
      if (!PUBLIC_DOMAIN.test(licence)) continue; // a credit is required for CC BY and CC BY-SA
      author = "Author not stated";
    }
    const licenceUrl = text(meta?.LicenseUrl?.value);
    const coord = Array.isArray(p.coordinates) ? p.coordinates[0] : null;
    out.push({
      title,
      thumb_url: thumb,
      source_url: page,
      author,
      licence,
      licence_url: licenceUrl.startsWith("https://") ? licenceUrl : null,
      lat: typeof coord?.lat === "number" ? coord.lat : null,
      lon: typeof coord?.lon === "number" ? coord.lon : null,
    });
  }
  return out.slice(0, WIKIMEDIA_MAX_KEPT);
}

export async function fetchPlaceImages(opts: { db: Db; fetchFn: FetchFn; lat: number; lon: number; now?: () => Date; timeout_ms?: number; budget_ms?: number }): Promise<VendorResult<PlaceImage[]>> {
  const { db, fetchFn, lat, lon } = opts;
  const centre = snapPoint(lat, lon);
  return cached({
    db,
    vendor: "wikimedia_commons",
    key: cacheKey("wikimedia_commons", lat, lon, `r${WIKIMEDIA_RADIUS_M}`),
    ttl_days: (images) => (images.length === 0 ? WIKIMEDIA_EMPTY_TTL_DAYS : WIKIMEDIA_TTL_DAYS),
    now: opts.now,
    budget_ms: opts.budget_ms ?? VENDOR_BUDGET_MS.wikimedia,
    load: async () => {
      const radius = WIKIMEDIA_RADIUS_M + SNAP_ERROR_M;
      const params = new URLSearchParams({
        action: "query",
        generator: "geosearch",
        ggscoord: `${centre.lat}|${centre.lon}`,
        ggsradius: String(radius),
        ggsnamespace: "6",
        ggslimit: String(WIKIMEDIA_SEARCH_LIMIT),
        prop: "imageinfo|coordinates",
        iiprop: "url|extmetadata|mime",
        iiurlwidth: "640",
        format: "json",
        origin: "*",
      });
      return parseWikimedia(await fetchJson(fetchFn, `${ENDPOINT}?${params.toString()}`, {}, opts.timeout_ms ?? VENDOR_BUDGET_MS.wikimedia));
    },
  });
}

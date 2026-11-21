// Vendor adapters (AD-8: the third door). An adapter fetches from one outside service, caches the answer in `vendor_cache` and returns a typed
// result. A layer is handed the adapters through its context and never fetches itself. A failure is a value, never a thrown error, so a
// vendor problem can only ever turn its own layer into a gap (AD-9).

/** `no_key`: the adapter needs a secret that is not set. `unavailable`: timeout, non-200, bad JSON or any network failure. */
export type VendorFailure = "no_key" | "unavailable";

export type VendorResult<T> =
  | { ok: true; data: T; /** ISO date the data was fetched (the cache row's date on a cache hit). */ as_of: string; cached: boolean }
  | { ok: false; reason: VendorFailure };

/** One Mapillary street-level image near a point. Imagery is CC BY-SA 4.0, credited to its creator. */
export interface StreetImage {
  id: string;
  /** ISO 8601 capture time. */
  captured_at: string;
  /** Degrees clockwise from north the camera faced; null when Mapillary has none. */
  compass_angle: number | null;
  creator: string;
  lat: number;
  lon: number;
  /** 1024 px wide thumbnail on Mapillary's CDN (signed, so it can expire). */
  thumb_url: string;
  /** The image's page on mapillary.com. */
  source_url: string;
}

/** One Wikimedia Commons photo near a point, with its own author and licence. */
export interface PlaceImage {
  title: string;
  /** 640 px wide thumbnail on upload.wikimedia.org. */
  thumb_url: string;
  /** The file's description page on commons.wikimedia.org. */
  source_url: string;
  author: string;
  licence: string;
  licence_url: string | null;
  lat: number | null;
  lon: number | null;
}

export interface VendorAdapters {
  /** Mapillary images around the point (the adapter looks wider than the layer needs; the layer filters by true distance). */
  streetImages(lat: number, lon: number): Promise<VendorResult<StreetImage[]>>;
  /** Wikimedia Commons photos around the point. */
  placeImages(lat: number, lon: number): Promise<VendorResult<PlaceImage[]>>;
}

/** What a layer sees when no adapters were handed in (tests, or a caller that did not set them up): every call fails, none touches the network. */
export const UNAVAILABLE_VENDORS: VendorAdapters = {
  streetImages: async () => ({ ok: false, reason: "unavailable" }),
  placeImages: async () => ({ ok: false, reason: "unavailable" }),
};

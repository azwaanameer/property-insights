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

/** One comparable short-stay listing from the AirDNA rentalizer. Only an id, the distance, the size, the annual revenue, the review count and the public link are kept: no photo, title or text. */
export interface ShortStayComp {
  id: string;
  /** Metres from the address, as AirDNA gives it; null when it gives none. */
  distance_m: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** Annual revenue in whole Australian dollars (the request asks for the native currency); null when AirDNA gives none. */
  revenue: number | null;
  reviews: number | null;
  /** The listing's public page on airbnb.com or airbnb.com.au, as AirDNA gives it; null when none. */
  url: string | null;
}

/** The AirDNA rentalizer's answer for one address, parsed from the field names the City Retreats CRM reads. Money is whole Australian dollars. */
export interface ShortStayEstimate {
  /** property_statistics.revenue.ltm: AirDNA's own last-12-months revenue estimate. */
  annual_revenue: number | null;
  /** property_statistics.occupancy.ltm, as a fraction (0.72). */
  occupancy: number | null;
  /** property_statistics.adr.ltm: average nightly rate. */
  adr: number | null;
  /** property_statistics.confidence_score.level ("High", "Medium", "Low") and .score. */
  confidence_level: string | null;
  confidence_score: number | null;
  total_comps: number | null;
  /** The bedrooms and bathrooms AirDNA says it used (property_details); AirDNA assumes 2 and 2 when it is told nothing. */
  used_bedrooms: number | null;
  used_bathrooms: number | null;
  comps: ShortStayComp[];
}

/** What the adapter is asked: the report's own bedrooms and bathrooms are always sent, because AirDNA assumes 2 bed 2 bath when told nothing. */
export interface ShortStayQuery {
  gnaf_pid: string;
  /** The full address as AirDNA geocodes it, e.g. "310/628 Flinders St, Docklands VIC 3008, Australia". */
  address: string;
  bedrooms: number;
  bathrooms: number;
}

export interface VendorAdapters {
  /** Mapillary images around the point (the adapter looks wider than the layer needs; the layer filters by true distance). */
  streetImages(lat: number, lon: number): Promise<VendorResult<StreetImage[]>>;
  /** Wikimedia Commons photos around the point. */
  placeImages(lat: number, lon: number): Promise<VendorResult<PlaceImage[]>>;
  /** The AirDNA rentalizer for one address (RapidAPI, cached up to 30 days by address pid, bedrooms and bathrooms). */
  shortStay(query: ShortStayQuery): Promise<VendorResult<ShortStayEstimate>>;
}

/** What a layer sees when no adapters were handed in (tests, or a caller that did not set them up): every call fails, none touches the network. */
export const UNAVAILABLE_VENDORS: VendorAdapters = {
  streetImages: async () => ({ ok: false, reason: "unavailable" }),
  placeImages: async () => ({ ok: false, reason: "unavailable" }),
  shortStay: async () => ({ ok: false, reason: "unavailable" }),
};

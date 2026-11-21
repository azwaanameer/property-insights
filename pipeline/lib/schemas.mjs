// Zod at the loader boundary (spine: "a pipeline output that fails its schema is not published").
import { z } from "zod";

const flag = z.enum(["0", "1"]).transform((v) => v === "1");
const opt = z.string().transform((v) => (v === "" ? null : v));
const num = z.string().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${v}` });
    return z.NEVER;
  }
  return n;
});

/** One data row of addresses.tsv written by gnaf-extract.py. */
export const AddressRow = z.object({
  gnaf_pid: z.string().regex(/^GA[A-Z]{2,3}_?\d{4,}$/),
  building_id: opt,
  is_property_level: flag,
  unit_number: opt,
  flat_type: opt,
  level_number: opt,
  number_first: opt,
  number_last: opt,
  street_name: opt,
  street_type: opt,
  street_suffix: opt,
  building_name: opt,
  locality_name: z.string().min(1),
  postcode: opt,
  lat: num.refine((v) => v === null || (v >= -90 && v <= 90), "lat out of range"),
  lon: num.refine((v) => v === null || (v >= -180 && v <= 180), "lon out of range"),
  display_address: z.string().min(1),
});

export const GnafManifest = z.object({
  source_id: z.literal("gnaf"),
  state: z.literal("VIC"),
  release: z.string(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  retrieved_at: z.string(),
  file_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  row_count: z.number().int().nonnegative(),
  columns: z.array(z.string()).optional(),
});

/** A Victorian suburb from the ABS SAL 2021 structure. */
export const SalRow = z.object({
  sal_code: z.string().regex(/^2\d{4}$/, "Victorian SAL codes start with 2"),
  name: z.string().min(1),
  raw_name: z.string().min(1),
  area_sqkm: z.number().nullable(),
});

// ---------------------------------------------------------------- Victorian suburb datasets (step 2a)

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SalCode = z.string().regex(/^2\d{4}$/, "Victorian SAL codes start with 2");
const MatchType = z.enum(["exact", "suffix_stripped", "qualified", "code"]);

/** A suburb median price. Money is integer cents; a median outside $20,000 to $50,000,000 is a parse error, not data. */
export const PriceRow = z.object({
  sal_code: SalCode,
  dwelling_type: z.enum(["house", "unit"]),
  period_type: z.enum(["year", "quarter"]),
  period: IsoDate,
  median_cents: z.number().int().min(2_000_000).max(5_000_000_000),
  sales_count: z.number().int().min(0).nullable(),
  low_count: z.boolean(),
  carried_forward: z.boolean(),
  source_name: z.string().min(1),
  sal_match_type: MatchType,
});

/** A suburb moving annual median weekly rent. A median outside $20 to $20,000 a week is a parse error. */
export const RentRow = z.object({
  sal_code: SalCode,
  dwelling_type: z.enum(["house", "unit", "all"]),
  bedrooms: z.number().int().min(0).max(6),
  period_type: z.literal("moving_year"),
  period: IsoDate,
  median_weekly_rent_cents: z.number().int().min(2_000).max(2_000_000),
  lettings_count: z.number().int().min(0).nullable(),
  low_count: z.boolean(),
  source_name: z.string().min(1),
  sal_match_type: MatchType,
});

/** One suburb marker. Shares are fractions; money keys end _cents. */
export const MarkerRow = z.object({
  sal_code: SalCode,
  marker_key: z.string().min(1),
  value: z.number().finite(),
  flag: z.string().nullable(),
});

export const NeighbourRow = z.object({
  sal_code: SalCode,
  neighbour_sal_code: SalCode,
  sal_match_type: z.string(),
  neighbour_match_type: z.string(),
});

// ---------------------------------------------------------------- transport, schools, City of Melbourne (batch 2)

/** Victoria's bounding box. A coordinate outside it is a parse error, not data. */
const VicLat = z.number().min(-39.3).max(-33.9);
const VicLon = z.number().min(140.9).max(150.1);

export const TRANSIT_MODES = ["train", "tram", "bus", "coach"];

export const TransitStopRow = z.object({
  stop_key: z.string().min(1),
  name: z.string().trim().min(1),
  mode: z.enum(TRANSIT_MODES),
  lat: VicLat,
  lon: VicLon,
  routes: z.array(z.string().min(1)),
});

export const GtfsManifest = z.object({
  source: z.literal("gtfs_vic"),
  as_of: IsoDate,
  retrieved_at: z.string(),
  file_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  row_count: z.number().int().nonnegative(),
});

const Ring = z.array(z.tuple([z.number(), z.number()])).min(4);

export const SchoolZoneRow = z.object({
  zone_id: z.string().min(1),
  school_name: z.string().trim().min(1),
  campus_name: z.string().nullable(),
  entity_code: z.string().nullable(),
  school_key: z.string().regex(/^G\d{1,4}$/).nullable(),
  level: z.enum(["primary", "secondary"]),
  year_levels: z.string().min(1),
  boundary_year: z.number().int().min(2020).max(2100),
  min_lat: VicLat,
  max_lat: VicLat,
  min_lon: VicLon,
  max_lon: VicLon,
  rings: z.array(Ring).min(1),
});

export const SchoolRow = z.object({
  school_key: z.string().regex(/^[GN]\d{1,4}(-\d)?$/),
  school_no: z.string().regex(/^\d{1,4}$/),
  name: z.string().trim().min(1),
  sector: z.enum(["Government", "Catholic", "Independent"]),
  school_type: z.string().min(1),
  address: z.string(),
  locality: z.string(),
  postcode: z.string().nullable(),
  lat: VicLat,
  lon: VicLon,
});

export const COM_MATCH_TYPES = ["exact_street_number", "nearest_within_30m_same_street"];

export const ComBuildingRow = z.object({
  property_id: z.string().min(1),
  building_name: z.string().nullable(),
  street_address: z.string().min(1),
  clue_small_area: z.string().nullable(),
  lat: VicLat,
  lon: VicLon,
  construction_year: z.number().int().min(1800).max(2100).nullable(),
  refurbished_year: z.number().int().min(1800).max(2100).nullable(),
  floors_above: z.number().int().min(0).max(200).nullable(),
  predominant_use: z.string().nullable(),
  dwelling_count: z.number().int().min(0).max(20000).nullable(),
  census_year: z.number().int().min(2000).max(2100),
});

export const ComMatchRow = z.object({
  gnaf_building_id: z.string().regex(/^GA[A-Z]{2,3}_?\d{4,}$/),
  property_id: z.string().min(1),
  match_type: z.enum(COM_MATCH_TYPES),
});

export const SupplyProjectRow = z.object({
  development_key: z.string().min(1),
  status: z.enum(["COMPLETED", "APPROVED", "UNDER CONSTRUCTION", "APPLIED"]),
  year_completed: z.number().int().min(1900).max(2100).nullable(),
  street_address: z.string().min(1),
  clue_small_area: z.string().nullable(),
  lat: VicLat,
  lon: VicLon,
  floors_above: z.number().int().min(0).max(200).nullable(),
  resi_dwellings: z.number().int().min(0).max(20000),
  studio_dwellings: z.number().int().min(0),
  one_bed_dwellings: z.number().int().min(0),
  two_bed_dwellings: z.number().int().min(0),
  three_bed_dwellings: z.number().int().min(0),
  town_planning_application: z.string().nullable(),
});

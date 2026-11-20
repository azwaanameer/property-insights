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

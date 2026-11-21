// Address, suggestion and principal contracts. Keys follow AD-6: G-NAF pid, building = primary pid, suburb = SAL 2021 code.
import { z } from "zod";
import { MarketTier, MatchType } from "./layer";

/** G-NAF address_detail_pid: "GA" + state letters + digits. */
export const GnafPid = z.string().regex(/^GA[A-Z]{2,3}_?\d{4,}$/, "not a G-NAF pid");

export const StateCode = z.enum(["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
export type StateCode = z.infer<typeof StateCode>;

export const SalMatchType = z.enum(["exact", "suffix_stripped", "ambiguous", "none"]);
export type SalMatchType = z.infer<typeof SalMatchType>;

export const AddressCandidate = z.object({
  gnaf_pid: GnafPid,
  display_address: z.string(),
  similarity: z.number(),
});
export type AddressCandidate = z.infer<typeof AddressCandidate>;

export const SuggestResponse = z.object({
  query: z.string(),
  candidates: z.array(AddressCandidate).max(10),
});

/** Result of resolving a typed address or a pid. `street` and `none` never become a ResolvedAddress. */
export const ResolvedAddress = z.object({
  gnaf_pid: GnafPid,
  building_id: z.string().nullable(),
  sal_code: z.string().nullable(),
  sal_name: z.string().nullable(),
  sal_match_type: SalMatchType,
  state: StateCode,
  match: MatchType,
  /** The unit the user asked for when it was not found, so the header can say so. */
  unit_requested: z.string().nullable(),
  /** True when G-NAF has at least one unit under this address's building (a ref_building row exists). */
  is_multi_unit: z.boolean(),
  tier: MarketTier,
  display_address: z.string(),
  unit_number: z.string().nullable(),
  flat_type: z.string().nullable(),
  level_number: z.string().nullable(),
  building_name: z.string().nullable(),
  street_number: z.string().nullable(),
  street: z.string().nullable(),
  locality: z.string(),
  postcode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  /** as_of of the G-NAF dataset version this row came from. */
  gnaf_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** as_of of the suburb dataset, null when the suburb code is not in a published dataset. */
  suburb_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type ResolvedAddress = z.infer<typeof ResolvedAddress>;

/** An address a `one` purchase has unlocked, until `expires_at` (ISO 8601 UTC). */
export const UnlockedAddress = z.object({ gnaf_pid: z.string(), expires_at: z.string() });
export type UnlockedAddress = z.infer<typeof UnlockedAddress>;

/**
 * Anonymous, or a user holding paid purchases (a guest identified by the signed cookie; there is no login).
 * Only entitlements() reads the plan, the unlocked addresses and the expiries.
 */
export const Principal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }),
  z.object({
    kind: z.literal("user"),
    user_id: z.string(),
    org_id: z.string().optional(),
    /** "pro" = every address until plan_expires_at. "one" = only the addresses in `unlocked`. "none" = signed in, nothing paid. */
    plan: z.enum(["none", "one", "pro"]).default("none"),
    plan_expires_at: z.string().optional(),
    unlocked: z.array(UnlockedAddress).optional(),
  }),
]);
export type Principal = z.infer<typeof Principal>;

export const ANONYMOUS: Principal = { kind: "anonymous" };

/** Market tiers by state, OVERVIEW section 9. Only VIC is loaded in step 1. */
export const MARKET_TIER_BY_STATE: Record<StateCode, z.infer<typeof MarketTier>> = {
  VIC: "A",
  SA: "B",
  NSW: "C",
  QLD: "C",
  TAS: "C",
  WA: "D",
  ACT: "D",
  NT: "D",
};

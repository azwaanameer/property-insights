// Typed address or G-NAF pid -> ResolvedAddress. Order of preference: unit > building > street (AD-6, AD-9).
// `street` and nothing-found outcomes throw ApiError address_not_found with candidates and never produce a report.
import { ApiError } from "../contracts/errors";
import { MARKET_TIER_BY_STATE, ResolvedAddress, StateCode, type AddressCandidate } from "../contracts/address";
import type { Db } from "../db";
import { findPropertyLevel, findUnit, getAddress, suggestAddresses, type AddressRow } from "../repos/address";
import { currentDataset } from "../repos/datasets";
import { normName, parseQuery, suggestText } from "./parse-query";

const OTHER_STATE_PID = /^GA(NSW|QLD|SA|WA|TAS|ACT|NT|OT)_?\d+$/;

export function toResolved(row: AddressRow, match: "unit" | "building", unitRequested: string | null): ResolvedAddress {
  const state = StateCode.parse(row.state);
  return ResolvedAddress.parse({
    gnaf_pid: row.gnaf_pid,
    building_id: row.building_id,
    sal_code: row.sal_code,
    sal_name: row.sal_name,
    sal_match_type: row.sal_match_type,
    state,
    match,
    unit_requested: match === "building" ? unitRequested : null,
    is_multi_unit: row.is_multi_unit,
    tier: MARKET_TIER_BY_STATE[state],
    display_address: row.display_address,
    unit_number: row.unit_number,
    flat_type: row.flat_type,
    level_number: row.level_number,
    building_name: row.building_name,
    street_number: [row.number_first, row.number_last].filter(Boolean).join("-") || null,
    street: [row.street_name, row.street_type].filter(Boolean).join(" ") || null,
    locality: row.locality_name,
    postcode: row.postcode,
    lat: row.lat,
    lon: row.lon,
    gnaf_as_of: row.gnaf_as_of,
    suburb_as_of: row.suburb_as_of,
  });
}

export async function suggest(db: Db, q: string, limit = 10): Promise<AddressCandidate[]> {
  const parsed = parseQuery(q);
  const text = suggestText(parsed) || normName(q).toLowerCase();
  const rows = await suggestAddresses(db, text, Math.min(limit, 10));
  return rows.map((r) => ({ gnaf_pid: r.gnaf_pid, display_address: r.display_address, similarity: Number(r.similarity) }));
}

/** Resolve a G-NAF pid. A pid from another state is valid but not loaded: 404 not_covered. */
export async function resolveByPid(db: Db, gnafPid: string, unitRequested: string | null = null): Promise<ResolvedAddress> {
  const row = await getAddress(db, gnafPid);
  if (!row) {
    if (OTHER_STATE_PID.test(gnafPid)) {
      throw new ApiError(404, "not_covered", "This address is outside the states VicProp covers. Only Victoria is loaded.");
    }
    throw new ApiError(404, "address_not_found", "No address with that G-NAF id.");
  }
  // A property-level row is the building (or a house); a secondary row is a unit.
  if (row.is_property_level && unitRequested && row.building_id) {
    const unit = await findUnit(db, row.building_id, unitRequested.toUpperCase());
    if (unit) return toResolved(unit, "unit", null);
  }
  return toResolved(row, row.is_property_level ? "building" : "unit", unitRequested);
}

/** Resolve typed text. Throws address_not_found (with candidates) for street-only, ambiguous or unmatched text. */
export async function resolveQuery(db: Db, q: string): Promise<ResolvedAddress> {
  if (!q.trim()) throw new ApiError(400, "bad_request", "Type an address.");
  const parsed = parseQuery(q);

  if (!parsed.number || parsed.streets.length === 0) {
    const candidates = await suggest(db, q);
    const street = parsed.streets.length > 0;
    throw new ApiError(
      404,
      "address_not_found",
      street ? "Matched to a street only. Add the street number to get a report." : "No address recognised in that text.",
      candidates,
      street ? "street" : "none",
    );
  }

  for (const option of parsed.streets) {
    const rows = await findPropertyLevel(db, {
      number: parsed.number,
      street_name_norm: option.name,
      street_type: option.type,
      locality_norm: option.locality,
      postcode: parsed.postcode,
    });
    if (rows.length === 0) continue;
    if (rows.length > 1) {
      throw new ApiError(
        404,
        "address_not_found",
        "More than one address matches. Add the suburb or pick one below.",
        rows.map((r) => ({ gnaf_pid: r.gnaf_pid, display_address: r.display_address, similarity: 1 })),
        "none",
      );
    }
    const property = rows[0];
    if (parsed.unit && property.building_id) {
      const unit = await findUnit(db, property.building_id, parsed.unit);
      if (unit) return toResolved(unit, "unit", null);
    }
    return toResolved(property, "building", parsed.unit);
  }

  const candidates = await suggest(db, q);
  throw new ApiError(404, "address_not_found", "No address matched. Check the street number and suburb, or pick a suggestion.", candidates, "none");
}

/** Which states have a published G-NAF dataset. Used by /coverage. */
export async function loadedStates(db: Db): Promise<string[]> {
  const ds = await currentDataset(db, "gnaf");
  return ds?.states ?? [];
}

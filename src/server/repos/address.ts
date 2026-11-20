// SQL only. Every read of ref_address goes through the current G-NAF pointer (AD-7); suburbs through the current ABS pointer.
import type { Db } from "../db";

export interface AddressRow {
  gnaf_pid: string;
  building_id: string | null;
  is_property_level: boolean;
  unit_number: string | null;
  flat_type: string | null;
  level_number: string | null;
  number_first: string | null;
  number_last: string | null;
  street_name: string | null;
  street_type: string | null;
  building_name: string | null;
  locality_name: string;
  postcode: string | null;
  state: string;
  sal_code: string | null;
  sal_match_type: string;
  lat: number | null;
  lon: number | null;
  display_address: string;
  gnaf_as_of: string;
  sal_name: string | null;
  suburb_as_of: string | null;
  is_multi_unit: boolean;
}

export interface SuggestRow {
  gnaf_pid: string;
  display_address: string;
  similarity: number;
}

const CURRENT_GNAF = `JOIN src_dataset_current c ON c.source_id = 'gnaf' AND c.dataset_version_id = a.dataset_version_id`;

const ADDRESS_COLUMNS = `
  a.gnaf_pid, a.building_id, a.is_property_level, a.unit_number, a.flat_type, a.level_number,
  a.number_first, a.number_last, a.street_name, a.street_type, a.building_name, a.locality_name,
  a.postcode, a.state, a.sal_code, a.sal_match_type, a.lat, a.lon, a.display_address,
  to_char(v.as_of, 'YYYY-MM-DD') AS gnaf_as_of,
  s.name AS sal_name,
  CASE WHEN s.sal_code IS NULL THEN NULL ELSE to_char(sv.as_of, 'YYYY-MM-DD') END AS suburb_as_of,
  (b.building_id IS NOT NULL) AS is_multi_unit`;

const ADDRESS_JOINS = `
  ${CURRENT_GNAF}
  JOIN src_dataset_version v ON v.dataset_version_id = a.dataset_version_id
  LEFT JOIN src_dataset_current sc ON sc.source_id = 'abs_asgs_2021'
  LEFT JOIN ref_suburb s ON s.dataset_version_id = sc.dataset_version_id AND s.sal_code = a.sal_code
  LEFT JOIN src_dataset_version sv ON sv.dataset_version_id = sc.dataset_version_id
  LEFT JOIN ref_building b ON b.dataset_version_id = a.dataset_version_id AND b.building_id = a.building_id`;

export async function getAddress(db: Db, gnafPid: string): Promise<AddressRow | null> {
  const rows = await db.query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS} FROM ref_address a ${ADDRESS_JOINS} WHERE a.gnaf_pid = $1`,
    [gnafPid],
  );
  return rows[0] ?? null;
}

/** Trigram search over property-level rows. `text` is lowercase and already normalised. */
export async function suggestAddresses(db: Db, text: string, limit = 10): Promise<SuggestRow[]> {
  if (!text) return [];
  return db.query<SuggestRow>(
    `SELECT a.gnaf_pid, a.display_address, word_similarity($1::text, a.search_text)::float8 AS similarity
     FROM ref_address a ${CURRENT_GNAF}
     WHERE a.is_property_level AND $1::text <% a.search_text
     ORDER BY similarity DESC, similarity($1::text, a.search_text) DESC, a.display_address
     LIMIT $2`,
    [text, limit],
  );
}

export interface PropertyLookup {
  number: string;
  street_name_norm: string;
  street_type: string | null;
  locality_norm: string | null;
  postcode: string | null;
}

/** Property-level rows matching a number and street (and locality or postcode when given). */
export async function findPropertyLevel(db: Db, q: PropertyLookup, limit = 20): Promise<AddressRow[]> {
  return db.query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS} FROM ref_address a ${ADDRESS_JOINS}
     WHERE a.is_property_level
       AND a.number_first = $1
       AND a.street_name_norm = $2
       AND ($3::text IS NULL OR a.street_type = $3)
       AND ($4::text IS NULL OR a.locality_norm = $4)
       AND ($5::text IS NULL OR a.postcode = $5)
     ORDER BY a.gnaf_pid
     LIMIT $6`,
    [q.number, q.street_name_norm, q.street_type, q.locality_norm, q.postcode, limit],
  );
}

/** A unit under a building by its flat number. G-NAF aliases are not loaded, so there is one principal row per unit. */
export async function findUnit(db: Db, buildingId: string, unitNumber: string): Promise<AddressRow | null> {
  const rows = await db.query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS} FROM ref_address a ${ADDRESS_JOINS}
     WHERE NOT a.is_property_level AND a.building_id = $1 AND a.unit_number = $2
     ORDER BY (CASE WHEN a.flat_type IN ('UNIT', 'APT', 'FLAT', 'SE', 'SUITE') THEN 0 ELSE 1 END), a.gnaf_pid LIMIT 1`,
    [buildingId, unitNumber],
  );
  return rows[0] ?? null;
}

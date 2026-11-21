// SQL only. Recorded crime from the Crime Statistics Agency (CSA), read through the current dataset pointer of its source (AD-7).
// Counts by suburb and offence subdivision (fact_crime_suburb), counts and rates by council area (fact_crime_lga) and the CSA's own
// notices (fact_crime_note). Nothing here scores, labels or ranks anything. Each function returns null or an empty list when there is
// no published dataset, so the layer can say so instead of showing an empty table.
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export const CRIME_SOURCE = "csa_crime_incidents";

export interface CrimeDataset {
  as_of: string;
  /** The newest year ending June in the dataset, for example 2026. */
  latest_year: number;
  /** Every year ending June in the council table, oldest first. */
  years: number[];
}

export interface SuburbCrimeRow {
  year_ending: number;
  lga: string;
  /** The suburb as the CSA wrote it. */
  suburb: string;
  division: string;
  subdivision: string;
  incidents: number;
}

export interface CouncilCrimeRow {
  lga: string;
  police_region: string;
  year_ending: number;
  incidents: number;
  rate_per_100k: number | null;
}

export interface CrimeNote {
  note_key: string;
  sheet: string;
  topic: string;
  seq: number;
  note_text: string;
}

/** The published dataset and its span of years, or null when none is published. */
export async function getCrimeDataset(db: Db): Promise<CrimeDataset | null> {
  const ds = await currentDataset(db, CRIME_SOURCE);
  if (!ds) return null;
  const years = await db.query<{ y: number }>(
    `SELECT DISTINCT l.year_ending::int AS y FROM fact_crime_lga l
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = l.dataset_version_id ORDER BY 1`,
    [CRIME_SOURCE],
  );
  if (years.length === 0) return null;
  return { as_of: ds.as_of, latest_year: years[years.length - 1].y, years: years.map((r) => r.y) };
}

/**
 * Every row for one suburb or town, matched on the normalised name AND the postcode (a name alone is never enough). A suburb that lies in
 * two council areas has rows for each. Empty when the CSA lists nothing under that name and postcode.
 */
export async function listSuburbCrime(db: Db, suburbKey: string, postcode: string): Promise<SuburbCrimeRow[]> {
  return db.query<SuburbCrimeRow>(
    `SELECT s.year_ending::int AS year_ending, s.lga, s.suburb, s.division, s.subdivision, s.incidents::int AS incidents
     FROM fact_crime_suburb s
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = s.dataset_version_id
     WHERE s.suburb_key = $2 AND s.postcode = $3
     ORDER BY s.year_ending, s.lga, s.subdivision`,
    [CRIME_SOURCE, suburbKey, postcode],
  );
}

/** The council area rows (count and rate) for the named councils in one year. */
export async function listCouncilCrime(db: Db, lgas: string[], year: number): Promise<CouncilCrimeRow[]> {
  if (lgas.length === 0) return [];
  return db.query<CouncilCrimeRow>(
    `SELECT l.lga, l.police_region, l.year_ending::int AS year_ending, l.incidents::int AS incidents, l.rate_per_100k::float8 AS rate_per_100k
     FROM fact_crime_lga l
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = l.dataset_version_id
     WHERE l.lga = ANY($2::text[]) AND l.year_ending = $3
     ORDER BY l.lga`,
    [CRIME_SOURCE, lgas, year],
  );
}

export interface VictorianRate {
  /** Incidents per 100,000 residents, all council areas combined. */
  rate_per_100k: number;
  council_areas: number;
  incidents: number;
  /** Residents behind the rate, worked out as incidents x 100,000 / rate for each council area. */
  population: number;
}

/**
 * The Victorian rate, worked out from the council rows so that numerator and denominator match: each area's population is its incidents
 * x 100,000 / its rate, and the rate is the sum of incidents over the sum of those populations x 100,000. Only council areas with a rate
 * count (the two non-council rows have none). The two non-council rows and every region "Total" row are left out. Null when there are none.
 */
export async function getVictorianRate(db: Db, year: number): Promise<VictorianRate | null> {
  const rows = await db.query<{ incidents: number | null; population: number | null; areas: number }>(
    `SELECT sum(l.incidents)::float8 AS incidents, sum(l.incidents * 100000.0 / l.rate_per_100k)::float8 AS population, count(*)::int AS areas
     FROM fact_crime_lga l
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = l.dataset_version_id
     WHERE l.year_ending = $2 AND l.rate_per_100k > 0`,
    [CRIME_SOURCE, year],
  );
  const r = rows[0];
  if (!r || !r.areas || !r.incidents || !r.population) return null;
  return { rate_per_100k: (r.incidents / r.population) * 100000, council_areas: r.areas, incidents: r.incidents, population: r.population };
}

/** The CSA's notices as published, in sheet and sequence order. */
export async function listCrimeNotes(db: Db): Promise<CrimeNote[]> {
  return db.query<CrimeNote>(
    `SELECT n.note_key, n.sheet, n.topic, n.seq::int AS seq, n.note_text
     FROM fact_crime_note n
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = n.dataset_version_id
     ORDER BY n.sheet, n.topic, n.seq`,
    [CRIME_SOURCE],
  );
}

// SQL only. The conditions rating written by pipeline/derive/rating.mjs, read through the current dataset pointer (AD-7).
// Whether it may be SHOWN is decided by market_validation (AD-5), not here: this file just reads what the pipeline published.
import type { Db } from "../db";
import { currentDataset } from "./datasets";

export const RATING_SOURCE = "conditions_rating";

export interface RatingRow {
  sal_code: string;
  /** 1 = top fifth of the rated suburbs, 5 = bottom fifth. */
  fifth: 1 | 2 | 3 | 4 | 5;
  /** 1 + the number of rated suburbs with a higher score, so a tie shares a place. */
  position: number;
  /** How many suburbs were rated in this dataset version. */
  of: number;
}

/**
 * The rating for one suburb and dwelling type. `published` is false when no rating dataset has been published; `rating` is null
 * when it has but this suburb was not rated (too few dwellings, a marker missing, or no unit price history).
 */
export async function getRating(db: Db, salCode: string, dwellingType: "house" | "unit"): Promise<{ published: boolean; as_of: string | null; rating: RatingRow | null }> {
  const ds = await currentDataset(db, RATING_SOURCE);
  if (!ds) return { published: false, as_of: null, rating: null };
  const rows = await db.query<{ sal_code: string; band: string | null; position: number; of: number }>(
    `SELECT r.sal_code, r.band,
            (1 + (SELECT count(*) FROM derived_rating x WHERE x.dataset_version_id = r.dataset_version_id AND x.dwelling_type = r.dwelling_type AND x.score > r.score))::int AS position,
            (SELECT count(*) FROM derived_rating x WHERE x.dataset_version_id = r.dataset_version_id AND x.dwelling_type = r.dwelling_type)::int AS "of"
     FROM derived_rating r
     JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = r.dataset_version_id
     WHERE r.sal_code = $2 AND r.dwelling_type = $3`,
    [RATING_SOURCE, salCode, dwellingType],
  );
  const row = rows[0];
  const fifth = row ? Number(row.band) : NaN;
  if (!row || !Number.isInteger(fifth) || fifth < 1 || fifth > 5) return { published: true, as_of: ds.as_of, rating: null };
  return { published: true, as_of: ds.as_of, rating: { sal_code: row.sal_code, fifth: fifth as RatingRow["fifth"], position: row.position, of: row.of } };
}

/**
 * The fifth and position of each listed suburb for one dwelling type, from the current rating dataset. A suburb that was not rated is
 * absent from the map. Whether the rating may be SHOWN is decided by market_validation (AD-5), not here. Null when nothing is published.
 */
export async function listRatings(db: Db, salCodes: string[], dwellingType: "house" | "unit"): Promise<{ as_of: string; ratings: Map<string, RatingRow> } | null> {
  const ds = await currentDataset(db, RATING_SOURCE);
  if (!ds) return null;
  const ratings = new Map<string, RatingRow>();
  if (salCodes.length === 0) return { as_of: ds.as_of, ratings };
  const rows = await db.query<{ sal_code: string; band: string | null; position: number; of: number }>(
    `SELECT x.sal_code, x.band, x.position, x."of" FROM (
       SELECT r.sal_code, r.band, (rank() OVER (ORDER BY r.score DESC))::int AS position, (count(*) OVER ())::int AS "of"
       FROM derived_rating r
       JOIN src_dataset_current c ON c.source_id = $1 AND c.dataset_version_id = r.dataset_version_id
       WHERE r.dwelling_type = $2) x
     WHERE x.sal_code = ANY($3::text[])`,
    [RATING_SOURCE, dwellingType, salCodes],
  );
  for (const row of rows) {
    const fifth = Number(row.band);
    if (Number.isInteger(fifth) && fifth >= 1 && fifth <= 5) ratings.set(row.sal_code, { sal_code: row.sal_code, fifth: fifth as RatingRow["fifth"], position: row.position, of: row.of });
  }
  return { as_of: ds.as_of, ratings };
}

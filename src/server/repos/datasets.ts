// AD-7: repositories read only through src_dataset_current. These helpers expose the pointer itself.
import type { Db } from "../db";

export interface CurrentDataset {
  source_id: string;
  dataset_version_id: string;
  as_of: string;
  retrieved_at: string;
  row_count: number;
  states: string[];
  published_at: string;
}

const SELECT = `
  SELECT c.source_id, c.dataset_version_id::text AS dataset_version_id,
         to_char(v.as_of, 'YYYY-MM-DD') AS as_of,
         to_char(v.retrieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS retrieved_at,
         v.row_count::bigint::int AS row_count,
         v.states,
         to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published_at
  FROM src_dataset_current c
  JOIN src_dataset_version v ON v.dataset_version_id = c.dataset_version_id`;

export async function currentDataset(db: Db, sourceId: string): Promise<CurrentDataset | null> {
  const rows = await db.query<CurrentDataset>(`${SELECT} WHERE c.source_id = $1`, [sourceId]);
  return rows[0] ?? null;
}

export async function listCurrentDatasets(db: Db): Promise<CurrentDataset[]> {
  return db.query<CurrentDataset>(`${SELECT} ORDER BY c.source_id`);
}

// Dataset versioning helpers (AD-7). A pipeline run creates a version, loads rows keyed by it, then publish flips the pointer.

export async function createDatasetVersion(db, { source_id, retrieved_at, file_sha256, as_of, row_count, states = [] }) {
  const src = await db.query("SELECT licence FROM src_source WHERE source_id = $1", [source_id]);
  if (src.length === 0) throw new Error(`unknown source ${source_id}: add it to src_source first`);
  const rows = await db.query(
    `INSERT INTO src_dataset_version (source_id, retrieved_at, file_sha256, row_count, licence_snapshot, as_of, states, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'loading') RETURNING dataset_version_id::text AS id`,
    [source_id, retrieved_at, file_sha256, row_count, src[0].licence, as_of, states],
  );
  return rows[0].id;
}

// Every table a pipeline loads under a dataset_version_id. A failed run deletes its own rows from all of them.
const LOADED_TABLES = [
  "ref_address",
  "ref_building",
  "ref_suburb",
  "series_price",
  "series_rent",
  "fact_suburb_marker",
  "ref_suburb_neighbour",
  "derived_rating",
  "ref_transit_stop",
  "ref_school_zone",
  "ref_school",
  // The match table references ref_com_building, so it is cleared first.
  "ref_com_building_match",
  "ref_com_building",
  "fact_supply_project",
  "fact_crime_suburb",
  "fact_crime_lga",
  "fact_crime_note",
  "ref_place",
  "fact_reported_sale",
  "derived_price_driver",
  "derived_layout_median",
  "src_dataset_unmatched",
];

/** Mark a loading version failed and delete the rows it loaded, so a failed run leaves nothing behind. */
export async function markFailed(db, datasetVersionId) {
  const done = await db.query(
    "UPDATE src_dataset_version SET status = 'failed' WHERE dataset_version_id = $1 AND status = 'loading' RETURNING dataset_version_id",
    [datasetVersionId],
  );
  if (done.length === 0) return;
  for (const table of LOADED_TABLES) {
    await db.query(`DELETE FROM ${table} WHERE dataset_version_id = $1`, [datasetVersionId]);
  }
}

/**
 * Batched insert with UNNEST: one statement per batch, one array parameter per column.
 * @param {{name: string, type: string}[]} columns  type is a SQL type such as text, boolean, double precision
 * @param {(row: any) => any[]} toValues  returns values in column order (the dataset_version_id column is added for you)
 */
export function makeBatchInserter(db, table, columns, datasetVersionId) {
  const names = ["dataset_version_id", ...columns.map((c) => c.name)].join(", ");
  const unnest = columns.map((c, i) => `$${i + 2}::${c.type}[]`).join(", ");
  const sql = `INSERT INTO ${table} (${names}) SELECT $1::bigint, * FROM unnest(${unnest})`;
  return async (valueRows) => {
    if (valueRows.length === 0) return 0;
    const arrays = columns.map((_, i) => valueRows.map((r) => r[i]));
    await db.query(sql, [datasetVersionId, ...arrays]);
    return valueRows.length;
  };
}

export async function countRows(db, table, datasetVersionId) {
  const rows = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [datasetVersionId]);
  return rows[0].n;
}

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

/** Mark a loading version failed and delete the rows it loaded, so a failed run leaves nothing behind. */
export async function markFailed(db, datasetVersionId) {
  const done = await db.query(
    "UPDATE src_dataset_version SET status = 'failed' WHERE dataset_version_id = $1 AND status = 'loading' RETURNING dataset_version_id",
    [datasetVersionId],
  );
  if (done.length === 0) return;
  for (const table of ["ref_address", "ref_building", "ref_suburb"]) {
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

// AD-7: publishing is one transaction that checks the loaded version and then moves src_dataset_current.
// If any check fails the transaction rolls back, the pointer is unchanged (the old data keeps being served),
// the version is marked failed, and the caller gets a PublishCheckError (CLIs exit non-zero).

import { markFailed } from "../lib/dataset.mjs";

export class PublishCheckError extends Error {
  constructor(failures) {
    super(`publish checks failed: ${failures.join("; ")}`);
    this.name = "PublishCheckError";
    this.failures = failures;
  }
}

/**
 * A check is `async (db, ctx) => string | null` returning a failure message or null.
 * ctx = { source_id, dataset_version_id, declared_row_count, previous: { dataset_version_id, row_count } | null }
 */

/** Actual rows in `table` for this version must equal the count the extractor declared. */
export const rowCountMatchesDeclared = (table) => async (db, ctx) => {
  const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [ctx.dataset_version_id]);
  return n === ctx.declared_row_count ? null : `${table} has ${n} rows for this version but ${ctx.declared_row_count} were declared`;
};

export const minRows = (table, min) => async (db, ctx) => {
  const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [ctx.dataset_version_id]);
  return n >= min ? null : `${table} has ${n} rows, fewer than the minimum ${min}`;
};

/** A new version may not be much smaller than the one it replaces. */
export const notMuchSmallerThanPrevious = (ratio = 0.9) => async (_db, ctx) => {
  if (!ctx.previous || ctx.previous.row_count === 0) return null;
  const floor = Math.floor(ctx.previous.row_count * ratio);
  return ctx.declared_row_count >= floor
    ? null
    : `declared ${ctx.declared_row_count} rows, below ${Math.round(ratio * 100)}% of the current version (${ctx.previous.row_count})`;
};

/** Arbitrary SQL check: `sql` must return one row with boolean column `ok`. */
export const sqlCheck = (message, sql) => async (db, ctx) => {
  const rows = await db.query(sql, [ctx.dataset_version_id]);
  return rows[0]?.ok ? null : message;
};

export async function publish(db, { source_id, dataset_version_id, checks = [] }) {
  let failures = null;
  try {
    await db.transaction(async (tx) => {
      const versions = await tx.query(
        "SELECT status, row_count::bigint::int AS row_count FROM src_dataset_version WHERE dataset_version_id = $1 AND source_id = $2",
        [dataset_version_id, source_id],
      );
      if (versions.length === 0) throw new Error(`dataset version ${dataset_version_id} for ${source_id} does not exist`);
      if (versions[0].status !== "loading") throw new Error(`dataset version ${dataset_version_id} is ${versions[0].status}, not loading`);

      const prev = await tx.query(
        `SELECT c.dataset_version_id::text AS dataset_version_id, v.row_count::bigint::int AS row_count
         FROM src_dataset_current c JOIN src_dataset_version v ON v.dataset_version_id = c.dataset_version_id
         WHERE c.source_id = $1`,
        [source_id],
      );
      const ctx = {
        source_id,
        dataset_version_id,
        declared_row_count: versions[0].row_count,
        previous: prev[0] ?? null,
      };
      const found = [];
      for (const check of checks) {
        const msg = await check(tx, ctx);
        if (msg) found.push(msg);
      }
      if (found.length > 0) {
        failures = found;
        throw new PublishCheckError(found);
      }

      await tx.query("UPDATE src_dataset_version SET status = 'published' WHERE dataset_version_id = $1", [dataset_version_id]);
      await tx.query(
        `INSERT INTO src_dataset_current (source_id, dataset_version_id, published_at) VALUES ($1, $2, now())
         ON CONFLICT (source_id) DO UPDATE SET dataset_version_id = EXCLUDED.dataset_version_id, published_at = EXCLUDED.published_at`,
        [source_id, dataset_version_id],
      );
    });
  } catch (err) {
    if (failures) {
      // Rolled back above. Record the failure outside the rolled-back transaction.
      await markFailed(db, dataset_version_id);
    }
    throw err;
  }
  return { source_id, dataset_version_id };
}

// Db adapters for pipelines, migrations and tests. Every adapter satisfies the same shape as src/server/db.ts:
//   query(text, params?) -> rows[]      one SQL path everywhere
//   exec(sql)            -> void        multi-statement, no params (migrations)
//   transaction(fn)      -> fn(db)      BEGIN/COMMIT on one connection, ROLLBACK if fn throws
// The pipeline uses `pg` over TCP; tests and `--pglite` runs use in-process PGlite. The Worker uses Neon HTTP (src/server/db.ts).

function withTransaction(base) {
  let chain = Promise.resolve();
  return {
    ...base,
    // Serialised: a single connection can only run one transaction at a time.
    transaction(fn) {
      const run = async () => {
        await base.exec("BEGIN");
        try {
          const out = await fn(base);
          await base.exec("COMMIT");
          return out;
        } catch (err) {
          await base.exec("ROLLBACK");
          throw err;
        }
      };
      const next = chain.then(run, run);
      chain = next.catch(() => {});
      return next;
    },
  };
}

export async function openPglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const pg = await PGlite.create({ extensions: { pg_trgm } });
  const db = withTransaction({
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    exec: async (sql) => {
      await pg.exec(sql);
    },
  });
  return { db, close: () => pg.close() };
}

export async function openPg(connectionString) {
  const { default: pgPkg } = await import("pg");
  const client = new pgPkg.Client({ connectionString });
  await client.connect();
  const db = withTransaction({
    query: async (text, params = []) => (await client.query(text, params)).rows,
    exec: async (sql) => {
      await client.query(sql);
    },
  });
  return { db, close: () => client.end() };
}

/** Pipeline entry point: PGlite when --pglite, else the user's DATABASE_URL, else refuse. */
export async function openFromCli(argv = process.argv, env = process.env) {
  if (argv.includes("--pglite")) return { ...(await openPglite()), kind: "pglite" };
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Set it yourself to load into a real database, or pass --pglite for an in-memory dry run.");
  }
  return { ...(await openPg(env.DATABASE_URL)), kind: "pg" };
}

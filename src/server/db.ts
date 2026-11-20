// One SQL path everywhere: repositories, services and pipelines depend only on this `Db` shape.
// - The Worker uses Neon over HTTP (this file).
// - Pipelines and tests use `pg` / PGlite via pipeline/lib/db.mjs and src/server/testing/db.ts.
// Those two are kept out of this file so the Worker bundle never pulls in `pg` or PGlite.
import { neon } from "@neondatabase/serverless";

export type Row = Record<string, any>;

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Present on TCP and PGlite adapters; absent on Neon HTTP (no interactive transactions). */
  transaction?<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

let cached: { url: string; db: Db } | undefined;

/** Neon HTTP driver, which works on Cloudflare Workers. Reads DATABASE_URL (a Cloudflare secret, or .dev.vars locally). */
export function getDb(url: string | undefined = process.env.DATABASE_URL): Db {
  if (!url) throw new DatabaseNotConfiguredError();
  if (!cached || cached.url !== url) {
    const sql = neon(url);
    cached = { url, db: { query: async (text, params = []) => (await sql.query(text, params as any[])) as any[] } };
  }
  return cached.db;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

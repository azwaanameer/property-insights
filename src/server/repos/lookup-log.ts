// app_lookup_log: written by the application (AD-8). Stores the matched pid only, never typed free text.
import type { Db } from "../db";

export interface LookupLogEntry {
  request_id: string;
  gnaf_pid: string;
  principal_kind: string;
  principal_id: string | null;
  layers_served: { layer_id: string; status: string }[];
}

export async function recordLookup(db: Db, e: LookupLogEntry): Promise<void> {
  await db.query(
    `INSERT INTO app_lookup_log (request_id, gnaf_pid, principal_kind, principal_id, layers_served)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [e.request_id, e.gnaf_pid, e.principal_kind, e.principal_id, JSON.stringify(e.layers_served)],
  );
}

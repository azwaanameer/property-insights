// G-NAF locality neighbours -> ref_suburb_neighbour (adjacent suburbs), then publish (AD-7).
//
//   node pipeline/ingest/locality-neighbours.mjs --pglite            in-memory dry run (applies migrations, loads suburbs first)
//   node --env-file=.env pipeline/ingest/locality-neighbours.mjs      load and publish into the database named by DATABASE_URL
//
// Reads VIC_LOCALITY_psv.psv and VIC_LOCALITY_NEIGHBOUR_psv.psv from the G-NAF zip through the python zip helper. A comparison set
// built from real adjacency beats a distance guess. G-NAF names localities, not ABS suburbs, so each locality name is matched to
// an ABS SAL 2021 code with the same name index that gnaf-load.mjs uses (AD-6) and both match types are stored. A locality whose
// name matches no suburb or more than one suburb is counted and listed, and every pair that touches it is dropped, never guessed.
// Both directions are stored (A next to B gives A->B and B->A). This loader does not touch the `gnaf` dataset.
//
// This is a separate source (`gnaf_neighbours`) so it has its own dataset pointer; its rights follow `gnaf` (see migration 0004).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { parseDelimited } from "../lib/csv.mjs";
import { monthEnd, newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { recordUnmatched } from "../lib/sal-map.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { NeighbourRow } from "../lib/schemas.mjs";
import { loadAndPublish, runCli, suburbChecks } from "../lib/suburb-run.mjs";
import { readZipMembers } from "../lib/zip.mjs";
import { readVicSals } from "./suburbs-sal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_ZIP = path.join(root, "data", "raw", "national", "gnaf", "g-naf_aug26_allstates_gda2020_psv_110.zip");
const SOURCE_ID = "gnaf_neighbours";
const PATTERNS = { locality: "Standard/VIC_LOCALITY_psv\\.psv$", neighbour: "Standard/VIC_LOCALITY_NEIGHBOUR_psv\\.psv$" };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "g-naf_aug26_allstates_..." -> "2026-08-31" (the G-NAF release month end, as gnaf-extract.py does). */
export function releaseAsOf(zipPath) {
  const m = /g-naf_([a-z]{3})(\d{2})_/i.exec(path.basename(zipPath));
  if (!m || !MONTHS[m[1].toLowerCase()]) throw new Error(`cannot read the G-NAF release month from ${path.basename(zipPath)}`);
  return monthEnd(2000 + Number(m[2]), MONTHS[m[1].toLowerCase()]);
}

/**
 * Pure: locality and neighbour PSV text -> neighbour rows plus accounting.
 * Returns { rows, pairs, localities, unmatched: {file, source_name, reason, detail}[], dropped_pairs, self_pairs }.
 */
export function buildNeighbours({ localityText, neighbourText, sals, file = "VIC_LOCALITY_NEIGHBOUR_psv.psv" }) {
  const index = buildSalIndex(sals);
  const live = (r) => !r.DATE_RETIRED;
  const names = new Map(parseDelimited(localityText, "|").filter(live).map((r) => [r.LOCALITY_PID, r.LOCALITY_NAME]));
  const pairs = parseDelimited(neighbourText, "|").filter(live);

  const matchOf = new Map(); // locality pid -> { sal_code, match_type } or null
  const unmatched = new Map(); // name -> entry
  const resolve = (pid) => {
    if (matchOf.has(pid)) return matchOf.get(pid);
    const name = names.get(pid);
    let out = null;
    if (name === undefined) {
      unmatched.set(pid, { file, source_name: pid, reason: "outside_vic", detail: "locality is not in the Victorian locality table" });
    } else {
      const m = index.match(name);
      if (m.sal_code) out = m;
      else unmatched.set(name, { file, source_name: name, reason: m.match_type === "ambiguous" ? "ambiguous" : "none", detail: "" });
    }
    matchOf.set(pid, out);
    return out;
  };

  const seen = new Map();
  let dropped = 0;
  let self = 0;
  for (const p of pairs) {
    const a = resolve(p.LOCALITY_PID);
    const b = resolve(p.NEIGHBOUR_LOCALITY_PID);
    if (!a || !b) {
      dropped++;
      continue;
    }
    if (a.sal_code === b.sal_code) {
      self++;
      continue;
    }
    for (const [x, y] of [[a, b], [b, a]]) {
      const key = `${x.sal_code}>${y.sal_code}`;
      if (!seen.has(key)) seen.set(key, { sal_code: x.sal_code, neighbour_sal_code: y.sal_code, sal_match_type: x.match_type, neighbour_match_type: y.match_type });
    }
  }
  return { rows: [...seen.values()], pairs: pairs.length, localities: names.size, unmatched: [...unmatched.values()], dropped_pairs: dropped, self_pairs: self };
}

export function readNeighbourZip(zip = DEFAULT_ZIP) {
  const found = readZipMembers(zip, Object.values(PATTERNS));
  return { localityText: found[PATTERNS.locality], neighbourText: found[PATTERNS.neighbour] };
}

export const NEIGHBOUR_COLUMNS = [
  { name: "sal_code", type: "text" },
  { name: "neighbour_sal_code", type: "text" },
  { name: "sal_match_type", type: "text" },
  { name: "neighbour_match_type", type: "text" },
];

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} neighbour row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

export async function loadNeighbours(db, { zip = DEFAULT_ZIP, texts, sals, as_of, retrieved_at, log = () => {} }) {
  const t = texts ?? readNeighbourZip(zip);
  const built = buildNeighbours({ ...t, sals });
  const bad = [];
  const rows = [];
  for (const r of built.rows) {
    const ok = NeighbourRow.safeParse(r);
    if (ok.success) rows.push(ok.data);
    else bad.push(`${r.sal_code}>${r.neighbour_sal_code}: ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));

  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: retrieved_at ?? (texts ? new Date().toISOString() : await newestMtimeIso([zip])),
    file_sha256: texts ? null : await sha256Of(zip),
    as_of: as_of ?? (texts ? new Date().toISOString().slice(0, 10) : releaseAsOf(zip)),
    row_count: rows.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "ref_suburb_neighbour", NEIGHBOUR_COLUMNS, id);
    for (let i = 0; i < rows.length; i += 5000) {
      await insert(rows.slice(i, i + 5000).map((r) => [r.sal_code, r.neighbour_sal_code, r.sal_match_type, r.neighbour_match_type]));
    }
    await recordUnmatched(db, id, built.unmatched);
    const suburbs = new Set(rows.map((r) => r.sal_code)).size;
    log(`loaded ${await countRows(db, "ref_suburb_neighbour", id)} neighbour rows for ${suburbs} suburbs (${built.pairs} G-NAF pairs, ${built.dropped_pairs} dropped, ${built.self_pairs} within one suburb)`);
    const asOfStored = (await db.query("SELECT to_char(as_of, 'YYYY-MM-DD') AS d FROM src_dataset_version WHERE dataset_version_id = $1", [id]))[0].d;
    return {
      dataset_version_id: id,
      source_id: SOURCE_ID,
      rows: rows.length,
      files: [{ file: "VIC_LOCALITY_NEIGHBOUR_psv.psv", records: built.localities, matched: built.localities - built.unmatched.filter((u) => u.reason !== "outside_vic").length, unmatched: built.unmatched }],
      as_of: asOfStored,
      pairs: built.pairs,
      dropped_pairs: built.dropped_pairs,
      self_pairs: built.self_pairs,
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

export const neighbourChecks = (minimum = 8_000) =>
  suburbChecks({
    table: "ref_suburb_neighbour",
    salColumns: ["sal_code", "neighbour_sal_code"],
    minimum,
    ranges: [
      {
        message: "ref_suburb_neighbour has a suburb next to itself or a one-way pair",
        sql: `SELECT (NOT EXISTS (SELECT 1 FROM ref_suburb_neighbour WHERE dataset_version_id = $1 AND sal_code = neighbour_sal_code)
                AND NOT EXISTS (SELECT 1 FROM ref_suburb_neighbour a WHERE a.dataset_version_id = $1 AND NOT EXISTS (
                  SELECT 1 FROM ref_suburb_neighbour b WHERE b.dataset_version_id = $1 AND b.sal_code = a.neighbour_sal_code AND b.neighbour_sal_code = a.sal_code))) AS ok`,
      },
    ],
  });

/**
 * @param {any} db
 * @param {{ zip?: string, texts?: { localityText: string, neighbourText: string }, sals?: any[], as_of?: string, minimum?: number, log?: (m: string) => void }} [opts]
 */
export async function runNeighbours(db, { zip, texts, sals, as_of, minimum = 8_000, log } = {}) {
  const s = sals ?? (await readVicSals());
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: neighbourChecks(minimum),
    load: () => loadNeighbours(db, { zip, texts, sals: s, as_of, log }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli((db, { log }) => runNeighbours(db, { log })).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

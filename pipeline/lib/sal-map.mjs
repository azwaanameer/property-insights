// Map the names in a source file to ABS SAL 2021 codes inside the pipeline (AD-6). The match type is stored with each row.
// A name is never guessed: ambiguous, unknown and duplicated names are returned as `unmatched` so the loader counts and lists them.
import { makeBatchInserter } from "./dataset.mjs";

/**
 * @template T
 * @param {{ matchSourceName(name: string): { sal_code: string|null, match_type: string } }} index  from buildSalIndex
 * @param {T[]} records
 * @param {(rec: T) => string} nameOf
 * @param {string} file  file name, kept on the unmatched entries
 * @returns {{ matched: { rec: T, name: string, sal_code: string, match_type: string }[], unmatched: { file: string, source_name: string, reason: string, detail: string }[] }}
 */
export function mapNamesToSal(index, records, nameOf, file) {
  const matched = [];
  const unmatched = [];

  // A name that appears twice in one file cannot be placed: keep neither (it would also collide on the primary key).
  const byName = new Map();
  for (const rec of records) {
    const name = nameOf(rec);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(rec);
  }

  const bySal = new Map();
  for (const [name, recs] of byName) {
    if (recs.length > 1) {
      unmatched.push({ file, source_name: name, reason: "duplicate_sal", detail: `the name appears ${recs.length} times in the file` });
      continue;
    }
    const m = index.matchSourceName(name);
    if (!m.sal_code) {
      unmatched.push({ file, source_name: name, reason: m.match_type === "ambiguous" ? "ambiguous" : "none", detail: "" });
      continue;
    }
    if (!bySal.has(m.sal_code)) bySal.set(m.sal_code, []);
    bySal.get(m.sal_code).push({ rec: recs[0], name, sal_code: m.sal_code, match_type: m.match_type });
  }
  // Two different names that land on the same suburb: keep neither.
  for (const [sal, list] of bySal) {
    if (list.length > 1) {
      for (const l of list) {
        unmatched.push({ file, source_name: l.name, reason: "duplicate_sal", detail: `shares SAL ${sal} with ${list.filter((x) => x !== l).map((x) => x.name).join(", ")}` });
      }
      continue;
    }
    matched.push(list[0]);
  }
  return { matched, unmatched };
}

export async function recordUnmatched(db, datasetVersionId, entries) {
  if (entries.length === 0) return 0;
  const insert = makeBatchInserter(
    db,
    "src_dataset_unmatched",
    [
      { name: "file", type: "text" },
      { name: "source_name", type: "text" },
      { name: "reason", type: "text" },
      { name: "detail", type: "text" },
    ],
    datasetVersionId,
  );
  return insert(entries.map((e) => [e.file, e.source_name, e.reason, e.detail]));
}

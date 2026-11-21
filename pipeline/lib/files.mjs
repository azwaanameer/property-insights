import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

/** sha256 of one file, or of several files (hash of the per-file hashes, in the order given). */
export async function sha256Of(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  const hashes = [];
  for (const p of list) hashes.push(createHash("sha256").update(await readFile(p)).digest("hex"));
  return list.length === 1 ? hashes[0] : createHash("sha256").update(hashes.join("\n")).digest("hex");
}

/** The newest modification time among the files, as the retrieval time (when the file was saved by hand into data/raw). */
export async function newestMtimeIso(paths) {
  let newest = 0;
  for (const p of paths) newest = Math.max(newest, (await stat(p)).mtimeMs);
  return new Date(newest).toISOString();
}

/** Last day of a month as an ISO date. `month` is 1 to 12. */
export function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

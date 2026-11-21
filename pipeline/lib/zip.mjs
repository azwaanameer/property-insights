// Read members of a zip through the python helper (stdlib only, run with -I). Node has no zip reader, and the G-NAF zip is too
// large to unpack. Each regex must match exactly one member.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), "zip_member.py");

/**
 * @param {string} zipPath
 * @param {string[]} patterns
 * @param {typeof spawnSync} [spawn] replaceable in tests
 * @param {string[]} [candidates] python executables to try, in order
 * @returns {Record<string, string>} member text keyed by the regex that selected it
 */
export function readZipMembers(zipPath, patterns, spawn = spawnSync, candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
  // Try every candidate. On Windows the Microsoft Store "python" stub exists but exits non-zero, so a failure here is not final:
  // `py` may still work. Throw only after all of them have failed.
  const failures = [];
  for (const exe of candidates) {
    const r = spawn(exe, ["-I", HELPER, zipPath, ...patterns], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
    if (r.error) {
      failures.push(`${exe}: ${r.error.message}`);
      continue;
    }
    if (r.status !== 0) {
      failures.push(`${exe}: ${String(r.stderr ?? "").trim() || `exit status ${r.status}`}`);
      continue;
    }
    return JSON.parse(r.stdout);
  }
  throw new Error(`reading ${zipPath} failed with every python tried (${failures.join("; ")}). Python 3 must be on PATH.`);
}

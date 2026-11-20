// Locality name -> ABS SAL 2021 code. Names are matched to codes here, inside the pipeline, and the match type is stored (AD-6).
import { normName } from "./normalise.mjs";

/**
 * Strip a trailing parenthetical that mentions Vic, as a match key only:
 *   "Carlton (Vic.)" -> "Carlton";  "Bellfield (Banyule - Vic.)" -> "Bellfield".
 * If two ABS names collapse to the same key the locality is ambiguous (see buildSalIndex), never picked at random.
 */
export function stripStateSuffix(rawName) {
  const m = rawName.match(/^(.*?)\s*\([^)]*vic[^)]*\)\s*$/i);
  return m ? { name: m[1].trim(), stripped: true } : { name: rawName.trim(), stripped: false };
}

/** @param {{sal_code: string, raw_name: string}[]} sals */
export function buildSalIndex(sals) {
  const byKey = new Map();
  for (const s of sals) {
    const { name, stripped } = stripStateSuffix(s.raw_name);
    const key = normName(name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ sal_code: s.sal_code, stripped });
  }
  const cache = new Map();
  return {
    byKey,
    /** @returns {{sal_code: string|null, match_type: "exact"|"suffix_stripped"|"ambiguous"|"none"}} */
    match(localityName) {
      const key = normName(localityName);
      if (cache.has(key)) return cache.get(key);
      const hits = byKey.get(key) ?? [];
      let result;
      if (hits.length === 0) result = { sal_code: null, match_type: "none" };
      else if (hits.length > 1) result = { sal_code: null, match_type: "ambiguous" };
      else result = { sal_code: hits[0].sal_code, match_type: hits[0].stripped ? "suffix_stripped" : "exact" };
      cache.set(key, result);
      return result;
    },
  };
}

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

/**
 * ABS disambiguates repeated names with the council: "Bellfield (Banyule - Vic.)". Valuer-General files write the same
 * suburb "BELLFIELD (BANYULE)". The key for that form is the name plus the council: "BELLFIELD BANYULE".
 */
export function qualifiedKey(rawName) {
  const m = rawName.match(/^(.*?)\s*\(\s*([^()]*?)\s*(?:-\s*vic\.?)?\s*\)\s*$/i);
  if (!m || !m[2] || /^vic\.?$/i.test(m[2])) return null;
  return normName(`${m[1]} ${m[2]}`);
}

/** @param {{sal_code: string, raw_name: string}[]} sals */
export function buildSalIndex(sals) {
  const byKey = new Map();
  const byQualified = new Map();
  for (const s of sals) {
    const { name, stripped } = stripStateSuffix(s.raw_name);
    const key = normName(name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ sal_code: s.sal_code, stripped });
    const q = stripped ? qualifiedKey(s.raw_name) : null;
    if (q) {
      if (!byQualified.has(q)) byQualified.set(q, []);
      byQualified.get(q).push(s.sal_code);
    }
  }
  const cache = new Map();
  return {
    byKey,
    /**
     * Name as written by a source file: tries the plain match, then the "NAME (COUNCIL)" form against ABS disambiguated names.
     * @returns {{sal_code: string|null, match_type: "exact"|"suffix_stripped"|"qualified"|"ambiguous"|"none"}}
     */
    matchSourceName(name) {
      const plain = this.match(name);
      if (plain.match_type !== "none") return plain;
      const q = qualifiedKey(name);
      const hits = q ? byQualified.get(q) ?? [] : [];
      if (hits.length === 1) return { sal_code: hits[0], match_type: "qualified" };
      if (hits.length > 1) return { sal_code: null, match_type: "ambiguous" };
      return plain;
    },
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

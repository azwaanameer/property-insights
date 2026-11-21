// The suburb key the crime table is matched on. The data build (pipeline/lib/normalise.mjs normName, then lower-cased) and the report must
// agree, or a suburb silently misses; src/server/services/normalise-parity.test.ts guards it. Layers do not import from services, so the
// rule is written out here again: upper case, apostrophes and full stops dropped, other punctuation to a space, spaces collapsed.
export function suburbKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

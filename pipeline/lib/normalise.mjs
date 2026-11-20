// Name normalisation used when loading. Must stay identical to normName in src/server/services/parse-query.ts
// (build plane and serve plane share no code; the parity test in src/server/services/normalise-parity.test.ts guards it).

/** Uppercase, drop apostrophes and full stops, other punctuation to a space, collapse spaces. */
export function normName(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Lowercase text a trigram search runs against. Built from the same fields the user types. */
export function searchText(a) {
  const num = [a.number_first, a.number_last].filter(Boolean).join(" ");
  return [num, a.street_name, a.street_type, a.street_suffix, a.locality_name, a.postcode]
    .map((p) => normName(p))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

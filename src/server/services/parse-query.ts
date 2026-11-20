// Typed address -> parts. Reference: scripts/lib.mjs parseAddr / normStreet (research code); this version keeps the
// pieces separate (unit, level, number, street, locality) instead of collapsing the street to one key.
//
// Normalisation here must stay identical to pipeline/lib/normalise.mjs (the planes share no code, only the schema).
// src/server/services/normalise-parity.test.ts asserts both agree on shared fixtures.

export interface StreetOption {
  /** Normalised street name without type, e.g. "FLINDERS" or "ST KILDA". */
  name: string;
  /** Full G-NAF street type, e.g. "STREET"; null when the user gave none. */
  type: string | null;
  /** Normalised locality words after the street, e.g. "DOCKLANDS"; null when none. */
  locality: string | null;
}

export interface ParsedQuery {
  raw: string;
  /** Flat or unit number, uppercase ("310", "5A"). Null when the query has none. */
  unit: string | null;
  /** Level number when written as "Level 3," etc. A level is not a unit. */
  level: string | null;
  /** First street number with suffix, uppercase ("628", "12A"). */
  number: string | null;
  number_last: string | null;
  postcode: string | null;
  /** Normalised words after the number, with trailing state and postcode removed. */
  words: string[];
  /** Candidate street/locality splits, most likely first. Empty when no street words. */
  streets: StreetOption[];
}

/** Uppercase, drop apostrophes and full stops, other punctuation to a space, collapse spaces. */
export function normName(s: string): string {
  return s
    .toUpperCase()
    .replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const TYPE_ABBREVIATIONS: Record<string, string> = {
  ST: "STREET", STR: "STREET", RD: "ROAD", AVE: "AVENUE", AV: "AVENUE", DR: "DRIVE", DRV: "DRIVE", PL: "PLACE",
  CT: "COURT", CRT: "COURT", LN: "LANE", PDE: "PARADE", BVD: "BOULEVARD", BLVD: "BOULEVARD", BVDE: "BOULEVARD",
  ESP: "ESPLANADE", TCE: "TERRACE", TER: "TERRACE", CRES: "CRESCENT", CR: "CRESCENT", CL: "CLOSE", HWY: "HIGHWAY",
  GR: "GROVE", CCT: "CIRCUIT", SQ: "SQUARE", PWY: "PARKWAY", FWY: "FREEWAY", PROM: "PROMENADE", GDNS: "GARDENS",
  HTS: "HEIGHTS", CWY: "CAUSEWAY", QY: "QUAY", WLK: "WALK", TRL: "TRAIL",
};

const TYPE_WORDS = new Set([
  "ROAD", "STREET", "COURT", "LANE", "TRACK", "AVENUE", "DRIVE", "PLACE", "WAY", "CRESCENT", "CLOSE", "GROVE", "WALK",
  "CIRCUIT", "BOULEVARD", "TRAIL", "HIGHWAY", "PARADE", "TERRACE", "RISE", "MEWS", "FREEWAY", "LOOP", "SQUARE", "LINK",
  "PATH", "CHASE", "GARDENS", "RETREAT", "PARKWAY", "GREEN", "PROMENADE", "ALLEY", "VISTA", "ARCADE", "RIDGE",
  "LANEWAY", "GRANGE", "ESPLANADE", "CIRCLE", "CONCOURSE", "HEIGHTS", "ROW", "MALL", "QUADRANT", "CREST", "PLAZA",
  "PASSAGE", "QUAY", "BOARDWALK", "CAUSEWAY", "WALKWAY", "PATHWAY", "VIEW", "VIEWS", "GLEN", "GLADE", "COVE", "POINT",
]);

const STATE_WORDS = new Set(["VIC", "VICTORIA", "AUSTRALIA"]);

/** Expand an abbreviation or accept a full type word. */
export function streetTypeOf(word: string): string | null {
  if (TYPE_ABBREVIATIONS[word]) return TYPE_ABBREVIATIONS[word];
  return TYPE_WORDS.has(word) ? word : null;
}

const UNIT_WORD = "(?:unit|apt|apartment|suite|flat|shop|u)";

export function parseQuery(input: string): ParsedQuery {
  const raw = input;
  let s = input.trim().replace(/\s+/g, " ");
  let unit: string | null = null;
  let level: string | null = null;

  // "Level 3, 1 X St": a level prefix. Never mistaken for a unit.
  const lv = s.match(/^(?:level|lvl|l)\s*(\d+[a-z]?)\s*(?:,|\s)\s*(?=\S)/i);
  if (lv && /\d/.test(s.slice(lv[0].length, lv[0].length + 1))) {
    level = lv[1].toUpperCase();
    s = s.slice(lv[0].length);
  }

  // "Unit 5, 12 Smith Rd", "U5/12", "Apt 5 12 Smith Rd"
  const um = s.match(new RegExp(`^${UNIT_WORD}\\s*(\\d+[a-z]?)\\s*(?:/|,|\\s)\\s*(?=\\d)`, "i"));
  if (um) {
    unit = um[1].toUpperCase();
    s = s.slice(um[0].length);
  } else {
    // "310/628 Flinders St", "310 / 628 Flinders St"
    const sm = s.match(/^([a-z]{0,2}\d+[a-z]?)\s*\/\s*(?=\d)/i);
    if (sm) {
      unit = sm[1].toUpperCase();
      s = s.slice(sm[0].length);
    }
  }

  // Street number, optionally a range: "628", "12A", "12-14"
  let number: string | null = null;
  let number_last: string | null = null;
  const nm = s.match(/^(\d+[a-z]?)(?:\s*-\s*(\d+[a-z]?))?(?=\s|,|$)\s*,?\s*/i);
  if (nm) {
    number = nm[1].toUpperCase();
    number_last = nm[2] ? nm[2].toUpperCase() : null;
    s = s.slice(nm[0].length);
  }

  let words = normName(s).split(" ").filter(Boolean);

  // Trailing postcode and state words are dropped from the locality.
  let postcode: string | null = null;
  while (words.length) {
    const last = words[words.length - 1];
    if (/^\d{4}$/.test(last) && postcode === null) postcode = words.pop()!;
    else if (STATE_WORDS.has(last)) words.pop();
    else break;
  }

  const streets: StreetOption[] = [];
  const seen = new Set<string>();
  const push = (o: StreetOption) => {
    const k = `${o.name}|${o.type}|${o.locality}`;
    if (o.name && !seen.has(k)) {
      seen.add(k);
      streets.push(o);
    }
  };
  // A type word at index >= 1 splits "name type locality". "St Kilda Road": index 0 "ST" is part of the name.
  for (let i = 1; i < words.length; i++) {
    const t = streetTypeOf(words[i]);
    if (t) push({ name: words.slice(0, i).join(" "), type: t, locality: words.slice(i + 1).join(" ") || null });
  }
  // Fallback: no usable type word, so everything is the street name.
  if (words.length) push({ name: words.join(" "), type: null, locality: null });

  return { raw, unit, level, number, number_last, postcode, words, streets };
}

/**
 * Lowercase text to compare with ref_address.search_text in a trigram search. Unit and level are dropped
 * (suggest searches property-level rows); type abbreviations after the first word are expanded ("St" -> "street").
 */
export function suggestText(p: ParsedQuery): string {
  const words = p.words.map((w, i) => (i >= 1 ? (TYPE_ABBREVIATIONS[w] ?? w) : w));
  return [p.number, p.number_last, ...words, p.postcode].filter(Boolean).join(" ").toLowerCase();
}

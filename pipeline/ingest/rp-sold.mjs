// Recent sales as reported on realestate.com.au listings -> fact_reported_sale, then publish (AD-7).
//
//   node --env-file=.env pipeline/ingest/rp-sold.mjs      load and publish into the database named by DATABASE_URL (never printed)
//   node pipeline/ingest/rp-sold.mjs --pglite             in-memory dry run on the real files in data/ (no G-NAF there, so no building is matched)
//   npm run pipeline:sold                                 the same load as a script (npm scripts do not read .env: see RUNBOOK section 13)
// Then fit the price-driver model on what was loaded: `node --env-file=.env pipeline/derive/price-drivers.mjs`.
//
// Two files, both written by the harvest scripts and never changed here (data/ is gitignored):
//   data/rp_harvest.json         { rent, sold }: `sold` holds 900 sales for the six inner suburbs (the CRM suburbs), each with crm_suburb
//   data/rp_sold_harvest.json    { retrieved, suburbs: { Name: { sal_code, rows } } }: sold listings for 20 more suburbs
// The files also carry agent, agency and phone fields. THIS LOADER READS ONLY THE PROPERTY FIELDS LISTED IN `pickProperty` and copies nothing
// else, so no agent, agency or phone value reaches the database or any output; the listing title (free text) is not read either.
//
// Cleaning, with what is dropped counted in the summary (never silently): a listing with no numeric price, a price outside $50,000 to $20,000,000
// (a car space, say), a sale date that is not a real date or lies more than two years before the harvest date or after it, a postcode that is
// not Victorian, a listing id seen twice. A coordinate outside Victoria's box is stored as null. An address with no readable street number
// keeps its row with the street fields null.
//
// G-NAF match (AD-6: matching to outside records happens here, and the match type is stored). A sale is matched to a G-NAF building when its
// street number (or range) and street are those of exactly one G-NAF building in the same suburb and postcode, through the street key
// com-buildings.mjs uses. Two buildings, another suburb, or no building is no match and building_id stays null; nothing is guessed. The match
// needs G-NAF published in the same database, so a dry run with --pglite matches nothing.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatasetVersion, countRows, makeBatchInserter, markFailed } from "../lib/dataset.mjs";
import { newestMtimeIso, sha256Of } from "../lib/files.mjs";
import { normName } from "../lib/normalise.mjs";
import { runPointCli } from "../lib/point-run.mjs";
import { ReportedSaleRow, SOLD_PRICE_RANGE } from "../lib/schemas.mjs";
import { parsePrice, parseSaleAddress, parseSoldDate, splitStreetNo } from "../lib/sold.mjs";
import { loadAndPublish } from "../lib/suburb-run.mjs";
import { minRows, notMuchSmallerThanPrevious, rowCountMatchesDeclared, sqlCheck } from "../publish/publish.mjs";
import { gnafStreetKey } from "./com-buildings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_FILES = { harvest: path.join(root, "data", "rp_harvest.json"), sold: path.join(root, "data", "rp_sold_harvest.json") };
export const SOURCE_ID = "rp_sold_listings";
/** Sales may be this many years older than the harvest date, and none may be newer. */
export const WINDOW_YEARS = 2;

/**
 * The ABS SAL 2021 codes of the six CRM suburbs in rp_harvest.json (their harvest label is the CRM name). The same codes are in
 * data/rp_suburb_priority.json. The 20 suburbs of rp_sold_harvest.json carry their own sal_code.
 */
export const CRM_SAL = {
  "Melbourne CBD": "21640",
  Southbank: "22315",
  Docklands: "20766",
  "St Kilda": "22343",
  "South Yarra": "22314",
  "Port Melbourne": "22107",
};

export class SoldDataError extends Error {
  constructor(problems) {
    super(`the sold-listings files are not usable; nothing published: ${problems.join("; ")}`);
    this.name = "SoldDataError";
    this.problems = problems;
  }
}

export class SchemaFailure extends Error {
  constructor(count, first) {
    super(`${count} sale row(s) failed the schema; nothing published. First: ${first.join(" | ")}`);
    this.name = "SchemaFailure";
  }
}

const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" && v !== undefined ? Math.round(Number(v)) : null);
const inVic = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -39.3 && lat <= -33.9 && lon >= 140.9 && lon <= 150.1;

/**
 * The property fields of one listing and nothing else. This is the only place a harvest row is read: agent, agency, phone, title, furnished and
 * the rest are not copied, so they cannot reach a table or an output.
 */
export function pickProperty(r, harvest_suburb, sal_code) {
  return {
    harvest_suburb,
    sal_code,
    listingId: r?.listingId === undefined || r?.listingId === null ? "" : String(r.listingId),
    address: typeof r?.address === "string" ? r.address : "",
    suburb: typeof r?.suburb === "string" ? r.suburb : "",
    postcode: r?.postcode === undefined || r?.postcode === null ? "" : String(r.postcode),
    lat: typeof r?.lat === "number" ? r.lat : Number.NaN,
    lon: typeof r?.lon === "number" ? r.lon : Number.NaN,
    price: typeof r?.price === "string" || typeof r?.price === "number" ? r.price : "",
    type: typeof r?.type === "string" ? r.type : "",
    bed: int(r?.bed),
    bath: int(r?.bath),
    park: int(r?.park),
    dateSold: typeof r?.dateSold === "string" ? r.dateSold : "",
    url: typeof r?.url === "string" ? r.url : "",
  };
}

/** Both files -> the property rows (before cleaning), the list of harvested suburbs and the harvest date in the sold file. */
export function readHarvests({ harvest, sold }) {
  const problems = [];
  let h;
  let s;
  try {
    h = JSON.parse(harvest);
  } catch {
    problems.push("rp_harvest.json is not JSON");
  }
  try {
    s = JSON.parse(sold);
  } catch {
    problems.push("rp_sold_harvest.json is not JSON");
  }
  if (problems.length) throw new SoldDataError(problems);
  if (!Array.isArray(h?.sold)) problems.push("rp_harvest.json has no `sold` list");
  if (!s || typeof s !== "object" || typeof s.suburbs !== "object" || s.suburbs === null) problems.push("rp_sold_harvest.json has no `suburbs` object");
  if (typeof s?.retrieved !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved)) problems.push("rp_sold_harvest.json has no `retrieved` date");
  if (problems.length) throw new SoldDataError(problems);

  const rows = [];
  const unknown = new Set();
  for (const r of h.sold) {
    const label = typeof r?.crm_suburb === "string" ? r.crm_suburb : "";
    if (!CRM_SAL[label]) {
      unknown.add(label || "(none)");
      continue;
    }
    rows.push(pickProperty(r, label, CRM_SAL[label]));
  }
  if (unknown.size) problems.push(`rp_harvest.json has sales for suburbs with no known SAL code: ${[...unknown].slice(0, 5).join(", ")}`);
  const suburbs = [];
  for (const [name, v] of Object.entries(s.suburbs)) {
    const list = Array.isArray(v?.rows) ? v.rows : [];
    if (list.length === 0) continue;
    if (typeof v.sal_code !== "string" || !/^2\d{4}$/.test(v.sal_code)) {
      problems.push(`rp_sold_harvest.json suburb ${name} has no Victorian SAL code`);
      continue;
    }
    for (const r of list) rows.push(pickProperty(r, name, v.sal_code));
  }
  if (problems.length) throw new SoldDataError(problems);
  return { rows, harvested_on: s.retrieved, records: { harvest: h.sold.length, sold: Object.values(s.suburbs).reduce((n, v) => n + (Array.isArray(v?.rows) ? v.rows.length : 0), 0) } };
}

const yearsBefore = (iso, n) => `${Number(iso.slice(0, 4)) - n}${iso.slice(4)}`;

/**
 * Pure: the property rows -> the sale rows to store, with what was dropped and why. `as_of` is the harvest date.
 * @returns {{ rows: any[], left_out: Record<string, number> }}
 */
export function buildSaleRows(raw, { as_of, windowYears = WINDOW_YEARS } = {}) {
  const left_out = { no_price: 0, price_out_of_range: 0, bad_date: 0, outside_window: 0, not_victorian: 0, no_type: 0, duplicate: 0 };
  const rows = [];
  const seen = new Set();
  const oldest = yearsBefore(as_of, windowYears);
  for (const r of raw) {
    const price = parsePrice(r.price);
    if (price === null) {
      left_out.no_price++;
      continue;
    }
    if (price < SOLD_PRICE_RANGE[0] || price > SOLD_PRICE_RANGE[1]) {
      left_out.price_out_of_range++;
      continue;
    }
    const sold_on = parseSoldDate(r.dateSold);
    if (sold_on === null) {
      left_out.bad_date++;
      continue;
    }
    if (sold_on < oldest || sold_on > as_of) {
      left_out.outside_window++;
      continue;
    }
    if (!/^3\d{3}$/.test(r.postcode)) {
      left_out.not_victorian++;
      continue;
    }
    const type = r.type.trim().toLowerCase();
    if (!type) {
      left_out.no_type++;
      continue;
    }
    if (seen.has(r.listingId)) {
      left_out.duplicate++;
      continue;
    }
    seen.add(r.listingId);
    const addr = parseSaleAddress(r.address);
    const located = inVic(r.lat, r.lon);
    rows.push({
      listing_id: r.listingId,
      address_text: r.address.replace(/\s+/g, " ").trim(),
      street_key: addr?.street_key ?? null,
      unit_no: addr?.unit_no ?? null,
      street_no: addr?.street_no ?? null,
      suburb: r.suburb.trim(),
      suburb_key: normName(r.suburb).toLowerCase(),
      postcode: r.postcode,
      harvest_suburb: r.harvest_suburb,
      sal_code: r.sal_code,
      lat: located ? r.lat : null,
      lon: located ? r.lon : null,
      price_aud: price,
      bed: r.bed,
      bath: r.bath,
      park: r.park,
      property_type: type,
      sold_on,
      url: r.url,
      building_id: null,
      match_type: null,
    });
  }
  return { rows, left_out };
}

// ---------------------------------------------------------------- matching to G-NAF buildings

/**
 * Pure. `sales` are sale rows; `gnaf` are G-NAF property-level addresses of multi-unit buildings ({ building_id, number_first, number_last,
 * street_name, street_name_norm, street_type, street_suffix, locality_norm, postcode }). A sale is matched when exactly one building has its
 * street number (or range), street, suburb and postcode. Returns Map(listing_id -> building_id) and counts of what was left unmatched.
 */
export function matchSalesToBuildings(sales, gnaf) {
  const index = new Map();
  for (const g of gnaf) {
    if (!g.number_first || !g.building_id) continue;
    const key = [normName(g.locality_norm), g.postcode ?? "", String(g.number_first).toUpperCase(), g.number_last ? String(g.number_last).toUpperCase() : "", gnafStreetKey(g)].join("|");
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(g.building_id);
  }
  const matches = new Map();
  const stats = { no_street_number: 0, no_candidate: 0, ambiguous: 0 };
  for (const s of sales) {
    if (!s.street_no || !s.street_key) {
      stats.no_street_number++;
      continue;
    }
    const { first, last } = splitStreetNo(s.street_no);
    const found = index.get([s.suburb_key.toUpperCase(), s.postcode, first, last ?? "", s.street_key].join("|"));
    if (!found) stats.no_candidate++;
    else if (found.size === 1) matches.set(s.listing_id, [...found][0]);
    else stats.ambiguous++;
  }
  return { matches, stats };
}

/** G-NAF property-level addresses of multi-unit buildings in these suburbs and postcodes, through the current gnaf pointer. Empty when gnaf is not published. */
export async function readGnafBuildingCandidates(db, { localities, postcodes }) {
  const published = await db.query("SELECT 1 FROM src_dataset_current WHERE source_id = 'gnaf'");
  if (published.length === 0) return { published: false, rows: [] };
  const rows = await db.query(
    `SELECT DISTINCT a.building_id, a.number_first, a.number_last, a.street_name, a.street_name_norm, a.street_type, a.street_suffix, a.locality_norm, a.postcode
     FROM ref_address a
     JOIN src_dataset_current c ON c.source_id = 'gnaf' AND c.dataset_version_id = a.dataset_version_id
     JOIN ref_building b ON b.dataset_version_id = a.dataset_version_id AND b.building_id = a.building_id
     WHERE a.is_property_level AND a.number_first IS NOT NULL AND a.locality_norm = ANY($1::text[]) AND a.postcode = ANY($2::text[])`,
    [localities, postcodes],
  );
  return { published: true, rows };
}

// ---------------------------------------------------------------- load

const COLUMNS = [
  { name: "listing_id", type: "text" },
  { name: "address_text", type: "text" },
  { name: "street_key", type: "text" },
  { name: "unit_no", type: "text" },
  { name: "street_no", type: "text" },
  { name: "suburb", type: "text" },
  { name: "suburb_key", type: "text" },
  { name: "postcode", type: "text" },
  { name: "harvest_suburb", type: "text" },
  { name: "sal_code", type: "text" },
  { name: "lat", type: "double precision" },
  { name: "lon", type: "double precision" },
  { name: "price_aud", type: "integer" },
  { name: "bed", type: "integer" },
  { name: "bath", type: "integer" },
  { name: "park", type: "integer" },
  { name: "property_type", type: "text" },
  { name: "sold_on", type: "date" },
  { name: "url", type: "text" },
  { name: "building_id", type: "text" },
  { name: "match_type", type: "text" },
];

/** Read both files; the harvest date is the newest of the sold file's `retrieved` and the harvest file's modification date. */
async function readFiles(files) {
  const missing = [];
  for (const [k, f] of Object.entries(files)) {
    try {
      await stat(f);
    } catch {
      missing.push(`${k} file ${path.basename(f)}`);
    }
  }
  if (missing.length) throw new SoldDataError([`missing ${missing.join(", ")} in data/ (the harvest scripts write them)`]);
  const [harvest, sold] = await Promise.all([readFile(files.harvest, "utf8"), readFile(files.sold, "utf8")]);
  const retrieved_at = await newestMtimeIso([files.harvest, files.sold]);
  return { texts: { harvest, sold }, file_sha256: await sha256Of([files.harvest, files.sold]), retrieved_at, harvest_mtime: (await stat(files.harvest)).mtime.toISOString().slice(0, 10) };
}

/**
 * Parse, clean, match, validate and insert under one new dataset version (status `loading`).
 * @param {any} db
 * @param {{ files?: { harvest: string, sold: string }, texts?: { harvest: string, sold: string }, as_of?: string, retrieved_at?: string, gnaf?: { published: boolean, rows: any[] }, log?: (m: string) => void }} [opts]
 */
export async function loadSold(db, { files = DEFAULT_FILES, texts, as_of, retrieved_at, gnaf, log = () => {} } = {}) {
  const read = texts ? null : await readFiles(files);
  const parsed = readHarvests(texts ?? read.texts);
  const harvestedOn = as_of ?? (read ? [parsed.harvested_on, read.harvest_mtime].sort().at(-1) : parsed.harvested_on);
  const { rows, left_out } = buildSaleRows(parsed.rows, { as_of: harvestedOn });
  if (rows.length === 0) throw new SoldDataError(["no sale survived cleaning, so nothing was loaded"]);

  const found = gnaf ?? (await readGnafBuildingCandidates(db, { localities: [...new Set(rows.map((r) => r.suburb_key.toUpperCase()))], postcodes: [...new Set(rows.map((r) => r.postcode))] }));
  const { matches, stats } = found.published ? matchSalesToBuildings(rows, found.rows) : { matches: new Map(), stats: null };
  for (const r of rows) {
    const b = matches.get(r.listing_id);
    if (b) {
      r.building_id = b;
      r.match_type = "exact_street_number";
    }
  }
  log(found.published ? `matched ${matches.size} of ${rows.length} sales to a G-NAF building (left unmatched: ${JSON.stringify(stats)})` : "gnaf is not published here, so no sale is matched to a G-NAF building");

  const bad = [];
  const valid = [];
  for (const r of rows) {
    const ok = ReportedSaleRow.safeParse(r);
    if (ok.success) valid.push(ok.data);
    else bad.push(`${r.listing_id} ${r.address_text}: ${ok.error.issues[0].path.join(".")} ${ok.error.issues[0].message}`);
  }
  if (bad.length) throw new SchemaFailure(bad.length, bad.slice(0, 3));

  const id = await createDatasetVersion(db, {
    source_id: SOURCE_ID,
    retrieved_at: retrieved_at ?? read?.retrieved_at ?? new Date().toISOString(),
    file_sha256: read?.file_sha256 ?? null,
    as_of: harvestedOn,
    row_count: valid.length,
    states: ["VIC"],
  });
  try {
    const insert = makeBatchInserter(db, "fact_reported_sale", COLUMNS, id);
    for (let i = 0; i < valid.length; i += 1000) {
      await insert(
        valid.slice(i, i + 1000).map((r) => [
          r.listing_id, r.address_text, r.street_key, r.unit_no, r.street_no, r.suburb, r.suburb_key, r.postcode, r.harvest_suburb, r.sal_code,
          r.lat, r.lon, r.price_aud, r.bed, r.bath, r.park, r.property_type, r.sold_on, r.url, r.building_id, r.match_type,
        ]),
      );
    }
    const dates = valid.map((r) => r.sold_on).sort();
    const suburbs = [...new Set(valid.map((r) => r.sal_code))];
    log(`loaded ${await countRows(db, "fact_reported_sale", id)} sales for ${suburbs.length} suburbs, sold ${dates[0]} to ${dates.at(-1)}; dropped ${JSON.stringify(left_out)}`);
    return {
      dataset_version_id: id,
      source_id: SOURCE_ID,
      rows: valid.length,
      files: [],
      as_of: harvestedOn,
      records: parsed.records,
      suburbs: suburbs.length,
      window: { from: dates[0], to: dates.at(-1) },
      matched: matches.size,
      gnaf_published: found.published,
      left_out,
      match_stats: stats,
    };
  } catch (err) {
    await markFailed(db, id);
    throw err;
  }
}

/**
 * Publish checks (SQL, in the publish transaction): the declared row count, a minimum, no shrink below 80% of the current version, every
 * price inside $50,000 to $20,000,000, every sale date within two years before the harvest date and not after it, no duplicate listing id, at
 * least `minimumSuburbs` harvested suburbs, and, only when the suburb list or G-NAF is published in the same database, that every SAL code is
 * a known suburb and every building id a known G-NAF building.
 */
export const soldChecks = ({ minimum = 3000, minimumSuburbs = 20, windowYears = WINDOW_YEARS } = {}) => [
  rowCountMatchesDeclared("fact_reported_sale"),
  minRows("fact_reported_sale", minimum),
  notMuchSmallerThanPrevious(0.8),
  sqlCheck(
    `fact_reported_sale has a price outside $${SOLD_PRICE_RANGE[0].toLocaleString("en-AU")} to $${SOLD_PRICE_RANGE[1].toLocaleString("en-AU")}`,
    `SELECT NOT EXISTS (SELECT 1 FROM fact_reported_sale WHERE dataset_version_id = $1 AND (price_aud < ${SOLD_PRICE_RANGE[0]} OR price_aud > ${SOLD_PRICE_RANGE[1]})) AS ok`,
  ),
  sqlCheck(
    `fact_reported_sale has a sale date more than ${windowYears} years before the harvest date, or after it`,
    `SELECT NOT EXISTS (
       SELECT 1 FROM fact_reported_sale s JOIN src_dataset_version v ON v.dataset_version_id = s.dataset_version_id
       WHERE s.dataset_version_id = $1 AND (s.sold_on < v.as_of - interval '${Number(windowYears)} years' OR s.sold_on > v.as_of)) AS ok`,
  ),
  sqlCheck("fact_reported_sale has a duplicate listing id", `SELECT count(*) = count(DISTINCT listing_id) AS ok FROM fact_reported_sale WHERE dataset_version_id = $1`),
  sqlCheck(
    `fact_reported_sale covers fewer than ${minimumSuburbs} suburbs`,
    `SELECT count(DISTINCT sal_code) >= ${Number(minimumSuburbs)} AS ok FROM fact_reported_sale WHERE dataset_version_id = $1 AND sal_code IS NOT NULL`,
  ),
  sqlCheck(
    "fact_reported_sale has a SAL code that is not in the published suburb list",
    `SELECT (NOT EXISTS (SELECT 1 FROM src_dataset_current WHERE source_id = 'abs_asgs_2021')
             OR NOT EXISTS (
               SELECT 1 FROM fact_reported_sale t
               WHERE t.dataset_version_id = $1 AND t.sal_code IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM ref_suburb s JOIN src_dataset_current c ON c.source_id = 'abs_asgs_2021' AND c.dataset_version_id = s.dataset_version_id
                   WHERE s.sal_code = t.sal_code))) AS ok`,
  ),
  sqlCheck(
    "fact_reported_sale has a building id that is not a G-NAF building",
    `SELECT (NOT EXISTS (SELECT 1 FROM src_dataset_current WHERE source_id = 'gnaf')
             OR NOT EXISTS (
               SELECT 1 FROM fact_reported_sale t
               WHERE t.dataset_version_id = $1 AND t.building_id IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM ref_building b JOIN src_dataset_current c ON c.source_id = 'gnaf' AND c.dataset_version_id = b.dataset_version_id
                   WHERE b.building_id = t.building_id))) AS ok`,
  ),
];

/**
 * @param {any} db
 * @param {{ files?: { harvest: string, sold: string }, texts?: { harvest: string, sold: string }, as_of?: string, gnaf?: any, minimum?: number, minimumSuburbs?: number, log?: (m: string) => void }} [opts]
 */
export async function runSold(db, { files, texts, as_of, gnaf, minimum, minimumSuburbs, log } = {}) {
  return loadAndPublish(db, {
    source_id: SOURCE_ID,
    checks: soldChecks({ minimum, minimumSuburbs }),
    load: () => loadSold(db, { files, texts, as_of, gnaf, log }),
  });
}

/** A per-suburb count of loaded sales, for the printed summary. */
export async function soldBySuburb(db, datasetVersionId) {
  return db.query(
    `SELECT harvest_suburb, sal_code, count(*)::int AS sales, count(*) FILTER (WHERE building_id IS NOT NULL)::int AS matched
     FROM fact_reported_sale WHERE dataset_version_id = $1 GROUP BY harvest_suburb, sal_code ORDER BY sales DESC, harvest_suburb`,
    [datasetVersionId],
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPointCli(
    async (db, { log }) => {
      const out = await runSold(db, { log });
      log(`  harvest date ${out.as_of}; sold ${out.window.from} to ${out.window.to}; ${out.suburbs} suburbs; G-NAF buildings matched: ${out.matched}; dropped: ${JSON.stringify(out.left_out)}`);
      for (const s of await soldBySuburb(db, out.dataset_version_id)) log(`    ${s.harvest_suburb} (${s.sal_code}): ${s.sales} sales, ${s.matched} matched to a building`);
      return out;
    },
    { require: { table: "fact_reported_sale", migration: "0011" } },
  ).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

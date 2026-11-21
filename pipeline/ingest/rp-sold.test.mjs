// The reported-sales loader on the committed excerpt of the real harvest files (fixtures/sold), through the real loader into in-process PGlite.
// The excerpt holds 373 sales: 150 Docklands (11 of them at 628 Flinders Street, a building in the fixture G-NAF), 90 Melbourne CBD, 30 St Kilda,
// 103 South Melbourne, and Carlton with no rows. Agent, agency, phone and title fields hold placeholders so the tests can prove they never get in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { createSuburbDataTestDb } from "../../src/server/testing/db";
import { createDatasetVersion } from "../lib/dataset.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError, publish } from "../publish/publish.mjs";
import { CRM_SAL, SoldDataError, SchemaFailure, buildSaleRows, loadSold, matchSalesToBuildings, pickProperty, readHarvests, runSold, soldChecks } from "./rp-sold.mjs";
import { SOLD_AS_OF, SOLD_FILES, SOLD_OPTIONS, SOLD_TEXTS, soldClone, soldTexts } from "./fixtures/sold.mjs";

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'rp_sold_listings'"))[0]?.id ?? null;
const count = async (id) => (await db.query("SELECT count(*)::int AS n FROM fact_reported_sale WHERE dataset_version_id = $1", [id]))[0].n;

describe("readHarvests", () => {
  it("reads both files into property rows, labelled with the suburb the harvest searched and its SAL code", () => {
    const { rows, harvested_on, records } = readHarvests(SOLD_TEXTS);
    expect(harvested_on).toBe(SOLD_AS_OF);
    expect(records).toEqual({ harvest: 270, sold: 103 });
    expect(rows).toHaveLength(373);
    expect(new Set(rows.map((r) => `${r.harvest_suburb}|${r.sal_code}`))).toEqual(new Set(["Docklands|20766", "Melbourne CBD|21640", "St Kilda|22343", "South Melbourne|22310"]));
    expect(CRM_SAL["Docklands"]).toBe("20766");
  });

  it("picks the property fields only: no agent, agency, phone, title or any other field is read", () => {
    const { rows } = readHarvests(SOLD_TEXTS);
    expect(Object.keys(rows[0]).sort()).toEqual(["address", "bath", "bed", "dateSold", "harvest_suburb", "lat", "listingId", "lon", "park", "postcode", "price", "sal_code", "suburb", "type", "url"]);
    expect(JSON.stringify(rows)).not.toMatch(/Fixture Agen|0400000000|Fixture listing title|agentPhone/);
    const picked = pickProperty({ listingId: 7, address: "1/2 A Street", agent: "Jo", agency: "X", agentPhone: "0411111111", title: "Lovely", dateSold: "10 Nov 2026" }, "Docklands", "20766");
    expect(JSON.stringify(picked)).not.toMatch(/Jo|0411111111|Lovely|"X"/);
  });

  it.each([
    ["a suburb with no known SAL code in the harvest file", (c) => c.harvest.sold.push({ ...c.harvest.sold[0], crm_suburb: "Nowhere" }), /no known SAL code: Nowhere/],
    ["a suburb in the sold file with a bad SAL code", (c) => (c.sold.suburbs["South Melbourne"].sal_code = "99"), /South Melbourne has no Victorian SAL code/],
    ["a sold file with no retrieved date", (c) => delete c.sold.retrieved, /no `retrieved` date/],
    ["a harvest file with no sold list", (c) => delete c.harvest.sold, /no `sold` list/],
  ])("refuses %s", (_name, edit, message) => {
    const c = soldClone();
    edit(c);
    expect(() => readHarvests(soldTexts(c))).toThrow(SoldDataError);
    expect(() => readHarvests(soldTexts(c))).toThrow(message);
  });

  it("refuses text that is not JSON", () => {
    expect(() => readHarvests({ harvest: "{", sold: SOLD_TEXTS.sold })).toThrow(/rp_harvest.json is not JSON/);
  });
});

describe("buildSaleRows", () => {
  const raw = (over = {}) => ({
    harvest_suburb: "Docklands",
    sal_code: "20766",
    listingId: "152000001",
    address: "2105/628 Flinders Street",
    suburb: "Docklands",
    postcode: "3008",
    lat: -37.82,
    lon: 144.95,
    price: "$560,000",
    type: "Apartment",
    bed: 2,
    bath: 1,
    park: 0,
    dateSold: "10 Nov 2026",
    url: "property-apartment-vic-docklands-152000001",
    ...over,
  });
  const build = (list) => buildSaleRows(list, { as_of: "2026-11-21" });

  it("keeps a good sale with its parsed street, unit, price in dollars, ISO date and lower-case type", () => {
    const { rows, left_out } = build([raw()]);
    expect(left_out).toMatchObject({ no_price: 0, price_out_of_range: 0, bad_date: 0, outside_window: 0, not_victorian: 0, no_type: 0, duplicate: 0 });
    expect(rows).toEqual([
      expect.objectContaining({
        listing_id: "152000001", unit_no: "2105", street_no: "628", street_key: "FLINDERS STREET", suburb_key: "docklands", price_aud: 560000, sold_on: "2026-11-10",
        property_type: "apartment", bed: 2, bath: 1, park: 0, lat: -37.82, building_id: null, match_type: null,
      }),
    ]);
  });

  it("drops, and counts by reason, a sale with no numeric price, a price outside $50,000 to $20,000,000, a bad or out-of-window date, a non-Victorian postcode, no type and a repeated listing id", () => {
    const { rows, left_out } = build([
      raw({ listingId: "100001" }),
      raw({ listingId: "100002", price: "Contact agent" }),
      raw({ listingId: "100003", price: "$35,000" }),
      raw({ listingId: "100004", price: "$25,000,000" }),
      raw({ listingId: "100005", dateSold: "Sold" }),
      raw({ listingId: "100006", dateSold: "20 Nov 2024" }), // more than two years before 2026-11-21
      raw({ listingId: "100007", dateSold: "22 Nov 2026" }), // after the harvest date
      raw({ listingId: "100008", postcode: "2000" }),
      raw({ listingId: "100009", type: " " }),
      raw({ listingId: "100001" }),
    ]);
    expect(rows.map((r) => r.listing_id)).toEqual(["100001"]);
    expect(left_out).toEqual({ no_price: 1, price_out_of_range: 2, bad_date: 1, outside_window: 2, not_victorian: 1, no_type: 1, duplicate: 1 });
  });

  it("accepts a sale exactly two years before the harvest date and one on it", () => {
    expect(build([raw({ listingId: "1000010", dateSold: "21 Nov 2024" }), raw({ listingId: "1000011", dateSold: "21 Nov 2026" })]).rows).toHaveLength(2);
  });

  it("stores a coordinate outside Victoria as null, and an address with no readable street number with null street fields (the row is kept)", () => {
    const { rows } = build([raw({ listingId: "100020", lat: -33.8, lon: 151.2 }), raw({ listingId: "100021", address: "27/K11 Raleigh Street" })]);
    expect(rows[0]).toMatchObject({ lat: null, lon: null });
    expect(rows[1]).toMatchObject({ street_key: null, street_no: null, unit_no: null });
  });
});

describe("matchSalesToBuildings", () => {
  const sale = (id, over = {}) => ({ listing_id: id, street_no: "628", street_key: "FLINDERS STREET", suburb_key: "docklands", postcode: "3008", ...over });
  const g = (building_id, over = {}) => ({ building_id, number_first: "628", number_last: null, street_name: "FLINDERS", street_name_norm: "FLINDERS", street_type: "STREET", street_suffix: null, locality_norm: "DOCKLANDS", postcode: "3008", ...over });

  it("matches a sale whose street number, street, suburb and postcode are those of exactly one building", () => {
    const { matches, stats } = matchSalesToBuildings([sale("1")], [g("GAVIC1"), g("GAVIC2", { number_first: "630" })]);
    expect([...matches]).toEqual([["1", "GAVIC1"]]);
    expect(stats).toEqual({ no_street_number: 0, no_candidate: 0, ambiguous: 0 });
  });

  it("is no match for two buildings with the same key, another suburb, another postcode, a different number or a missing street number", () => {
    const sales = [sale("a"), sale("b", { suburb_key: "southbank" }), sale("c", { postcode: "3006" }), sale("d", { street_no: "629" }), sale("e", { street_no: null })];
    const { matches, stats } = matchSalesToBuildings(sales, [g("GAVIC1"), g("GAVIC2")]);
    expect(matches.size).toBe(0);
    expect(stats).toEqual({ no_street_number: 1, no_candidate: 3, ambiguous: 1 });
  });

  it("matches a range to the same range only, and a spelled-out suffix to the abbreviated one", () => {
    const { matches } = matchSalesToBuildings(
      [sale("r", { street_no: "11-17", street_key: "COHEN PLACE" }), sale("s", { street_no: "11", street_key: "COHEN PLACE" }), sale("t", { street_key: "LITTLE DRYBURGH STREET SOUTH", street_no: "37" })],
      [g("GAVIC9", { number_first: "11", number_last: "17", street_name_norm: "COHEN", street_type: "PLACE" }), g("GAVIC8", { number_first: "37", street_name_norm: "LITTLE DRYBURGH", street_type: "STREET", street_suffix: "S" })],
    );
    expect([...matches]).toEqual([["r", "GAVIC9"], ["t", "GAVIC8"]]);
  });
});

describe("loadSold and runSold on the excerpt", () => {
  it("publishes one dataset version of source rp_sold_listings with the harvest date and every cleaned sale", async () => {
    const out = await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    expect(await pointer()).toBe(out.dataset_version_id);
    expect(out).toMatchObject({ rows: 373, as_of: SOLD_AS_OF, suburbs: 4, matched: 0, gnaf_published: false });
    expect(out.window.from <= out.window.to).toBe(true);
    expect(await count(out.dataset_version_id)).toBe(373);
    const [v] = await db.query("SELECT status, row_count::int AS n, licence_snapshot, states, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM src_dataset_version WHERE dataset_version_id = $1", [out.dataset_version_id]);
    expect(v).toMatchObject({ status: "published", n: 373, states: ["VIC"], as_of: SOLD_AS_OF });
    expect(v.licence_snapshot).toContain("reuse ruled acceptable by the owner 2026-11-21");
  });

  it("reads the real file layout from disk too (the harvest date given, since a checked-out file's modification date is not the harvest date)", async () => {
    const out = await loadSold(db, { files: SOLD_FILES, as_of: SOLD_AS_OF });
    expect(out.rows).toBe(373);
    const [v] = await db.query("SELECT file_sha256 FROM src_dataset_version WHERE dataset_version_id = $1", [out.dataset_version_id]);
    expect(v.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores no agent, agency, phone or listing title anywhere: not in a column, a row or the summary", async () => {
    const out = await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'fact_reported_sale'")).map((r) => r.column_name);
    expect(cols.filter((c) => /agent|agency|phone|title|description|text$/.test(c) && c !== "address_text")).toEqual([]);
    const rows = await db.query("SELECT * FROM fact_reported_sale");
    expect(JSON.stringify(rows)).not.toMatch(/Fixture Agen|Fixture listing|0400000000/i);
    expect(JSON.stringify(out)).not.toMatch(/Fixture Agen|Fixture listing|0400000000/i);
  });

  it("keeps the listing's own url, which is a path on realestate.com.au, and nothing else of the page", async () => {
    await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    const urls = (await db.query("SELECT DISTINCT url FROM fact_reported_sale")).map((r) => r.url);
    expect(urls.length).toBeGreaterThan(300);
    for (const u of urls) expect(u).toMatch(/^property-[a-z0-9+ -]+$/);
  });

  it("with an unusable file nothing is created", async () => {
    const c = soldClone();
    c.harvest.sold.push({ ...c.harvest.sold[0], crm_suburb: "Nowhere" });
    await expect(runSold(db, { texts: soldTexts(c), as_of: SOLD_AS_OF, ...SOLD_OPTIONS })).rejects.toThrow(SoldDataError);
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version"))[0].n).toBe(0);
  });

  it("a sale that fails the schema stops the load before anything is created", async () => {
    const c = soldClone();
    c.harvest.sold[0].url = "https://evil.example/x"; // not a listing path
    await expect(runSold(db, { texts: soldTexts(c), as_of: SOLD_AS_OF, ...SOLD_OPTIONS })).rejects.toThrow(SchemaFailure);
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version"))[0].n).toBe(0);
  });

  it("a failed publish check leaves the old dataset live and deletes the failed version's rows", async () => {
    const first = await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    // A second load with a bar the excerpt cannot reach is refused.
    const err = await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS, minimum: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.message).toMatch(/fewer than the minimum 5000/);
    expect(await pointer()).toBe(first.dataset_version_id);
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE status = 'failed'");
    expect(failed).toHaveLength(1);
    expect(await count(failed[0].id)).toBe(0);
    expect(await count(first.dataset_version_id)).toBe(373);
  });

  it("a load that shrinks below 80% of the current dataset is refused", async () => {
    await runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    const c = soldClone();
    c.harvest.sold = c.harvest.sold.slice(0, 100);
    await expect(runSold(db, { texts: soldTexts(c), as_of: SOLD_AS_OF, ...SOLD_OPTIONS, minimum: 10 })).rejects.toThrow(/below 80% of the current version/);
  });

  it("refuses a dataset covering fewer suburbs than the bar", async () => {
    await expect(runSold(db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS, minimumSuburbs: 20 })).rejects.toThrow(/covers fewer than 20 suburbs/);
  });

  it("the left-out counts are in the summary: a $35,000 listing and one with no price are dropped, not loaded", async () => {
    const c = soldClone();
    c.harvest.sold.push({ ...c.harvest.sold[0], listingId: "99000001", price: "$35,000" }, { ...c.harvest.sold[0], listingId: "99000002", price: "Contact agent" });
    const out = await runSold(db, { texts: soldTexts(c), as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
    expect(out.rows).toBe(373);
    expect(out.left_out).toMatchObject({ price_out_of_range: 1, no_price: 1 });
  });
});

describe("the SQL publish checks catch what the cleaning would have dropped", () => {
  async function badVersion(row) {
    const id = await createDatasetVersion(db, { source_id: "rp_sold_listings", retrieved_at: new Date().toISOString(), file_sha256: null, as_of: "2026-11-21", row_count: 1, states: ["VIC"] });
    await db.query(
      `INSERT INTO fact_reported_sale (dataset_version_id, listing_id, address_text, suburb, suburb_key, postcode, harvest_suburb, sal_code, price_aud, property_type, sold_on, url, building_id, match_type)
       VALUES ($1, $2, '1/1 A Street', 'Docklands', 'docklands', '3008', 'Docklands', '20766', $3, 'apartment', $4, 'property-apartment-vic-docklands-1', $5, $6)`,
      [id, "100001", row.price ?? 500000, row.sold_on ?? "2026-11-01", row.building_id ?? null, row.building_id ? "exact_street_number" : null],
    );
    return id;
  }
  const refused = async (row) => {
    const id = await badVersion(row);
    const err = await publish(db, { source_id: "rp_sold_listings", dataset_version_id: id, checks: soldChecks({ minimum: 1, minimumSuburbs: 1 }) }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(await pointer()).toBeNull();
    return err.message;
  };

  it("a price below $50,000 or above $20,000,000", async () => {
    expect(await refused({ price: 49_999 })).toMatch(/price outside \$50,000 to \$20,000,000/);
  });
  it("a sale date after the harvest date, or more than two years before it", async () => {
    expect(await refused({ sold_on: "2026-11-22" })).toMatch(/more than 2 years before the harvest date, or after it/);
  });
  it("a building id that is not a G-NAF building, once G-NAF is published", async () => {
    // Publish a G-NAF stand-in so the check is live: a published pointer with no ref_building rows.
    const g = await createDatasetVersion(db, { source_id: "gnaf", retrieved_at: new Date().toISOString(), file_sha256: null, as_of: "2026-08-31", row_count: 0, states: ["VIC"] });
    await publish(db, { source_id: "gnaf", dataset_version_id: g });
    expect(await refused({ building_id: "GAVIC999999999" })).toMatch(/building id that is not a G-NAF building/);
  });
});

describe("matching to G-NAF buildings on the fixture addresses", () => {
  it("matches the 11 sales at 628 Flinders Street, Docklands to the building of the Docklands test address and nothing else", async () => {
    const t = await createSuburbDataTestDb({ omit: ["sold", "drivers"] });
    try {
      const out = await runSold(t.db, { texts: SOLD_TEXTS, as_of: SOLD_AS_OF, ...SOLD_OPTIONS });
      expect(out).toMatchObject({ rows: 373, matched: 11, gnaf_published: true });
      const rows = await t.db.query("SELECT address_text, building_id, match_type FROM fact_reported_sale WHERE building_id IS NOT NULL ORDER BY listing_id");
      expect(rows).toHaveLength(11);
      for (const r of rows) {
        expect(r.address_text).toMatch(/\/628 Flinders Street$/);
        expect(r).toMatchObject({ building_id: "GAVIC100000001", match_type: "exact_street_number" });
      }
      // The same number and street in Melbourne (3000) is a different G-NAF row and not a multi-unit building: no sale there is matched to it.
      expect((await t.db.query("SELECT count(*)::int AS n FROM fact_reported_sale WHERE building_id IS NOT NULL AND suburb_key <> 'docklands'"))[0].n).toBe(0);
    } finally {
      await t.close();
    }
  });
});

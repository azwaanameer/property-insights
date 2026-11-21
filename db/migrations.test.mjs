import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDevSeed, applyMigrations, isLocalDatabaseUrl } from "./migrate.mjs";
import { openPglite } from "../pipeline/lib/db.mjs";

let db;
let close;
beforeAll(async () => {
  ({ db, close } = await openPglite());
});
afterAll(() => close());

describe("migrations", () => {
  it("apply once, record themselves, and are idempotent", async () => {
    expect(await applyMigrations(db)).toEqual(["0001_core.sql", "0002_seed.sql", "0003_clear_gnaf.sql", "0004_vic_suburb_layers.sql", "0005_purchases.sql", "0006_return_rating_questions.sql", "0007_batch2_layers.sql", "0008_crime.sql", "0009_photos_places.sql", "0010_places_dataset.sql", "0011_sold_dataset.sql"]);
    expect(await applyMigrations(db)).toEqual([]);
  });

  it("create every table the spec lists", async () => {
    const want = ["src_source", "src_dataset_version", "src_dataset_current", "ref_suburb", "ref_building", "ref_address", "series_price", "series_rent", "derived_rating", "market_validation", "layer_config", "fact_suburb_marker", "ref_suburb_neighbour", "src_dataset_unmatched", "app_user", "app_org", "app_subscription", "app_report", "app_lookup_log", "app_purchase", "app_webhook_event", "vendor_cache", "ref_transit_stop", "ref_school_zone", "ref_school", "ref_com_building", "ref_com_building_match", "fact_supply_project", "fact_crime_suburb", "fact_crime_lga", "fact_crime_note", "ref_place", "fact_reported_sale", "derived_price_driver", "derived_layout_median"];
    const have = new Set((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name));
    for (const t of want) expect(have.has(t), t).toBe(true);
  });

  it("seed: VIC/unit validated 0.74-0.80; sources carry rights status", async () => {
    const [mv] = await db.query("SELECT * FROM market_validation WHERE state = 'VIC' AND dwelling_type = 'unit'");
    expect(mv).toMatchObject({ status: "validated", pairwise_score_low: 0.74, pairwise_score_high: 0.8 });
    const rights = Object.fromEntries((await db.query("SELECT source_id, rights_status FROM src_source")).map((r) => [r.source_id, r.rights_status]));
    // gnaf was cleared by migration 0003 (owner statement, 2026-11-14).
    expect(rights).toMatchObject({ gnaf: "cleared", microburbs: "pending", shortstay_vendor: "pending", rea_rapidapi: "blocked" });
    expect(rights).toMatchObject({ vgv_medians: "cleared", homes_victoria_rents: "cleared", abs_census_2021: "cleared", abs_seifa_2021: "cleared", gnaf_neighbours: "cleared" });
  });

  it("production migrations alone leave gnaf cleared (0003) with the note, and L01 switched on", async () => {
    const [g] = await db.query("SELECT rights_status, notes FROM src_source WHERE source_id = 'gnaf'");
    expect(g.rights_status).toBe("cleared");
    expect(g.notes).toContain("CLEARED 2026-11-14");
    const [l] = await db.query("SELECT enabled FROM layer_config WHERE layer_id = 'L01-property'");
    expect(l.enabled).toBe(true);
  });

  it("0004 switches on L02, L03, L07 and L09 with their sources, and every source is cleared with attribution text", async () => {
    const rows = await db.query("SELECT layer_id, tier, enabled, source_ids FROM layer_config WHERE layer_id IN ('L02-rent','L03-price','L07-history','L09-suburb-compare') ORDER BY layer_id");
    expect(rows.map((r) => [r.layer_id, r.tier, r.enabled])).toEqual([
      ["L02-rent", "free", true],
      ["L03-price", "free", true],
      ["L07-history", "free", true],
      ["L09-suburb-compare", "free", true],
    ]);
    const sources = await db.query("SELECT source_id, licence, rights_status, attribution_text FROM src_source WHERE source_id IN ('vgv_medians','homes_victoria_rents','abs_census_2021','abs_seifa_2021','gnaf_neighbours')");
    expect(sources).toHaveLength(5);
    for (const src of sources) {
      expect(src.rights_status, src.source_id).toBe("cleared");
      expect(src.licence, src.source_id).toContain("CC BY 4.0");
      expect(src.attribution_text.length, src.source_id).toBeGreaterThan(10);
    }
  });

  it("0006 adds the cleared conditions_rating source and switches on L05, L15 and L13 as free layers with their sources", async () => {
    const [src] = await db.query("SELECT licence, rights_status, attribution_text FROM src_source WHERE source_id = 'conditions_rating'");
    expect(src.rights_status).toBe("cleared");
    expect(src.licence).toContain("CC BY 4.0");
    expect(src.attribution_text).toContain("Australian Bureau of Statistics");
    expect(src.attribution_text).toContain("Valuer-General");
    const rows = await db.query("SELECT layer_id, tier, enabled, source_ids FROM layer_config WHERE layer_id IN ('L05-return','L15-conditions','L13-questions') ORDER BY layer_id");
    expect(rows.map((r) => [r.layer_id, r.tier, r.enabled])).toEqual([
      ["L05-return", "free", true],
      ["L13-questions", "free", true],
      ["L15-conditions", "free", true],
    ]);
    // Every source a new layer lists must be cleared, which the layer_config trigger enforced when the rows went in.
    const sources = new Set(rows.flatMap((r) => r.source_ids));
    const cleared = new Set((await db.query("SELECT source_id FROM src_source WHERE rights_status = 'cleared'")).map((r) => r.source_id));
    for (const id of sources) expect(cleared.has(id), id).toBe(true);
  });

  it("0007 adds three cleared sources with attribution and switches on L16, L17, L11, L08, L10 and L14 as free layers", async () => {
    const sources = await db.query("SELECT source_id, licence, rights_status, attribution_text FROM src_source WHERE source_id IN ('vic_school_zones_2026','vic_school_locations_2026','vicprop_registry')");
    expect(sources.map((s) => s.source_id).sort()).toEqual(["vic_school_locations_2026", "vic_school_zones_2026", "vicprop_registry"]);
    for (const s of sources) {
      expect(s.rights_status, s.source_id).toBe("cleared");
      expect(s.attribution_text.length, s.source_id).toBeGreaterThan(10);
    }
    expect(sources.filter((s) => s.source_id.startsWith("vic_school")).every((s) => s.licence === "CC BY 4.0")).toBe(true);
    const rows = await db.query("SELECT layer_id, tier, enabled, source_ids FROM layer_config WHERE layer_id IN ('L16-transport','L17-schools','L11-building','L08-supply','L10-screener','L14-attribution') ORDER BY layer_id");
    expect(rows.map((r) => [r.layer_id, r.tier, r.enabled])).toEqual([
      ["L08-supply", "free", true],
      ["L10-screener", "free", true],
      ["L11-building", "free", true],
      ["L14-attribution", "free", true],
      ["L16-transport", "free", true],
      ["L17-schools", "free", true],
    ]);
    // Every source a new layer lists is cleared (the layer_config trigger enforced it when the rows went in), including the two seeded in 0002.
    const cleared = new Set((await db.query("SELECT source_id FROM src_source WHERE rights_status = 'cleared'")).map((r) => r.source_id));
    for (const id of rows.flatMap((r) => r.source_ids)) expect(cleared.has(id), id).toBe(true);
    expect(rows.find((r) => r.layer_id === "L16-transport").source_ids).toContain("gtfs_vic");
    expect(rows.find((r) => r.layer_id === "L08-supply").source_ids).toContain("com_open_data");
  });

  it("0007: a school zone's school_key and a G-NAF match are keyed so a bare school number cannot collide and one G-NAF building has one match", async () => {
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ref_school'")).map((c) => c.column_name);
    expect(cols).toEqual(expect.arrayContaining(["school_key", "school_no", "sector", "lat", "lon"]));
    const pk = await db.query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'ref_com_building_match'::regclass AND i.indisprimary ORDER BY a.attname`,
    );
    expect(pk.map((r) => r.attname)).toEqual(["dataset_version_id", "gnaf_building_id"]);
  });

  it("0008 adds the cleared Crime Statistics Agency source (CC BY 4.0, with the credit and 'Adapted by VicProp') and switches on L18 as a free layer", async () => {
    const [src] = await db.query("SELECT licence, rights_status, attribution_text, notes FROM src_source WHERE source_id = 'csa_crime_incidents'");
    expect(src).toMatchObject({ licence: "CC BY 4.0", rights_status: "cleared", attribution_text: "Source: Crime Statistics Agency, Victoria. Adapted by VicProp." });
    expect(src.notes).toContain("https://creativecommons.org/licenses/by/4.0/");
    const [l] = await db.query("SELECT tier, enabled, source_ids FROM layer_config WHERE layer_id = 'L18-safety'");
    expect(l).toMatchObject({ tier: "free", enabled: true });
    expect([...l.source_ids].sort()).toEqual(["csa_crime_incidents", "gnaf"]);
    // L13 is left as batch 2 set it: crime does not prompt a question.
    const [q] = await db.query("SELECT source_ids FROM layer_config WHERE layer_id = 'L13-questions'");
    expect(q.source_ids).not.toContain("csa_crime_incidents");
  });

  it("0008: the source must be cleared before the layer can be on (AD-4), and the suburb table is keyed so one suburb in two councils has two rows", async () => {
    await db.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'csa_crime_incidents'");
    await expect(db.query("UPDATE layer_config SET enabled = true, updated_at = now() WHERE layer_id = 'L18-safety'")).rejects.toThrow(/not cleared: .*csa_crime_incidents/);
    await db.query("UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'csa_crime_incidents'");
    const pk = await db.query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'fact_crime_suburb'::regclass AND i.indisprimary ORDER BY a.attname`,
    );
    expect(pk.map((r) => r.attname)).toEqual(["dataset_version_id", "lga", "postcode", "subdivision", "suburb", "year_ending"]);
  });

  it("0009 adds the three cleared photo and place sources with their credits and switches on L19 and L20 as free layers", async () => {
    const rows = await db.query("SELECT source_id, licence, rights_status, attribution_text, max_cache_days FROM src_source WHERE source_id IN ('openstreetmap','mapillary','wikimedia_commons') ORDER BY source_id");
    expect(rows.map((r) => r.source_id)).toEqual(["mapillary", "openstreetmap", "wikimedia_commons"]);
    for (const r of rows) expect(r.rights_status).toBe("cleared");
    const by = Object.fromEntries(rows.map((r) => [r.source_id, r]));
    expect(by.openstreetmap).toMatchObject({ licence: "ODbL 1.0", attribution_text: "© OpenStreetMap contributors" });
    expect(by.mapillary).toMatchObject({ licence: "CC BY-SA 4.0", attribution_text: "Photos: Mapillary contributors, CC BY-SA 4.0" });
    expect(by.wikimedia_commons.attribution_text).toBe("Images from Wikimedia Commons; each image carries its own author and licence");
    expect(by.mapillary.max_cache_days).toBeLessThanOrEqual(7);
    // 0010 turned OpenStreetMap into a loaded dataset (no cache lifetime); the two live vendors keep theirs.
    for (const r of rows.filter((x) => x.source_id !== "openstreetmap")) expect(r.max_cache_days).toBeLessThanOrEqual(30);
    expect(by.openstreetmap.max_cache_days).toBeNull();
    const l = await db.query("SELECT layer_id, tier, enabled, source_ids FROM layer_config WHERE layer_id IN ('L19-photos','L20-places') ORDER BY layer_id");
    expect(l.map((r) => [r.layer_id, r.tier, r.enabled])).toEqual([["L19-photos", "free", true], ["L20-places", "free", true]]);
    expect([...l[0].source_ids].sort()).toEqual(["gnaf", "mapillary", "wikimedia_commons"]);
    expect([...l[1].source_ids].sort()).toEqual(["gnaf", "openstreetmap"]);
  });

  it("0009: a layer cannot be on while its source is pending (AD-4), and vendor_cache refuses a row that lives longer than 30 days", async () => {
    await db.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'openstreetmap'");
    await expect(db.query("UPDATE layer_config SET enabled = true, updated_at = now() WHERE layer_id = 'L20-places'")).rejects.toThrow(/not cleared: .*openstreetmap/);
    await db.query("UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'openstreetmap'");
    await expect(db.query("INSERT INTO vendor_cache (cache_key, vendor, payload, fetched_at, expires_at) VALUES ('k', 'v', '{}', now(), now() + interval '31 days')")).rejects.toThrow();
  });

  it("0010 adds ref_place keyed so one osm_id is one row per dataset version, restricts category, and leaves the source cleared with the credit and L20 as it was", async () => {
    const pk = await db.query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'ref_place'::regclass AND i.indisprimary ORDER BY a.attname`,
    );
    expect(pk.map((r) => r.attname)).toEqual(["dataset_version_id", "osm_id"]);
    const idx = (await db.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'ref_place'")).map((r) => r.indexdef).join(" | ");
    expect(idx).toContain("(dataset_version_id, lat, lon)");
    expect(idx).toContain("(dataset_version_id, category)");
    const [src] = await db.query("SELECT licence, rights_status, attribution_text, max_cache_days, notes FROM src_source WHERE source_id = 'openstreetmap'");
    expect(src).toMatchObject({ licence: "ODbL 1.0", rights_status: "cleared", attribution_text: "© OpenStreetMap contributors", max_cache_days: null });
    expect(src.notes).toContain("https://opendatacommons.org/licenses/odbl/1-0/");
    expect(src.notes).toContain("loaded from the Geofabrik Australia extract");
    expect(src.notes).not.toMatch(/read live|cached up to/);
    const [l] = await db.query("SELECT tier, enabled, source_ids FROM layer_config WHERE layer_id = 'L20-places'");
    expect(l).toMatchObject({ tier: "free", enabled: true });
    expect([...l.source_ids].sort()).toEqual(["gnaf", "openstreetmap"]);
    const [v] = await db.query("INSERT INTO src_dataset_version (source_id, retrieved_at, row_count, licence_snapshot, as_of) VALUES ('openstreetmap', now(), 0, 'ODbL 1.0', '2026-11-20') RETURNING dataset_version_id::text AS id");
    await db.query("INSERT INTO ref_place (dataset_version_id, osm_id, category, name, lat, lon) VALUES ($1, 'node/1', 'food', NULL, -37.8, 144.9)", [v.id]);
    await expect(db.query("INSERT INTO ref_place (dataset_version_id, osm_id, category, name, lat, lon) VALUES ($1, 'node/1', 'food', NULL, -37.8, 144.9)", [v.id])).rejects.toThrow();
    await expect(db.query("INSERT INTO ref_place (dataset_version_id, osm_id, category, name, lat, lon) VALUES ($1, 'node/2', 'shopping', NULL, -37.8, 144.9)", [v.id])).rejects.toThrow();
    await db.query("DELETE FROM ref_place WHERE dataset_version_id = $1", [v.id]);
    await db.query("DELETE FROM src_dataset_version WHERE dataset_version_id = $1", [v.id]);
  });

  it("0011 adds the two cleared sold-listings sources (with the owner's ruling and the credit), the three tables, and switches on L21 and L04 as free layers", async () => {
    const [src] = await db.query("SELECT licence, rights_status, attribution_text, max_cache_days, display_scope, notes FROM src_source WHERE source_id = 'rp_sold_listings'");
    expect(src).toMatchObject({
      licence: "Third-party listing data (realestate.com.au via RapidAPI realty-in-au); reuse ruled acceptable by the owner 2026-11-21",
      rights_status: "cleared",
      attribution_text: "Recent sales as reported on realestate.com.au listings, retrieved by VicProp.",
      max_cache_days: null,
      display_scope: "public",
    });
    expect(src.notes).toMatch(/never as a Victorian title record/);
    expect(src.notes).toMatch(/no listing text, photos, agent, agency or phone is stored/i);
    const [model] = await db.query("SELECT rights_status, licence FROM src_source WHERE source_id = 'rp_sold_model'");
    expect(model).toMatchObject({ rights_status: "cleared" });
    expect(model.licence).toContain("rp_sold_listings");
    // The older blocked row for the live RapidAPI route is untouched: nothing here calls the site at request time.
    expect((await db.query("SELECT rights_status FROM src_source WHERE source_id = 'rea_rapidapi'"))[0].rights_status).toBe("blocked");

    const layers = await db.query("SELECT layer_id, tier, enabled, source_ids FROM layer_config WHERE layer_id IN ('L21-sales', 'L04-drivers') ORDER BY layer_id");
    expect(layers.map((r) => [r.layer_id, r.tier, r.enabled])).toEqual([["L04-drivers", "free", true], ["L21-sales", "free", true]]);
    expect([...layers[0].source_ids].sort()).toEqual(["gnaf", "rp_sold_listings", "rp_sold_model"]);
    expect([...layers[1].source_ids].sort()).toEqual(["gnaf", "rp_sold_listings"]);
    // AD-4 fails closed: with the source pending the rights trigger refuses to switch the layer on again.
    await db.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'rp_sold_listings'");
    await expect(db.query("UPDATE layer_config SET enabled = true, updated_at = now() WHERE layer_id = 'L21-sales'")).rejects.toThrow(/not cleared: .*rp_sold_listings/);
    await db.query("UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'rp_sold_listings'");

    const pk = async (table) =>
      (await db.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '${table}'::regclass AND i.indisprimary ORDER BY a.attname`)).map((r) => r.attname);
    expect(await pk("fact_reported_sale")).toEqual(["dataset_version_id", "listing_id"]);
    expect(await pk("derived_price_driver")).toEqual(["dataset_version_id", "driver"]);
    expect(await pk("derived_layout_median")).toEqual(["baths", "beds", "dataset_version_id", "has_car", "sal_code"]);
    // No agent, agency or phone column can exist in any of the three tables.
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('fact_reported_sale', 'derived_price_driver', 'derived_layout_median')")).map((r) => r.column_name);
    expect(cols.filter((c) => /agent|agency|phone|title|description/i.test(c))).toEqual([]);

    const [v] = await db.query("INSERT INTO src_dataset_version (source_id, retrieved_at, row_count, licence_snapshot, as_of) VALUES ('rp_sold_listings', now(), 0, 'x', '2026-11-21') RETURNING dataset_version_id::text AS id");
    const ins = (id, building, match) =>
      db.query(
        `INSERT INTO fact_reported_sale (dataset_version_id, listing_id, address_text, suburb, suburb_key, postcode, harvest_suburb, price_aud, property_type, sold_on, url, building_id, match_type)
         VALUES ($1, $2, '1/1 A Street', 'Docklands', 'docklands', '3008', 'Docklands', 500000, 'apartment', '2026-11-01', 'property-apartment-vic-docklands-1', $3, $4)`,
        [v.id, id, building, match],
      );
    await ins("100001", "GAVIC1000001", "exact_street_number");
    await expect(ins("100001", null, null)).rejects.toThrow(); // one listing id once per dataset version
    await expect(ins("100002", "GAVIC1000001", null)).rejects.toThrow(); // a building id needs its match type
    await expect(ins("100003", null, "exact_street_number")).rejects.toThrow();
    await expect(ins("100004", "GAVIC1000001", "guess")).rejects.toThrow();
    await db.query("DELETE FROM fact_reported_sale WHERE dataset_version_id = $1", [v.id]);
    await db.query("DELETE FROM src_dataset_version WHERE dataset_version_id = $1", [v.id]);
  });

  it("the dev seed is idempotent on a migrated database", async () => {
    await applyDevSeed(db);
    expect((await db.query("SELECT rights_status FROM src_source WHERE source_id = 'gnaf'"))[0].rights_status).toBe("cleared");
    expect((await db.query("SELECT enabled FROM layer_config WHERE layer_id = 'L01-property'"))[0].enabled).toBe(true);
  });

  it("--dev-seed is refused for a non-local database and isLocalDatabaseUrl is strict", () => {
    expect(isLocalDatabaseUrl("postgres://u@localhost:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u@127.0.0.1/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u@ep-abc.neon.tech/db")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrate.mjs");
    const r = spawnSync(process.execPath, [script, "--dev-seed"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgres://u@ep-abc.neon.tech/db" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--dev-seed");
  });

  it("AD-4: a layer cannot be enabled while a source is not cleared", async () => {
    await expect(
      db.query("INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES ('L06-shortstay', 'paid', true, ARRAY['gnaf','shortstay_vendor'])"),
    ).rejects.toThrow(/not cleared: .*shortstay_vendor/);
    // Disabled is fine; enabling later is refused too.
    await db.query("INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES ('L06-shortstay', 'paid', false, ARRAY['gnaf','shortstay_vendor'])");
    await expect(db.query("UPDATE layer_config SET enabled = true WHERE layer_id = 'L06-shortstay'")).rejects.toThrow(/not cleared/);
    await expect(
      db.query("INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES ('L99', 'free', true, ARRAY['no_such'])"),
    ).rejects.toThrow(/not cleared/);
  });

  it("vendor_cache cannot be kept longer than 30 days", async () => {
    await expect(
      db.query("INSERT INTO vendor_cache (cache_key, vendor, payload, fetched_at, expires_at) VALUES ('k', 'v', '{}', now(), now() + interval '31 days')"),
    ).rejects.toThrow();
  });

  it("a failing migration file rolls back entirely", async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
    await writeFile(path.join(dir, "0001_bad.sql"), "CREATE TABLE half_done (a int); SELECT 1/0;");
    await expect(applyMigrations(db, { dir })).rejects.toThrow(/0001_bad.sql failed/);
    const t = await db.query("SELECT to_regclass('half_done') AS t");
    expect(t[0].t).toBeNull();
  });
});

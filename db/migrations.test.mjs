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
    expect(await applyMigrations(db)).toEqual(["0001_core.sql", "0002_seed.sql", "0003_clear_gnaf.sql", "0004_vic_suburb_layers.sql", "0005_purchases.sql"]);
    expect(await applyMigrations(db)).toEqual([]);
  });

  it("create every table the spec lists", async () => {
    const want = ["src_source", "src_dataset_version", "src_dataset_current", "ref_suburb", "ref_building", "ref_address", "series_price", "series_rent", "derived_rating", "market_validation", "layer_config", "fact_suburb_marker", "ref_suburb_neighbour", "src_dataset_unmatched", "app_user", "app_org", "app_subscription", "app_report", "app_lookup_log", "app_purchase", "app_webhook_event", "vendor_cache"];
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

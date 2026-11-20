import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, copyFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { buildSalIndex } from "../lib/sal.mjs";
import { PublishCheckError, publish, rowCountMatchesDeclared } from "../publish/publish.mjs";
import { SchemaFailure, loadGnaf, publishGnaf } from "./gnaf-load.mjs";
import { FIXTURE_SALS } from "./fixtures/sals.mjs";
import { DEFAULT_XLSX, loadSuburbs, readVicSals } from "./suburbs-sal.mjs";
import { getAddress } from "../../src/server/repos/address";
import { resolveQuery, suggest } from "../../src/server/services/resolve-address";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "gnaf-vic");

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const pointer = async (source = "gnaf") =>
  (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = $1", [source]))[0]?.id ?? null;

describe("SAL matching", () => {
  const index = buildSalIndex(FIXTURE_SALS);
  it("exact, suffix-stripped, ambiguous and none", () => {
    expect(index.match("DOCKLANDS")).toEqual({ sal_code: "20766", match_type: "exact" });
    expect(index.match("CARLTON")).toEqual({ sal_code: "20495", match_type: "suffix_stripped" });
    expect(index.match("FAKEVILLE")).toEqual({ sal_code: null, match_type: "ambiguous" });
    expect(index.match("NOWHERE")).toEqual({ sal_code: null, match_type: "none" });
  });
});

describe("SAL matching with ABS disambiguation suffixes", () => {
  const sals = [
    { sal_code: "20100", raw_name: "Bellfield (Banyule - Vic.)" },
    { sal_code: "20101", raw_name: "Newtown (Greater Geelong - Vic.)" },
    { sal_code: "20102", raw_name: "Newtown (Hepburn - Vic.)" },
    { sal_code: "20103", raw_name: "Carlton (Vic.)" },
    { sal_code: "20104", raw_name: "Plain Place" },
  ];
  const index = buildSalIndex(sals);
  it("strips any trailing parenthetical with Vic as a match key and records suffix_stripped", () => {
    expect(index.match("BELLFIELD")).toEqual({ sal_code: "20100", match_type: "suffix_stripped" });
    expect(index.match("CARLTON")).toEqual({ sal_code: "20103", match_type: "suffix_stripped" });
    expect(index.match("PLAIN PLACE")).toEqual({ sal_code: "20104", match_type: "exact" });
  });
  it("two ABS names collapsing to one key are ambiguous, not picked", () => {
    expect(index.match("NEWTOWN")).toEqual({ sal_code: null, match_type: "ambiguous" });
  });
});

describe.skipIf(!existsSync(DEFAULT_XLSX))("real ABS workbook", () => {
  it("reads Victorian SAL rows from the Non_ABS_Structures sheet", async () => {
    const sals = await readVicSals();
    expect(sals.length).toBeGreaterThan(2500);
    expect(sals.every((s) => /^2\d{4}$/.test(s.sal_code))).toBe(true);
    const idx = buildSalIndex(sals);
    expect(idx.match("DOCKLANDS").match_type).toBe("exact");
    expect(idx.match("CARLTON")).toMatchObject({ match_type: "suffix_stripped" });
  });
});

describe("loadGnaf + publish", () => {
  it("loads fixture rows, derives buildings, and publishes the pointer", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const loaded = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    expect(loaded.loaded).toBe(14);
    expect(await pointer()).toBeNull(); // not visible until published
    await publishGnaf(db, loaded);
    expect(await pointer()).toBe(loaded.dataset_version_id);

    const v = (await db.query("SELECT status, row_count::int AS n, as_of::text AS as_of, file_sha256, states FROM src_dataset_version WHERE dataset_version_id = $1", [loaded.dataset_version_id]))[0];
    expect(v).toMatchObject({ status: "published", n: 14, as_of: "2026-08-31" });
    expect(v.file_sha256).toHaveLength(64);

    const buildings = await db.query("SELECT building_id, unit_count FROM ref_building WHERE dataset_version_id = $1 ORDER BY building_id", [loaded.dataset_version_id]);
    expect(buildings.map((b) => [b.building_id, b.unit_count])).toEqual([
      ["GAVIC100000001", 2],
      ["GAVIC100000010", 3],
      ["GAVIC100000020", 1],
    ]);

    const search = await db.query("SELECT count(*)::int AS n FROM ref_address WHERE dataset_version_id = $1 AND search_text IS NOT NULL", [loaded.dataset_version_id]);
    expect(search[0].n).toBe(7); // property-level rows only
    const unit = (await db.query("SELECT sal_code, sal_match_type, street_name_norm, locality_norm FROM ref_address WHERE gnaf_pid = 'GAVIC100000002'"))[0];
    expect(unit).toEqual({ sal_code: "20766", sal_match_type: "exact", street_name_norm: "FLINDERS", locality_norm: "DOCKLANDS" });
  });

  it("a row that fails the schema aborts the load, marks the version failed and never moves the pointer", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gnaf-bad-"));
    await copyFile(path.join(FIXTURE, "manifest.json"), path.join(dir, "manifest.json"));
    const lines = (await readFile(path.join(FIXTURE, "addresses.tsv"), "utf8")).split("\n");
    lines[2] = lines[2].replace("GAVIC100000002", "BADPID");
    await writeFile(path.join(dir, "addresses.tsv"), lines.join("\n"));
    await expect(loadGnaf(db, { dir, sals: FIXTURE_SALS })).rejects.toBeInstanceOf(SchemaFailure);
    expect(await pointer()).toBeNull();
    const [v] = await db.query("SELECT dataset_version_id, status FROM src_dataset_version WHERE source_id = 'gnaf'");
    expect(v.status).toBe("failed");
    // the partially loaded rows are removed with the failure
    const [n] = await db.query("SELECT count(*)::int AS n FROM ref_address WHERE dataset_version_id = $1", [v.dataset_version_id]);
    expect(n.n).toBe(0);
  });
});

describe("publish (AD-7): failed publish leaves the pointer unchanged", () => {
  it("a failed row-count check keeps the old data served and exits non-zero (throws)", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const first = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, first);
    expect(await pointer()).toBe(first.dataset_version_id);

    // Second load declares more rows than it loads: a truncated extract.
    const second = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS, declaredRowCount: 15 });
    await expect(publishGnaf(db, second)).rejects.toBeInstanceOf(PublishCheckError);
    expect(await pointer()).toBe(first.dataset_version_id);
    const [v] = await db.query("SELECT status FROM src_dataset_version WHERE dataset_version_id = $1", [second.dataset_version_id]);
    expect(v.status).toBe("failed");
    // A failed publish check leaves no rows behind for that version, and the first version is untouched.
    const left = await db.query("SELECT (SELECT count(*)::int FROM ref_address WHERE dataset_version_id = $1) AS a, (SELECT count(*)::int FROM ref_building WHERE dataset_version_id = $1) AS b", [second.dataset_version_id]);
    expect(left[0]).toEqual({ a: 0, b: 0 });
    expect((await db.query("SELECT count(*)::int AS n FROM ref_address WHERE dataset_version_id = $1", [first.dataset_version_id]))[0].n).toBe(14);

    // Old data is still what repositories read.
    const row = await getAddress(db, "GAVIC100000002");
    expect(row.gnaf_as_of).toBe("2026-08-31");
  });

  it("a new version that declares and loads fewer than 90 percent of the current rows is refused by the ratio check", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const first = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, first);
    // declared defaults to min(limit, manifest rows) = 3 and 3 are loaded, so the count check passes and only the ratio check can fail
    const tiny = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS, limit: 3 });
    const err = await publishGnaf(db, tiny).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures).toHaveLength(1);
    expect(err.failures[0]).toMatch(/below 90% of the current version/);
    expect(await pointer()).toBe(first.dataset_version_id);
  });

  it("unit rows with no ref_building rows fail the building check", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const a = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await db.query("DELETE FROM ref_building WHERE dataset_version_id = $1", [a.dataset_version_id]);
    const err = await publishGnaf(db, a).catch((e) => e);
    expect(err).toBeInstanceOf(PublishCheckError);
    expect(err.failures).toEqual(["ref_building is empty although unit rows exist"]);
    expect(await pointer()).toBeNull();
  });

  it("reads follow the current pointer: an unpublished second version with a changed address and as_of is never served", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const first = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, first);

    const dir = await mkdtemp(path.join(os.tmpdir(), "gnaf-v2-"));
    const manifest = JSON.parse(await readFile(path.join(FIXTURE, "manifest.json"), "utf8"));
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, as_of: "2026-09-30" }));
    const tsv = (await readFile(path.join(FIXTURE, "addresses.tsv"), "utf8")).replaceAll("FLINDERS", "CHANGEDST").replaceAll("Flinders", "Changedst");
    await writeFile(path.join(dir, "addresses.tsv"), tsv);
    const second = await loadGnaf(db, { dir, sals: FIXTURE_SALS }); // loaded, never published
    expect(second.dataset_version_id).not.toBe(first.dataset_version_id);

    const row = await getAddress(db, "GAVIC100000001");
    expect(row).toMatchObject({ gnaf_as_of: "2026-08-31", display_address: "628 Flinders Street, Docklands VIC 3008" });
    const candidates = await suggest(db, "628 flinders");
    expect(candidates.map((c) => c.display_address).join("|")).toContain("Flinders");
    expect(candidates.map((c) => c.display_address).join("|")).not.toContain("Changedst");
    expect(await suggest(db, "628 changedst")).toEqual([]);
    expect(await resolveQuery(db, "310/628 Flinders St Docklands")).toMatchObject({ match: "unit", gnaf_as_of: "2026-08-31" });
    await expect(resolveQuery(db, "628 Changedst St Docklands")).rejects.toMatchObject({ code: "address_not_found" });
  });

  it("a successful second publish moves the pointer in one step and the old version stays", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const a = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, a);
    const b = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, b);
    expect(await pointer()).toBe(b.dataset_version_id);
    const rows = await db.query("SELECT count(*)::int AS n FROM ref_address WHERE gnaf_pid = 'GAVIC100000002'");
    expect(rows[0].n).toBe(2); // both versions retained, only the pointer decides which is read
    expect((await getAddress(db, "GAVIC100000002")).gnaf_pid).toBe("GAVIC100000002");
  });

  it("publish rejects a version that is not in loading state", async () => {
    await loadSuburbs(db, { sals: FIXTURE_SALS });
    const a = await loadGnaf(db, { dir: FIXTURE, sals: FIXTURE_SALS });
    await publishGnaf(db, a);
    await expect(publish(db, { source_id: "gnaf", dataset_version_id: a.dataset_version_id, checks: [rowCountMatchesDeclared("ref_address")] })).rejects.toThrow(/not loading/);
  });
});

describe("gnaf-load CLI", () => {
  it("refuses --limit unless --pglite is set, and exits non-zero", () => {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "gnaf-load.mjs");
    const r = spawnSync(process.execPath, [script, "--limit", "5"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgres://nobody@example.invalid/db" } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("--limit");
  });
});

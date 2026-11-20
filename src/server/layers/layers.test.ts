import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../contracts/address";
import { listLayerConfig } from "../repos/source";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { applyDevSeed } from "../../../db/migrate.mjs";
import { rightsGate } from "../services/layer-runner";
import { loadRights } from "../services/assemble-report";
import { createLoadedTestDb, createTestDb, type TestDb } from "../testing/db";
import { LAYERS } from ".";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createLoadedTestDb());
});
afterAll(() => close());

describe("layer registry", () => {
  it("every layer has a layer_config row with the same tier and sources", async () => {
    const config = new Map((await listLayerConfig(db)).map((c) => [c.layer_id, c]));
    for (const layer of LAYERS) {
      const row = config.get(layer.layer_id);
      expect(row, layer.layer_id).toBeDefined();
      expect(row!.tier).toBe(layer.tier);
      expect([...row!.source_ids].sort()).toEqual([...layer.source_ids].sort());
    }
  });

  it("teasers contain no digits (no figures in a locked response)", () => {
    for (const layer of LAYERS) expect(layer.teaser, layer.layer_id).not.toMatch(/\d/);
  });
});

describe("production seed vs dev seed", () => {
  it("with production migrations only, L01 is not_covered; the dev seed turns it on", async () => {
    const t = await createTestDb({ devSeed: false });
    try {
      const L01 = LAYERS[0];
      expect(rightsGate(L01, await loadRights(t.db))).toMatchObject({ ok: false, reason: "Not available yet" });
      await applyDevSeed(t.db);
      expect(rightsGate(L01, await loadRights(t.db))).toEqual({ ok: true });
    } finally {
      await t.close();
    }
  });
});

describe("L01 Property", () => {
  it("unit match: Observed address facts with the G-NAF as_of, unit shown", async () => {
    const address = await resolveQuery(db, "310/628 Flinders St Docklands");
    const report = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "r1" });
    const l01 = report.layers.find((l) => l.layer_id === "L01-property")!;
    expect(l01.status).toBe("ok");
    expect(l01.coverage).toEqual({ market_tier: "A", match_type: "unit" });
    const by = Object.fromEntries(l01.figures.map((f) => [f.key, f]));
    expect(by.address).toMatchObject({ value: "310/628 Flinders Street, Docklands VIC 3008", chip: "Observed", as_of: "2026-08-31", source_ids: ["gnaf"] });
    expect(by.unit).toMatchObject({ value: "310", chip: "Observed" });
    expect(by.suburb).toMatchObject({ value: "Docklands", chip: "Estimated" });
    expect(l01.payload).toMatchObject({ unit_claims_suppressed: false, sal_code: "20766" });
    expect(report.header.match_note).toBeNull();
  });

  it("building-only: unit claims suppressed and the header says matched to building only", async () => {
    const address = await resolveQuery(db, "999/628 Flinders St Docklands");
    const report = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "r2" });
    const l01 = report.layers[0];
    const by = Object.fromEntries(l01.figures.map((f) => [f.key, f]));
    expect(by.unit).toMatchObject({ value: null, chip: "Unknown" });
    expect(by.unit.note).toContain("999");
    expect(l01.payload).toMatchObject({ unit_claims_suppressed: true });
    expect(report.header.match_note).toContain("Matched to building only");
  });

  it("a locality without a single SAL match gives an Unknown suburb, not a guess", async () => {
    const address = await resolveQuery(db, "5 Odd Court Fakeville");
    const report = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "r3" });
    expect(report.layers[0].figures.find((f) => f.key === "suburb")).toMatchObject({ value: null, chip: "Unknown" });
  });
});

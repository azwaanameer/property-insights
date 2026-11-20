import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LayerDef } from "../layers/types";
import { createLoadedTestDb, type TestDb } from "../testing/db";
import { handleAddress, handleCoverage, handleReport, handleResolve, handleSuggest } from "./handlers";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createLoadedTestDb());
});
afterAll(() => close());

const get = (path: string) => new Request(`http://localhost${path}`);
const getDb = () => db;

const SECRET = 424242424;
const paidLayer: LayerDef = {
  layer_id: "LX-paid",
  title: "Paid thing",
  tier: "paid",
  source_ids: ["gnaf"],
  teaser: "Paid layers send a teaser only.",
  run: async () => ({
    status: "ok",
    figures: [{ key: "k", label: "Secret", value: SECRET, chip: "Observed", source_ids: ["gnaf"], as_of: "2026-08-31" }],
    payload: { secret: SECRET },
  }),
};

describe("GET /address/suggest", () => {
  it("returns candidates with gnaf_pid, max 10", async () => {
    const res = await handleSuggest(getDb, get("/api/v1/address/suggest?q=628%20flinders"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates.length).toBeLessThanOrEqual(10);
    expect(body.candidates[0]).toHaveProperty("gnaf_pid");
  });
  it("400 when q has fewer than 3 non-space characters", async () => {
    for (const q of ["a", "ab", "%20%20a%20b%20"]) {
      const res = await handleSuggest(getDb, get(`/api/v1/address/suggest?q=${q}`));
      expect(res.status, q).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
    expect((await handleSuggest(getDb, get("/api/v1/address/suggest?q=abc"))).status).toBe(200);
  });
  it("resolve is unchanged: a short query is still resolved or rejected on its merits", async () => {
    expect((await handleResolve(getDb, get("/api/v1/address/resolve?q=ab"))).status).toBe(404);
  });
  it("400 on missing q, with the error envelope and a request id", async () => {
    const res = await handleSuggest(getDb, get("/api/v1/address/suggest"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "bad_request" });
    expect(body.error.request_id).toBe(res.headers.get("x-request-id"));
  });
});

describe("GET /address/resolve and /address/{pid}", () => {
  it("resolve: unit found", async () => {
    const res = await handleResolve(getDb, get("/api/v1/address/resolve?q=" + encodeURIComponent("310/628 Flinders St Docklands")));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ match: "unit", gnaf_pid: "GAVIC100000002", tier: "A" });
  });
  it("resolve: street only is 404 address_not_found with candidates", async () => {
    const res = await handleResolve(getDb, get("/api/v1/address/resolve?q=Flinders%20St"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("address_not_found");
    expect(body.error.match).toBe("street");
    expect(body.error.candidates.length).toBeGreaterThan(0);
  });
  it("address by pid; non-VIC pid is 404 not_covered; malformed pid is 400", async () => {
    expect((await handleAddress(getDb, get("/x"), { gnafPid: "GAVIC100000002" })).status).toBe(200);
    const nsw = await handleAddress(getDb, get("/x"), { gnafPid: "GANSW718000001" });
    expect(nsw.status).toBe(404);
    expect((await nsw.json()).error.code).toBe("not_covered");
    expect((await handleAddress(getDb, get("/x"), { gnafPid: "not-a-pid" })).status).toBe(400);
  });
});

describe("GET /property/{pid}/report", () => {
  it("returns the ReportModel with Cache-Control private", async () => {
    const res = await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000002" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("private");
    const body = await res.json();
    expect(body.report_version).toBe(1);
    expect(body.layers[0]).toMatchObject({ layer_id: "L01-property", status: "ok" });
    expect(body.request_id).toBe(res.headers.get("x-request-id"));
  });

  it("anonymous + paid layer: JSON has no figure values for it, Cache-Control private", async () => {
    await db.query("INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES ('LX-paid', 'paid', true, ARRAY['gnaf']) ON CONFLICT DO NOTHING");
    const res = await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000002" }, { layers: [paidLayer] });
    expect(res.headers.get("cache-control")).toContain("private");
    const text = await res.text();
    expect(text).not.toContain(String(SECRET));
    const layer = JSON.parse(text).layers[0];
    expect(layer).toMatchObject({ status: "locked", figures: [], payload: {}, teaser: paidLayer.teaser });
  });

  it("a paid layer with no layer_config row is not_covered and sends no value", async () => {
    const res = await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000002" }, { layers: [{ ...paidLayer, layer_id: "LX-unconfigured" }] });
    const text = await res.text();
    expect(text).not.toContain(String(SECRET));
    expect(JSON.parse(text).layers[0].status).toBe("not_covered");
  });

  it("building-only report carries the header note", async () => {
    const res = await handleReport(getDb, get("/r?unit=999"), { gnafPid: "GAVIC100000001" });
    const body = await res.json();
    expect(body.address.match).toBe("building");
    expect(body.header.match_note).toContain("unit 999");
  });

  it("a house (no units) has no building-only match note; a real building keeps it", async () => {
    const house = await (await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000030" })).json();
    expect(house.address).toMatchObject({ match: "building", is_multi_unit: false });
    expect(house.header.match_note).toBeNull();
    expect(house.layers[0].payload.unit_claims_suppressed).toBe(false);
    const tower = await (await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000001" })).json();
    expect(tower.address.is_multi_unit).toBe(true);
    expect(tower.header.match_note).toContain("Matched to building only");
    expect(tower.layers[0].payload.unit_claims_suppressed).toBe(true);
  });

  it("?unit= on a building pid with an existing unit reports the unit", async () => {
    const body = await (await handleReport(getDb, get("/r?unit=310"), { gnafPid: "GAVIC100000001" })).json();
    expect(body.address).toMatchObject({ match: "unit", gnaf_pid: "GAVIC100000002" });
  });

  it("underscore pids from other states are 404 not_covered through the HTTP layer", async () => {
    const res = await handleReport(getDb, get("/r"), { gnafPid: "GASA_414000001" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_covered");
  });

  it("non-VIC pid: 404 not_covered", async () => {
    const res = await handleReport(getDb, get("/r"), { gnafPid: "GAVIC999999999".replace("VIC", "QLD") });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_covered");
  });

  it("writes one lookup log row with the pid and no typed text", async () => {
    await handleReport(getDb, get("/r"), { gnafPid: "GAVIC100000003" });
    const rows = await db.query("SELECT gnaf_pid, principal_kind, layers_served FROM app_lookup_log WHERE gnaf_pid = 'GAVIC100000003'");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ principal_kind: "anonymous" });
  });

  it("a failing lookup log does not fail the report", async () => {
    const broken: any = {
      query: async (text: string, params?: unknown[]) => {
        if (text.includes("app_lookup_log")) throw new Error("log table down");
        return db.query(text, params);
      },
    };
    const res = await handleReport(() => broken, get("/r"), { gnafPid: "GAVIC100000003" });
    expect(res.status).toBe(200);
  });
});

describe("500 handling", () => {
  it("missing database configuration is a not_configured envelope, not a stack trace", async () => {
    vi.stubEnv("DATABASE_URL", "");
    try {
      const { getDb: realGetDb } = await import("../db");
      const res = await handleSuggest(() => realGetDb(), get("/api/v1/address/suggest?q=abc"));
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("not_configured");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("GET /coverage", () => {
  it("lists states with loaded flag and validation, layers with rights status, and datasets", async () => {
    const res = await handleCoverage(getDb);
    const body = await res.json();
    const vic = body.states.find((s: any) => s.state === "VIC");
    expect(vic).toMatchObject({ loaded: true, market_tier: "A" });
    expect(vic.validation[0]).toMatchObject({ dwelling_type: "unit", status: "validated", pairwise_score_low: 0.74, pairwise_score_high: 0.8 });
    expect(body.states.find((s: any) => s.state === "NSW")).toMatchObject({ loaded: false, market_tier: "C" });
    expect(body.layers[0]).toEqual({ layer_id: "L01-property", title: "Property", tier: "free", status: "live" });
    expect(JSON.stringify(body.layers)).not.toMatch(/source|reason|rights|pending|shortstay/);
    expect(body.datasets.map((d: any) => d.source_id).sort()).toEqual(["abs_asgs_2021", "gnaf"]);
  });
});

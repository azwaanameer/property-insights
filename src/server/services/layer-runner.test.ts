import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, type Principal } from "../contracts/address";
import type { LayerDef } from "../layers/types";
import { createLoadedTestDb, type TestDb } from "../testing/db";
import { loadRights } from "./assemble-report";
import { rightsGate, runLayer, runLayers, type RightsContext } from "./layer-runner";
import { resolveByPid } from "./resolve-address";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createLoadedTestDb());
});
afterAll(() => close());

const SECRET = 987654321;

function makeLayer(over: Partial<LayerDef> & { layer_id: string }): LayerDef {
  return {
    title: over.layer_id,
    tier: "free",
    source_ids: ["gnaf"],
    teaser: "A headline sentence with no figures.",
    run: async () => ({
      status: "ok",
      figures: [{ key: "secret", label: "Secret", value: SECRET, chip: "Observed", source_ids: ["gnaf"], as_of: "2026-08-31" }],
      payload: { secret: SECRET },
    }),
    ...over,
  };
}

async function rightsWith(layers: LayerDef[]): Promise<RightsContext> {
  const rights = await loadRights(db);
  for (const l of layers) rights.config.set(l.layer_id, { layer_id: l.layer_id, tier: l.tier, enabled: true, source_ids: l.source_ids });
  return rights;
}

async function input(layers: LayerDef[], principal: Principal = ANONYMOUS) {
  return { db, address: await resolveByPid(db, "GAVIC100000002"), principal, request_id: "req-1", rights: await rightsWith(layers) };
}

describe("rights gate (AD-4)", () => {
  it("a layer listing a pending source is not_covered and never executed", async () => {
    const run = vi.fn();
    const layer = makeLayer({ layer_id: "LX-pending", source_ids: ["gnaf", "shortstay_vendor"], run });
    const out = await runLayer(layer, await input([layer]));
    expect(out.status).toBe("not_covered");
    // Public text only: no source ids, no rights status.
    expect(out.message).toBe("Not available yet");
    expect(JSON.stringify(out)).not.toMatch(/shortstay|rights|cleared|gnaf/);
    expect(out.figures).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("blocked sources and unregistered sources also fail the gate", async () => {
    const rights = await rightsWith([]);
    rights.config.set("L", { layer_id: "L", tier: "free", enabled: true, source_ids: [] });
    expect(rightsGate({ layer_id: "L", source_ids: ["rea_rapidapi"] }, rights).ok).toBe(false);
    expect(rightsGate({ layer_id: "L", source_ids: ["no_such_source"] }, rights).ok).toBe(false);
    expect(rightsGate({ layer_id: "L", source_ids: ["gnaf"] }, rights).ok).toBe(true);
  });

  it("the detail (source ids, status) goes to the structured log only", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const layer = makeLayer({ layer_id: "LX-logged", source_ids: ["gnaf", "shortstay_vendor"] });
    await runLayer(layer, await input([layer]));
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("shortstay_vendor (pending)");
    expect(logged).toContain('"request_id":"req-1"');
    spy.mockRestore();
  });

  it("tier in layer_config differing from the layer in code: not_covered, and logged", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn();
    const layer = makeLayer({ layer_id: "LX-tier", tier: "free", run });
    const i = await input([layer]);
    i.rights.config.set("LX-tier", { layer_id: "LX-tier", tier: "paid", enabled: true, source_ids: ["gnaf"] });
    const out = await runLayer(layer, i);
    expect(out.status).toBe("not_covered");
    expect(run).not.toHaveBeenCalled();
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("tier mismatch");
    spy.mockRestore();
  });

  it("a layer switched off in layer_config is not_covered", async () => {
    const layer = makeLayer({ layer_id: "LX-off" });
    const i = await input([layer]);
    i.rights.config.set("LX-off", { layer_id: "LX-off", tier: "free", enabled: false, source_ids: ["gnaf"] });
    expect((await runLayer(layer, i)).status).toBe("not_covered");
  });

  it("a layer with no layer_config row is not_covered", async () => {
    const layer = makeLayer({ layer_id: "LX-unconfigured" });
    expect((await runLayer(layer, await input([]))).status).toBe("not_covered");
  });

  it("all sources cleared: the layer runs", async () => {
    const layer = makeLayer({ layer_id: "LX-ok" });
    expect((await runLayer(layer, await input([layer]))).status).toBe("ok");
  });
});

describe("locked layers (AD-3)", () => {
  it("anonymous + paid: locked, teaser, no figures, no payload, and the layer never ran", async () => {
    const run = vi.fn();
    const layer = makeLayer({ layer_id: "LX-paid", tier: "paid", run });
    const out = await runLayer(layer, await input([layer]));
    expect(out).toMatchObject({ status: "locked", teaser: layer.teaser, figures: [], payload: {} });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).not.toContain(String(SECRET));
  });

  it("a user on an active pro plan gets the data", async () => {
    const layer = makeLayer({ layer_id: "LX-paid2", tier: "paid" });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const out = await runLayer(layer, await input([layer], { kind: "user", user_id: "u1", plan: "pro", plan_expires_at: future }));
    expect(out.status).toBe("ok");
    expect(out.figures[0].value).toBe(SECRET);
  });
});

describe("failure isolation (AD-9)", () => {
  it("a throwing layer is status error; the others still render; the error is logged with request_id", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = makeLayer({
      layer_id: "LX-bad",
      run: async () => {
        throw new Error("db exploded: secret-host.internal");
      },
    });
    const good = makeLayer({ layer_id: "LX-good" });
    const out = await runLayers([bad, good], await input([bad, good]));
    expect(out.map((l) => l.status)).toEqual(["error", "ok"]);
    expect(out[0].figures).toEqual([]);
    expect(out[0].message).toContain("req-1");
    expect(JSON.stringify(out[0])).not.toContain("secret-host");
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain('"request_id":"req-1"');
    expect(logged).toContain("LX-bad");
    spy.mockRestore();
  });

  it("a layer that never settles times out as status error and the others still render", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const hung = makeLayer({ layer_id: "LX-hung", run: () => new Promise(() => {}) });
    const good = makeLayer({ layer_id: "LX-good2" });
    const i = { ...(await input([hung, good])), timeout_ms: 50 };
    const out = await runLayers([hung, good], i);
    expect(out.map((l) => l.status)).toEqual(["error", "ok"]);
    expect(out[0].message).toBeTruthy();
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("timed out");
    spy.mockRestore();
  });

  it("a layer returning malformed output becomes error, not a crash", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = makeLayer({ layer_id: "LX-malformed", run: async () => ({ status: "ok", figures: [{ key: "x" } as any], payload: {} }) });
    expect((await runLayer(bad, await input([bad]))).status).toBe("error");
    spy.mockRestore();
  });
});

describe("synthesis layers (two-pass run)", () => {
  it("a synthesis layer runs after every ordinary layer and is handed their results, in registry order, whatever their status", async () => {
    const order: string[] = [];
    const a = makeLayer({ layer_id: "LS-a", run: async () => (order.push("a"), { status: "ok", figures: [], payload: { fact: 1 } }) });
    const off = makeLayer({ layer_id: "LS-off" });
    const locked = makeLayer({ layer_id: "LS-locked", tier: "paid" });
    let seen: string[] = [];
    let seenStatus: string[] = [];
    const synth = makeLayer({
      layer_id: "LS-synth",
      synthesis: true,
      run: async (ctx) => {
        order.push("synth");
        seen = (ctx.siblings ?? []).map((s) => s.layer_id);
        seenStatus = (ctx.siblings ?? []).map((s) => s.status);
        return { status: "ok", figures: [], payload: { read: (ctx.siblings ?? []).length } };
      },
    });
    const slow = makeLayer({ layer_id: "LS-slow", run: async () => (await new Promise((r) => setTimeout(r, 30)), order.push("slow"), { status: "ok", figures: [], payload: {} }) });
    const i = await input([a, off, locked, synth, slow]);
    i.rights.config.set("LS-off", { layer_id: "LS-off", tier: "free", enabled: false, source_ids: ["gnaf"] });
    // The synthesis layer is listed FIRST on purpose: it still runs last.
    const out = await runLayers([synth, a, off, locked, slow], i);
    expect(out.map((l) => l.layer_id)).toEqual(["LS-synth", "LS-a", "LS-off", "LS-locked", "LS-slow"]);
    expect(order).toEqual(["a", "slow", "synth"]);
    expect(seen).toEqual(["LS-a", "LS-off", "LS-locked", "LS-slow"]);
    expect(seenStatus).toEqual(["ok", "not_covered", "locked", "ok"]);
    expect(out[0].payload).toEqual({ read: 4 });
  });

  it("an ordinary layer is never given siblings", async () => {
    let got: unknown = "unset";
    const layer = makeLayer({ layer_id: "LS-plain", run: async (ctx) => ((got = ctx.siblings), { status: "ok", figures: [], payload: {} }) });
    await runLayers([layer], await input([layer]));
    expect(got).toBeUndefined();
  });

  it("a locked sibling shows the synthesis layer no figure: locked data does not leave through it (AD-3)", async () => {
    const locked = makeLayer({ layer_id: "LS-locked2", tier: "paid" });
    let figures = -1;
    let payload = "";
    const synth = makeLayer({
      layer_id: "LS-synth2",
      synthesis: true,
      run: async (ctx) => {
        figures = (ctx.siblings ?? []).reduce((n, s) => n + s.figures.length, 0);
        payload = JSON.stringify((ctx.siblings ?? []).map((s) => s.payload));
        return { status: "ok", figures: [], payload: {} };
      },
    });
    await runLayers([locked, synth], await input([locked, synth]));
    expect(figures).toBe(0);
    expect(payload).not.toContain(String(SECRET));
  });

  it("a failing ordinary layer still lets the synthesis layer run, and a failing synthesis layer fails alone", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = makeLayer({ layer_id: "LS-bad", run: async () => { throw new Error("boom"); } });
    const good = makeLayer({ layer_id: "LS-good" });
    let statuses: string[] = [];
    const synth = makeLayer({ layer_id: "LS-synth3", synthesis: true, run: async (ctx) => ((statuses = (ctx.siblings ?? []).map((s) => s.status)), { status: "ok", figures: [], payload: {} }) });
    const broken = makeLayer({ layer_id: "LS-synth4", synthesis: true, run: async () => { throw new Error("synth boom"); } });
    const out = await runLayers([bad, good, synth, broken], await input([bad, good, synth, broken]));
    expect(statuses).toEqual(["error", "ok"]);
    expect(out.map((l) => l.status)).toEqual(["error", "ok", "ok", "error"]);
    spy.mockRestore();
  });

  it("a synthesis layer passes through the same rights gate and entitlement as any other", async () => {
    const run = vi.fn();
    const synth = makeLayer({ layer_id: "LS-synth5", synthesis: true, source_ids: ["gnaf", "shortstay_vendor"], run });
    const out = await runLayers([synth], await input([synth]));
    expect(out[0].status).toBe("not_covered");
    expect(run).not.toHaveBeenCalled();
  });
});

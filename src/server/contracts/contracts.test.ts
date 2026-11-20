import { describe, expect, it } from "vitest";
import { ErrorEnvelope } from "./errors";
import { LayerResult } from "./layer";

const base = {
  layer_id: "L99",
  title: "Test",
  tier: "paid",
  coverage: { market_tier: "A", match_type: "unit" },
  payload: {},
};
const figure = { key: "k", label: "L", value: 1, chip: "Observed", source_ids: ["gnaf"], as_of: "2026-08-31" };

describe("LayerResult contract (AD-1, AD-3)", () => {
  it("accepts a locked layer with a teaser and nothing else", () => {
    expect(LayerResult.safeParse({ ...base, status: "locked", figures: [], teaser: "Short-stay income for this building." }).success).toBe(true);
  });
  it("rejects a locked layer that carries figures", () => {
    expect(LayerResult.safeParse({ ...base, status: "locked", figures: [figure], teaser: "x" }).success).toBe(false);
  });
  it("rejects a locked layer that carries payload", () => {
    expect(LayerResult.safeParse({ ...base, status: "locked", figures: [], payload: { a: 1 }, teaser: "x" }).success).toBe(false);
  });
  it("rejects a locked layer without a teaser", () => {
    expect(LayerResult.safeParse({ ...base, status: "locked", figures: [] }).success).toBe(false);
  });
  it("rejects an error layer with figures", () => {
    expect(LayerResult.safeParse({ ...base, status: "error", figures: [figure] }).success).toBe(false);
  });
  it("gap, error and not_covered need a non-empty message", () => {
    for (const status of ["gap", "error", "not_covered"]) {
      expect(LayerResult.safeParse({ ...base, status, figures: [] }).success, status).toBe(false);
      expect(LayerResult.safeParse({ ...base, status, figures: [], message: "  " }).success, status).toBe(false);
      expect(LayerResult.safeParse({ ...base, status, figures: [], message: "Why and what next." }).success, status).toBe(true);
    }
  });
  it("requires an evidence chip and a source on every figure", () => {
    expect(LayerResult.safeParse({ ...base, status: "ok", figures: [{ ...figure, chip: "Guess" }] }).success).toBe(false);
    expect(LayerResult.safeParse({ ...base, status: "ok", figures: [{ ...figure, source_ids: [] }] }).success).toBe(false);
  });
});

describe("error envelope", () => {
  it("has code, message and request_id", () => {
    expect(ErrorEnvelope.safeParse({ error: { code: "not_covered", message: "m", request_id: "r" } }).success).toBe(true);
    expect(ErrorEnvelope.safeParse({ error: { code: "nope", message: "m", request_id: "r" } }).success).toBe(false);
  });
});

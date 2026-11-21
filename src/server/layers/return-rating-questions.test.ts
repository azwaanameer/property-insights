// Layers L05 Return, L15 Conditions and L13 Questions on excerpts of the real files loaded through the real pipelines (including the real
// rating pipeline) into PGlite. One test per row of the spec's I/O matrix, plus the AD-5 scope guard and the no-forecast guard.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { handleCoverage } from "../http/handlers";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../testing/db";
import { MIN_DWELLINGS as PIPELINE_MIN_DWELLINGS } from "../../../pipeline/derive/rating.mjs";
import { calcReturn } from "../../calc/return";
import { grossYield } from "./shared/derive";
import { buildQuestions, HIGH_UNOCCUPIED_SHARE, L13Questions, LOW_OWNER_SHARE } from "./L13-questions";
import { L15Conditions, MIN_DWELLINGS, RATING_LABEL } from "./L15-conditions";

const NEW_LAYERS = ["L05-return", "L15-conditions", "L13-questions"];
const DOCKLANDS = "20766";
const SOUTHBANK = "22315";

async function report(db: TestDb, query: string) {
  const address = await resolveQuery(db, query);
  const model = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "t" });
  return Object.fromEntries(model.layers.map((l) => [l.layer_id, l])) as Record<string, LayerResult>;
}
const figs = (l: LayerResult) => Object.fromEntries(l.figures.map((f) => [f.key, f]));
type Question = { id: string; standard: boolean; question: string; ask: string; trigger: null | { text: string; chip: string; layer_id: string; source_ids: string[] } };
const questions = (l: LayerResult) => l.payload.questions as Question[];
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const keys = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.push(k), keys(x, out));
  return out;
};

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
});
afterAll(() => close());

/** L15 run directly with the address changed, so a state or suburb the fixture addresses do not cover can be tested. */
async function runL15(t: TestDb, over: Partial<ResolvedAddress> = {}) {
  const address = { ...(await resolveQuery(t, "310/628 Flinders St Docklands")), ...over };
  return L15Conditions.run({ db: t, address, request_id: "t" });
}

describe("a Docklands unit: price, rent, rating and questions all known", () => {
  it("all three layers are ok and every figure has a chip, source ids and an as_of", async () => {
    const layers = await report(db, "310/628 Flinders St Docklands");
    for (const id of NEW_LAYERS) {
      expect(layers[id].status, `${id}: ${layers[id].message ?? ""}`).toBe("ok");
      expect(layers[id].tier).toBe("free");
      for (const f of layers[id].figures) {
        expect(f.chip, `${id} ${f.key}`).toMatch(/^(Observed|Estimated|Unknown|Conflict)$/);
        expect(f.source_ids.length, `${id} ${f.key}`).toBeGreaterThan(0);
        expect(f.as_of, `${id} ${f.key}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("L05: the suburb medians, gross yield = rent x 52 / price as Estimated with the method, and the past growth as history", async () => {
    const l05 = (await report(db, "310/628 Flinders St Docklands"))["L05-return"];
    const f = figs(l05);
    expect(f.median_price).toMatchObject({ value: 56_650_000, unit: "AUD_cents", chip: "Observed", source_ids: ["vgv_medians"] });
    expect(f.weekly_rent).toMatchObject({ value: 80_000, unit: "AUD_cents_per_week", chip: "Observed", source_ids: ["homes_victoria_rents"], as_of: "2026-06-30" });
    expect(f.gross_yield).toMatchObject({ value: grossYield(80_000, 56_650_000), unit: "fraction", chip: "Estimated" });
    expect(f.gross_yield.source_ids).toEqual(["homes_victoria_rents", "vgv_medians"]);
    expect(f.gross_yield.note).toMatch(/x 52/);
    expect(f.gross_yield.note).toMatch(/before any costs/i);
    expect(f.price_cagr_5y).toMatchObject({ chip: "Estimated", unit: "fraction" });
    expect(f.price_cagr_5y.label).toContain("history only");
    expect(f.price_cagr_5y.note).toContain("growth starts at 0%");
    expect(l05.payload).toMatchObject({ sal_code: DOCKLANDS, dwelling_family: "unit", needs_input: [] });
  });

  it("L05 calculator: sourced defaults say where they came from, every other default is labelled a placeholder, growth starts at 0", async () => {
    const l05 = (await report(db, "310/628 Flinders St Docklands"))["L05-return"];
    const calc = l05.payload.calculator as {
      label: string;
      inputs: { key: string; unit: string; default: number | null; basis: string; placeholder: boolean }[];
      history: { price_cagr_5y: number | null };
    };
    const by = Object.fromEntries(calc.inputs.map((i) => [i.key, i]));
    expect(by.price).toMatchObject({ default: 56_650_000, placeholder: false, unit: "AUD_cents" });
    expect(by.price.basis).toContain("Valuer-General");
    expect(by.price.basis).toContain("March quarter 2026");
    expect(by.weekly_rent).toMatchObject({ default: 80_000, placeholder: false });
    expect(by.weekly_rent.basis).toContain("Homes Victoria");
    for (const i of calc.inputs.filter((x) => !["price", "weekly_rent"].includes(x.key))) {
      expect(i.placeholder, i.key).toBe(true);
      expect(i.basis, i.key).toBe("placeholder, set your own");
      expect(i.default, i.key).not.toBeNull();
    }
    expect(by.growth_rate.default).toBe(0);
    expect(calc.history.price_cagr_5y).toBe(figs(l05).price_cagr_5y.value);
    // The layer's own defaults run through the shared function give the figure it shows.
    const start = calcReturn(Object.fromEntries(calc.inputs.map((i) => [i.key, i.default])));
    expect(start.gross_yield).toBe(figs(l05).gross_yield.value);
    expect(start.value_after).toBe(56_650_000);
  });

  it("L15: a rating with its fifth, its position among the rated suburbs, the three Census shares and the test result from market_validation", async () => {
    const l15 = (await report(db, "310/628 Flinders St Docklands"))["L15-conditions"];
    const f = figs(l15);
    const rows = await db.query<{ sal_code: string; band: string; score: number }>(
      "SELECT sal_code, band, score::float8 AS score FROM derived_rating r JOIN src_dataset_current c ON c.source_id = 'conditions_rating' AND c.dataset_version_id = r.dataset_version_id",
    );
    const own = rows.find((r) => r.sal_code === DOCKLANDS)!;
    const position = 1 + rows.filter((r) => r.score > own.score).length;
    expect(f.conditions_position).toMatchObject({ value: `${position} of ${rows.length}`, unit: "rank", chip: "Estimated", source_ids: ["conditions_rating", "abs_census_2021", "vgv_medians"] });
    expect(f.conditions_fifth).toMatchObject({ chip: "Estimated" });
    expect(f.conditions_fifth.note).toContain("conditions rating, not a price forecast");
    expect((l15.payload.rating as { fifth: number }).fifth).toBe(Number(own.band));
    // Docklands: 7,376 of 7,540 households in flats; 2,425 of 9,965 dwellings unoccupied; (930 + 1,359) of 7,348 owners among owners and renters.
    expect(f.flat_share).toMatchObject({ chip: "Observed", source_ids: ["abs_census_2021"], unit: "fraction" });
    expect(f.flat_share.value).toBeCloseTo(7376 / 7540, 6);
    expect(f.unoccupied_share.value).toBeCloseTo(2425 / 9965, 6);
    expect(f.owner_share.value).toBeCloseTo((930 + 1359) / (930 + 1359 + 5059), 6);
    expect(f.rating_test).toMatchObject({ value: "74% to 80%", chip: "Estimated", as_of: "2026-11-14" });
    expect(f.rating_test.note).toContain("4 windows, 2016 to 2025");
    expect(f.rating_test.note).toContain("Checked 2026-11-14");
    expect(l15.payload).toMatchObject({ mode: "rating", label: RATING_LABEL, scope: "Victorian apartment suburbs" });
  });

  it("L15 reads the test result, windows and date from the market_validation row, never from the code", async () => {
    const t = await createSuburbDataTestDb();
    try {
      await t.db.query("UPDATE market_validation SET pairwise_score_low = 0.61, pairwise_score_high = 0.66, windows = '2 windows, 2018 to 2024 (a later test)', checked_on = '2027-02-01' WHERE state = 'VIC' AND dwelling_type = 'unit'");
      const l15 = (await report(t.db, "310/628 Flinders St Docklands"))["L15-conditions"];
      const f = figs(l15);
      expect(f.rating_test).toMatchObject({ value: "61% to 66%", as_of: "2027-02-01" });
      expect(f.rating_test.note).toContain("2 windows, 2018 to 2024 (a later test)");
      expect(l15.payload.validation).toMatchObject({ low: 0.61, high: 0.66, range: "61% to 66%", checked_on: "2027-02-01" });
    } finally {
      await t.close();
    }
  });

  it("L13: every question names the report fact that prompted it, with its chip, or is marked standard", async () => {
    const l13 = (await report(db, "310/628 Flinders St Docklands"))["L13-questions"];
    const qs = questions(l13);
    expect(qs.length).toBeGreaterThan(5);
    for (const q of qs) {
      if (q.standard) expect(q.trigger, q.id).toBeNull();
      else {
        expect(q.trigger, q.id).not.toBeNull();
        expect(q.trigger!.text.length, q.id).toBeGreaterThan(10);
        expect(q.trigger!.chip, q.id).toMatch(/^(Observed|Estimated|Unknown|Conflict)$/);
        expect(q.trigger!.source_ids.length, q.id).toBeGreaterThan(0);
      }
      expect(q.ask, q.id).toBeTruthy();
    }
    const by = Object.fromEntries(qs.map((q) => [q.id, q]));
    // Docklands: 31% of households own, 24% of dwellings unoccupied, a gross yield, and a unit: these prompted questions.
    expect(by["owners-low"].trigger).toMatchObject({ layer_id: "L15-conditions", chip: "Observed" });
    expect(by["owners-low"].trigger!.text).toMatch(/^31\.\d% of households in the suburb own their home/);
    expect(by["unoccupied-high"].trigger!.text).toMatch(/^24\.\d% of private dwellings/);
    expect(by["yield-costs"].trigger).toMatchObject({ layer_id: "L05-return", chip: "Estimated" });
    expect(by["yield-costs"].question).toContain("owners corporation fees");
    expect(by["std-oc"].standard).toBe(true);
    expect(by["std-shortstay"].standard).toBe(true);
    expect(l13.payload.prompted_count).toBe(qs.filter((q) => !q.standard).length);
    // Prompted questions come first.
    const firstStd = qs.findIndex((q) => q.standard);
    expect(qs.slice(firstStd).every((q) => q.standard)).toBe(true);
  });

  it("L13 invents no fact: a question about a fact the report does not hold is not asked", async () => {
    const qs = questions((await report(db, "310/628 Flinders St Docklands"))["L13-questions"]);
    const ids = qs.map((q) => q.id);
    expect(ids).not.toContain("rent-missing"); // the rent is known
    expect(ids).not.toContain("price-missing");
    expect(ids).not.toContain("match-unit"); // the unit is in G-NAF
    expect(ids).not.toContain("rent-thin");
  });
});

describe("a building-only match", () => {
  it("L13 asks which lot is for sale and cites the match", async () => {
    const qs = questions((await report(db, "999/628 Flinders St Docklands"))["L13-questions"]);
    const q = qs.find((x) => x.id === "match-unit")!;
    expect(q.standard).toBe(false);
    expect(q.trigger).toMatchObject({ layer_id: "L01-property", chip: "Unknown" });
    expect(q.trigger!.text).toContain("Matched to building only");
  });
});

describe("a house with a price but no rent (Carlton rents are published only for a larger area)", () => {
  it("L05 is ok with the rent Unknown, the yield Unknown and needs_input: rent", async () => {
    const l05 = (await report(db, "7 Smith Rd Carlton"))["L05-return"];
    expect(l05.status).toBe("ok");
    const f = figs(l05);
    expect(f.median_price).toMatchObject({ source_ids: ["vgv_medians"] });
    expect(["Observed", "Estimated"]).toContain(f.median_price.chip); // Estimated when the median rests on few sales
    expect(f.median_price.value).toBeGreaterThan(0);
    expect(f.weekly_rent).toMatchObject({ value: null, chip: "Unknown", source_ids: ["homes_victoria_rents"] });
    expect(f.gross_yield).toMatchObject({ value: null, chip: "Unknown" });
    expect(f.gross_yield.note).toContain("rent is missing");
    expect(l05.payload.needs_input).toEqual(["rent"]);
    const inputs = (l05.payload.calculator as { inputs: { key: string; default: number | null }[] }).inputs;
    expect(inputs.find((i) => i.key === "weekly_rent")!.default).toBeNull();
    expect(inputs.find((i) => i.key === "price")!.default).toBe(f.median_price.value);
  });

  it("L15 is a profile with no band, and L13 asks about the rent", async () => {
    const layers = await report(db, "7 Smith Rd Carlton");
    const l15 = layers["L15-conditions"];
    expect(l15.status).toBe("ok");
    expect(l15.payload.mode).toBe("profile");
    expect(l15.payload.profile_note).toContain("Descriptive, not a rating");
    expect(Object.keys(figs(l15)).sort()).toEqual(["flat_share", "owner_share", "unoccupied_share"]);
    const rent = questions(layers["L13-questions"]).find((q) => q.id === "rent-missing")!;
    expect(rent.standard).toBe(false);
    expect(rent.trigger).toMatchObject({ layer_id: "L05-return", chip: "Unknown" });
    expect(rent.ask).toBe("property manager");
  });
});

describe("suburb not matched", () => {
  it("L05 and L15 are gaps that say so, and L13 still gives the standard questions only", async () => {
    const layers = await report(db, "5 Odd Court Fakeville");
    for (const id of ["L05-return", "L15-conditions"]) {
      expect(layers[id].status, id).toBe("gap");
      expect(layers[id].message?.toLowerCase(), id).toContain("suburb not matched");
      expect(layers[id].figures, id).toEqual([]);
    }
    const l13 = layers["L13-questions"];
    expect(l13.status).toBe("ok");
    const qs = questions(l13);
    expect(qs.length).toBeGreaterThan(3);
    expect(qs.every((q) => q.standard && q.trigger === null)).toBe(true);
  });
});

describe("unrated suburb (AD-9): a gap that says why, with the Census shares still shown", () => {
  async function withDb<T>(fn: (t: TestDb) => Promise<T>, omit: ("rating")[] = []) {
    const t = await createSuburbDataTestDb({ omit });
    try {
      return await fn(t.db);
    } finally {
      await t.close();
    }
  }
  const unrate = (t: TestDb, sal: string) => t.query("DELETE FROM derived_rating WHERE sal_code = $1", [sal]);

  it("fewer than 300 dwellings", async () => {
    await withDb(async (t) => {
      await unrate(t, SOUTHBANK);
      await t.query("UPDATE fact_suburb_marker SET value = 120 WHERE sal_code = $1 AND marker_key = 'dwellings'", [SOUTHBANK]);
      const out = await runL15(t, { sal_code: SOUTHBANK, sal_name: "Southbank" });
      expect(out.status).toBe("gap");
      expect(out.message).toContain("Not rated");
      expect(out.message).toContain("120 private dwellings");
      expect(out.message).toContain(`at least ${MIN_DWELLINGS}`);
      expect(out.payload.mode).toBe("unrated");
      expect(out.figures.map((f) => f.key).sort()).toEqual(["flat_share", "owner_share", "unoccupied_share"]);
      expect(out.figures.every((f) => f.chip === "Observed" && f.value !== null)).toBe(true);
    });
  });

  it("a Census marker missing: the share is an Unknown gap figure and the message names it", async () => {
    await withDb(async (t) => {
      await unrate(t, SOUTHBANK);
      await t.query("DELETE FROM fact_suburb_marker WHERE sal_code = $1 AND marker_key = 'owner_share'", [SOUTHBANK]);
      const out = await runL15(t, { sal_code: SOUTHBANK });
      expect(out.status).toBe("gap");
      expect(out.message).toContain("Not rated");
      expect(out.message).toContain("households that own their home");
      expect(out.figures.find((f) => f.key === "owner_share")).toMatchObject({ value: null, chip: "Unknown" });
      expect(out.figures.find((f) => f.key === "flat_share")!.value).not.toBeNull();
    });
  });

  it("no unit price history: the message says the Valuer-General series is what is missing", async () => {
    await withDb(async (t) => {
      await unrate(t, SOUTHBANK);
      const out = await runL15(t, { sal_code: SOUTHBANK });
      expect(out.status).toBe("gap");
      expect(out.message).toContain("unit price history");
    });
  });

  it("the rating has not been published yet: a gap, not a hidden section", async () => {
    await withDb(async (t) => {
      const layers = await report(t, "310/628 Flinders St Docklands");
      expect(layers["L15-conditions"].status).toBe("gap");
      expect(layers["L15-conditions"].message).toContain("has not been published yet");
      expect(layers["L15-conditions"].figures.length).toBe(3);
      // L13 keeps going, and does not mention a rating it does not have.
      expect(layers["L13-questions"].status).toBe("ok");
      expect(questions(layers["L13-questions"]).some((q) => q.id === "conditions-weak")).toBe(false);
    }, ["rating"]);
  });
});

describe("AD-5: the rating only where market_validation says validated", () => {
  const BAND = /conditions_fifth|conditions_position|rating_test|"fifth"|"fifth_label"|"position"|"band"|"score"|Top fifth|Bottom fifth|\d+ of \d+ rated/;

  it("validation switched off for VIC units: the profile, no band, anywhere in the layer or the report", async () => {
    const t = await createSuburbDataTestDb();
    try {
      await t.db.query("UPDATE market_validation SET status = 'not_validated' WHERE state = 'VIC' AND dwelling_type = 'unit'");
      const layers = await report(t.db, "310/628 Flinders St Docklands");
      const l15 = layers["L15-conditions"];
      expect(l15.status).toBe("ok");
      expect(l15.payload.mode).toBe("profile");
      expect(Object.keys(figs(l15)).sort()).toEqual(["flat_share", "owner_share", "unoccupied_share"]);
      expect(JSON.stringify(layers)).not.toMatch(BAND);
      expect(questions(layers["L13-questions"]).some((q) => q.id === "conditions-weak")).toBe(false);
    } finally {
      await t.close();
    }
  });

  it("a Victorian house: descriptive profile, no band in the response", async () => {
    const layers = await report(db, "7 Smith Rd Carlton");
    expect(layers["L15-conditions"].payload.mode).toBe("profile");
    expect(JSON.stringify(layers)).not.toMatch(BAND);
    expect(JSON.stringify(layers["L15-conditions"])).not.toContain(RATING_LABEL);
  });

  it("another state, even one with a rating row stored for the suburb: profile only", async () => {
    for (const state of ["NSW", "QLD", "SA", "TAS", "WA"] as const) {
      const out = await runL15(db, { state, tier: "C" });
      expect(out.status, state).toBe("ok");
      expect(out.payload.mode, state).toBe("profile");
      expect(JSON.stringify(out), state).not.toMatch(BAND);
    }
  });

  it("a state and dwelling type with no market_validation row at all is a profile too", async () => {
    const out = await runL15(db, { state: "VIC", match: "building", is_multi_unit: false });
    expect(out.payload.mode).toBe("profile");
    expect(JSON.stringify(out)).not.toMatch(BAND);
  });
});

describe("no forecast or prediction wording, no score outside L15", () => {
  const FORBIDDEN_TEXT = /\b(forecast\w*|predict\w*)\b/i;
  // AD-5 makes one sentence mandatory: the rating is a conditions rating, not a price forecast.
  const strip = (s: string) => s.replace(/conditions rating, not a price forecast/gi, "");
  const FORBIDDEN_KEY = /(^|_)(score|forecast|prediction|predicted|composite|best)(_|$)/i;

  it.each(["310/628 Flinders St Docklands", "999/628 Flinders St Docklands", "7 Smith Rd Carlton", "5 Odd Court Fakeville"])("%s", async (q) => {
    const layers = await report(db, q);
    for (const id of NEW_LAYERS) {
      for (const s of strings(layers[id])) expect(strip(s), `${id}: ${s}`).not.toMatch(FORBIDDEN_TEXT);
      for (const k of keys({ figures: layers[id].figures, payload: layers[id].payload })) expect(k, `${id} key ${k}`).not.toMatch(FORBIDDEN_KEY);
    }
    // The rating label is in L15's rating mode and nowhere else.
    for (const id of ["L05-return", "L13-questions"]) expect(JSON.stringify(layers[id])).not.toMatch(/conditions rating, not a price forecast/i);
  });

  it("the calculator's growth input starts at zero and its history is never an input", async () => {
    const l05 = (await report(db, "310/628 Flinders St Docklands"))["L05-return"];
    const inputs = (l05.payload.calculator as { inputs: { key: string; default: number | null }[] }).inputs;
    expect(inputs.find((i) => i.key === "growth_rate")!.default).toBe(0);
    expect(inputs.some((i) => /cagr|history/.test(i.key))).toBe(false);
  });
});

describe("registration and constants", () => {
  it("the three layers are switched on in the coverage endpoint", async () => {
    const body = await (await handleCoverage(() => db)).json();
    const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
    for (const id of NEW_LAYERS) expect(status[id], id).toBe("live");
  });

  it("L13 is the only synthesis layer, and it is last", async () => {
    const { LAYERS } = await import(".");
    expect(LAYERS.filter((l) => l.synthesis).map((l) => l.layer_id)).toEqual(["L13-questions"]);
    expect(LAYERS.at(-1)).toBe(L13Questions);
    expect(LAYERS.map((l) => l.layer_id)).toEqual(["L01-property", "L02-rent", "L03-price", "L05-return", "L07-history", "L09-suburb-compare", "L15-conditions", "L13-questions"]);
  });

  it("the serve plane's 300-dwelling minimum equals the pipeline's", () => {
    expect(MIN_DWELLINGS).toBe(PIPELINE_MIN_DWELLINGS);
  });
});

// ---------------------------------------------------------------- review follow-ups

async function withFreshDb<T>(fn: (t: TestDb) => Promise<T>): Promise<T> {
  const t = await createSuburbDataTestDb();
  try {
    return await fn(t.db);
  } finally {
    await t.close();
  }
}
const DOCKLANDS_UNIT_QUARTERS = `DELETE FROM series_price WHERE sal_code = '${DOCKLANDS}' AND dwelling_type = 'unit' AND period_type = 'quarter'`;

describe("L05 states that change the data", () => {
  it("price missing, rent present: needs_input has price, the price is an Unknown gap figure and the rent is kept", async () => {
    await withFreshDb(async (t) => {
      await t.query(DOCKLANDS_UNIT_QUARTERS);
      const l05 = (await report(t, "310/628 Flinders St Docklands"))["L05-return"];
      expect(l05.status).toBe("ok");
      expect(l05.payload.needs_input).toEqual(["price"]);
      const f = figs(l05);
      expect(f.median_price).toMatchObject({ value: null, chip: "Unknown" });
      expect(f.weekly_rent).toMatchObject({ value: 80_000, chip: "Observed" });
      expect(f.gross_yield).toMatchObject({ value: null, chip: "Unknown" });
      expect(f.gross_yield.note).toContain("price is missing");
      const inputs = (l05.payload.calculator as { inputs: { key: string; default: number | null }[] }).inputs;
      expect(inputs.find((i) => i.key === "price")!.default).toBeNull();
      expect(inputs.find((i) => i.key === "weekly_rent")!.default).toBe(80_000);
    });
  });

  it("neither price nor rent: a gap that says so, and L13 asks about both", async () => {
    await withFreshDb(async (t) => {
      await t.query(DOCKLANDS_UNIT_QUARTERS);
      await t.query(`DELETE FROM series_rent WHERE sal_code = '${DOCKLANDS}'`);
      const layers = await report(t, "310/628 Flinders St Docklands");
      const l05 = layers["L05-return"];
      expect(l05.status).toBe("gap");
      expect(l05.message).toContain("nothing to start the calculator from");
      expect(l05.payload.needs_input).toEqual(["price", "rent"]);
      const ids = questions(layers["L13-questions"]).filter((q) => !q.standard).map((q) => q.id);
      expect(ids).toEqual(expect.arrayContaining(["price-missing", "rent-missing"]));
    });
  });

  it("thin medians: price_thin and rent_thin are set and the figures are Estimated, and L13 asks about both", async () => {
    await withFreshDb(async (t) => {
      await t.query(`UPDATE series_price SET sales_count = 6, low_count = true WHERE sal_code = '${DOCKLANDS}' AND dwelling_type = 'unit' AND period_type = 'quarter' AND period = '2026-03-31'`);
      await t.query(`UPDATE series_rent SET lettings_count = 4, low_count = true WHERE sal_code = '${DOCKLANDS}' AND dwelling_type = 'unit' AND bedrooms = 2 AND period = '2026-06-30'`);
      const layers = await report(t, "310/628 Flinders St Docklands");
      const l05 = layers["L05-return"];
      expect(l05.payload).toMatchObject({ price_thin: true, rent_thin: true, sales_count: 6, lettings_count: 4 });
      expect(figs(l05).median_price).toMatchObject({ chip: "Estimated", value: 56_650_000 });
      expect(figs(l05).weekly_rent).toMatchObject({ chip: "Estimated", value: 80_000 });
      const by = Object.fromEntries(questions(layers["L13-questions"]).map((q) => [q.id, q]));
      expect(by["price-thin"].trigger!.text).toBe("The suburb median price rests on 6 sales.");
      expect(by["rent-thin"].trigger!.text).toBe("The suburb median rent rests on 4 new lettings.");
      expect(by["rent-thin"].trigger!.chip).toBe("Estimated");
    });
  });

  it("a house starts with no owners corporation fees, a unit with the placeholder", async () => {
    const owners = async (q: string) => {
      const inputs = ((await report(db, q))["L05-return"].payload.calculator as { inputs: { key: string; default: number | null; placeholder: boolean }[] }).inputs;
      return inputs.find((i) => i.key === "owners_corporation")!;
    };
    expect(await owners("7 Smith Rd Carlton")).toMatchObject({ default: 0, placeholder: true });
    expect(await owners("310/628 Flinders St Docklands")).toMatchObject({ default: 300_000, placeholder: true });
  });
});

describe("L15: a validated row with no test result is not served", () => {
  it.each(["pairwise_score_low", "pairwise_score_high"])("%s NULL: the profile, no band", async (col) => {
    await withFreshDb(async (t) => {
      await t.query(`UPDATE market_validation SET ${col} = NULL WHERE state = 'VIC' AND dwelling_type = 'unit'`);
      const l15 = (await report(t, "310/628 Flinders St Docklands"))["L15-conditions"];
      expect(l15.status).toBe("ok");
      expect(l15.payload.mode).toBe("profile");
      expect(JSON.stringify(l15)).not.toMatch(/conditions_fifth|conditions_position|rating_test|"fifth"|"band"|Top fifth|Bottom fifth/);
    });
  });

  it("L15 lists vgv_medians as a source, in code and in layer_config, and on the rating figures", async () => {
    expect(L15Conditions.source_ids).toContain("vgv_medians");
    const [row] = await db.query<{ source_ids: string[] }>("SELECT source_ids FROM layer_config WHERE layer_id = 'L15-conditions'");
    expect([...row.source_ids].sort()).toEqual([...L15Conditions.source_ids].sort());
    const l15 = (await report(db, "310/628 Flinders St Docklands"))["L15-conditions"];
    for (const k of ["conditions_fifth", "conditions_position", "rating_test"]) expect(figs(l15)[k].source_ids, k).toContain("vgv_medians");
    expect((l15.payload.meta as { source_ids: string[] }).source_ids).toContain("vgv_medians");
  });

  it("a pending vgv_medians switches L15 off", async () => {
    await withFreshDb(async (t) => {
      await t.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'vgv_medians'");
      const l15 = (await report(t, "310/628 Flinders St Docklands"))["L15-conditions"];
      expect(l15.status).toBe("not_covered");
    });
  });
});

describe("L13 triggers on the Docklands report", () => {
  it("price-fell and price-history are prompted by the real one-year and five-year changes", async () => {
    const qs = questions((await report(db, "310/628 Flinders St Docklands"))["L13-questions"]);
    const by = Object.fromEntries(qs.map((q) => [q.id, q]));
    expect(by["price-fell"].standard).toBe(false);
    expect(by["price-fell"].trigger).toMatchObject({ layer_id: "L03-price", chip: "Estimated" });
    expect(by["price-fell"].trigger!.text).toMatch(/^The suburb median unit price fell 10\.\d% over the past year\.$/);
    expect(by["price-history"].trigger).toMatchObject({ layer_id: "L05-return", chip: "Estimated" });
    expect(by["price-history"].trigger!.text).toMatch(/fell by an average of \d\.\d% a year over five years/);
  });

  it("a building address given without a unit says so, rather than claiming a unit was not found", async () => {
    const address = await resolveQuery(db, "628 Flinders St Docklands");
    expect(address.match).toBe("building");
    expect(address.unit_requested).toBeNull();
    const q = questions((await report(db, "628 Flinders St Docklands"))["L13-questions"]).find((x) => x.id === "match-unit")!;
    expect(q.trigger!.text).toBe("A multi-unit building address was given without a unit, so nothing here is specific to one unit.");
    // A unit that was asked for and not found keeps its own wording.
    const asked = questions((await report(db, "999/628 Flinders St Docklands"))["L13-questions"]).find((x) => x.id === "match-unit")!;
    expect(asked.trigger!.text).toBe("Matched to building only: the unit was not found in the national address file.");
  });
});

describe("L13 triggers on hand-built sibling results", () => {
  const cov = { market_tier: "A", match_type: "unit" } as const;
  const fg = (key: string, value: number | string | null, chip: "Observed" | "Estimated" | "Unknown" = "Observed") => ({ key, label: key, value, chip, source_ids: ["x"], as_of: "2026-01-01" });
  const res = (layer_id: string, figures: ReturnType<typeof fg>[] = [], payload: Record<string, unknown> = {}, status: LayerResult["status"] = "ok"): LayerResult => ({
    layer_id, title: layer_id, tier: "free", status, coverage: cov, figures, payload, ...(status === "gap" ? { message: "gap" } : {}),
  });
  const prompted = (siblings: LayerResult[], family: "unit" | "house" = "unit") => buildQuestions(siblings, family).filter((q) => !q.standard).map((q) => q.id);
  const rating = (fifth: number, mode = "rating") => res("L15-conditions", [fg("conditions_fifth", "x", "Estimated")], { mode, rating: { fifth, fifth_label: `Fifth ${fifth}`, of: 441 } });

  it("nothing but standard questions from no siblings", () => {
    expect(prompted([])).toEqual([]);
  });

  it("price-missing and rent-missing come from needs_input, each alone or together", () => {
    expect(prompted([res("L05-return", [], { needs_input: ["price"] })])).toEqual(["price-missing"]);
    expect(prompted([res("L05-return", [], { needs_input: ["rent"] })])).toEqual(["rent-missing"]);
    expect(prompted([res("L05-return", [], { needs_input: ["price", "rent"] })]).sort()).toEqual(["price-missing", "rent-missing"]);
  });

  it("an L05 gap that found neither price nor rent asks both; a suburb-not-matched gap asks neither", () => {
    expect(prompted([res("L05-return", [], { sal_code: "1", dwelling_family: "unit" }, "gap")]).sort()).toEqual(["price-missing", "rent-missing"]);
    expect(prompted([res("L05-return", [], {}, "gap")])).toEqual([]);
  });

  it("rent-thin and price-thin name the count, and say few when the count is unknown", () => {
    const qs = buildQuestions([res("L05-return", [fg("weekly_rent", 1)], { rent_thin: true, lettings_count: 4, price_thin: true })], "unit");
    expect(qs.find((q) => q.id === "rent-thin")!.trigger!.text).toBe("The suburb median rent rests on 4 new lettings.");
    expect(qs.find((q) => q.id === "price-thin")!.trigger!.text).toBe("The suburb median price rests on few sales.");
    expect(prompted([res("L05-return", [], { rent_thin: false, price_thin: false })])).toEqual([]);
  });

  it("price-fell: a fall asks, no change and a rise do not; a house reads the house figure", () => {
    expect(prompted([res("L03-price", [fg("unit_price_change_1y", -0.05, "Estimated")])])).toEqual(["price-fell"]);
    expect(prompted([res("L03-price", [fg("unit_price_change_1y", 0, "Estimated")])])).toEqual([]);
    expect(prompted([res("L03-price", [fg("unit_price_change_1y", 0.05, "Estimated")])])).toEqual([]);
    expect(prompted([res("L03-price", [fg("unit_price_change_1y", -0.05, "Estimated")])], "house")).toEqual([]);
    expect(prompted([res("L03-price", [fg("house_price_change_1y", -0.05, "Estimated")])], "house")).toEqual(["price-fell"]);
  });

  it("price-history: a negative past 5-year rate asks, zero and positive do not", () => {
    expect(prompted([res("L05-return", [fg("price_cagr_5y", -0.01, "Estimated")])])).toEqual(["price-history"]);
    expect(prompted([res("L05-return", [fg("price_cagr_5y", 0, "Estimated")])])).toEqual([]);
    expect(prompted([res("L05-return", [fg("price_cagr_5y", 0.02, "Estimated")])])).toEqual([]);
  });

  it("conditions-weak: fifth 3 does not ask, 4 and 5 do, and only for a unit with the rating on", () => {
    expect(prompted([rating(3)])).toEqual([]);
    expect(prompted([rating(4)])).toEqual(["conditions-weak"]);
    expect(prompted([rating(5)])).toEqual(["conditions-weak"]);
    expect(prompted([rating(5, "profile")])).toEqual([]);
    expect(prompted([rating(5, "unrated")])).toEqual([]);
    expect(prompted([rating(5)], "house")).toEqual([]);
  });

  const l15 = (key: string, value: number) => res("L15-conditions", [fg(key, value)], { mode: "profile" });
  it("owners-low: just below the threshold asks, at the threshold does not", () => {
    expect(prompted([l15("owner_share", LOW_OWNER_SHARE - 0.0001)])).toEqual(["owners-low"]);
    expect(prompted([l15("owner_share", LOW_OWNER_SHARE)])).toEqual([]);
    expect(prompted([l15("owner_share", LOW_OWNER_SHARE - 0.0001)], "house")).toEqual([]);
  });

  it("unoccupied-high: just below the threshold does not ask, at the threshold does", () => {
    expect(prompted([l15("unoccupied_share", HIGH_UNOCCUPIED_SHARE - 0.0001)])).toEqual([]);
    expect(prompted([l15("unoccupied_share", HIGH_UNOCCUPIED_SHARE)])).toEqual(["unoccupied-high"]);
    expect(prompted([l15("unoccupied_share", HIGH_UNOCCUPIED_SHARE)], "house")).toEqual([]);
  });

  it("match-unit wording follows whether a unit was asked for", () => {
    const noUnit = buildQuestions([res("L01-property", [], { unit_claims_suppressed: true })], "unit").find((q) => q.id === "match-unit")!;
    expect(noUnit.trigger!.text).toBe("A multi-unit building address was given without a unit, so nothing here is specific to one unit.");
    const asked = buildQuestions([res("L01-property", [fg("unit", null, "Unknown")], { unit_claims_suppressed: true })], "unit").find((q) => q.id === "match-unit")!;
    expect(asked.trigger!.text).toBe("Matched to building only: the unit was not found in the national address file.");
  });

  it("a sibling that did not run (locked, not covered, error) triggers nothing", () => {
    for (const status of ["locked", "not_covered", "error"] as const) {
      const s = res("L05-return", [], { needs_input: ["price"], rent_thin: true }, status);
      expect(prompted([s]), status).toEqual([]);
    }
  });
});

// L06 Short-stay income (fake vendor adapter, no network), run on the Docklands fixture address. One test per row of the spec's I/O matrix, plus the
// cutoff boundary, the wording, the rights gate and the L14 credit.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { Figure, LayerResult } from "../contracts/layer";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../testing/db";
import { fakeVendors, ok, shortStayComp, shortStayEstimate, strongComps } from "../testing/fake-vendors";
import type { ShortStayEstimate, VendorAdapters, VendorResult } from "../vendors/types";
import { UNAVAILABLE_VENDORS } from "../vendors/types";
import { VENDOR_BUDGET_MS } from "../vendors/types";
import { LAYERS } from "./index";
import { L19Photos } from "./L19-photos";
import { NO_COORDINATES_MESSAGE } from "./shared/location";
import { figure } from "./shared/figures";
import { percentile } from "./shared/shortstay";
import { airdnaAddress, BELOW_CUTOFF_MESSAGE, HOUSE_MESSAGE, L06Shortstay, NO_ESTIMATE_MESSAGE, NO_RENT_MESSAGE, REPORT_BATHROOMS, REPORT_BEDROOMS, UNAVAILABLE_MESSAGE, weeklyRentFrom } from "./L06-shortstay";

const DOCKLANDS_UNIT = "310/628 Flinders St Docklands";
/** The usual test rent, $800 a week: a year is $41,600 and 1.4 times that is $58,240, which the default estimate ($60,800) clears. */
const WEEKLY_CENTS = 80_000;
/** The boundary rent, $1,000 a week: a year is $52,000 and 1.4 times that is exactly $72,800, a whole number of dollars. */
const BOUNDARY_WEEKLY_CENTS = 100_000;
const CUTOFF_DOLLARS = 72_800;

let db: TestDb;
let close: () => Promise<void>;
let address: ResolvedAddress;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
  address = await resolveQuery(db, DOCKLANDS_UNIT);
});
afterAll(() => close());

const l02 = (weekly: number | null, status: LayerResult["status"] = "ok", key = `rent_${REPORT_BEDROOMS}bed_flat`): LayerResult => ({
  layer_id: "L02-rent",
  title: "Rent",
  tier: "free",
  status,
  coverage: { market_tier: "A", match_type: "unit" },
  figures: weekly === null ? [] : [figure({ key, label: "Median weekly rent, 2-bedroom flat", value: weekly, unit: "AUD_cents_per_week", chip: "Observed", source_ids: ["homes_victoria_rents"], as_of: "2026-09-30" })],
  payload: {},
  ...(status === "gap" ? { message: "no rent" } : {}),
});
/** `siblings` null means none at all (the field is left out). */
const run = (vendors: VendorAdapters, siblings: LayerResult[] | null = [l02(WEEKLY_CENTS)], over: Partial<ResolvedAddress> = {}) =>
  L06Shortstay.run({ db, address: { ...address, ...over }, request_id: "t", vendors, ...(siblings ? { siblings } : {}) });
const est = (e: Partial<ShortStayEstimate> = {}) => fakeVendors({ shortStay: async () => ok(shortStayEstimate(e)) });
const fig = (out: Awaited<ReturnType<typeof run>>, key: string): Figure => out.figures.find((f) => f.key === key)!;
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

describe("L06 matrix: AirDNA's own figure", () => {
  it("High confidence above the cutoff shows AirDNA's annual and monthly income, occupancy, nightly rate, confidence and comp count, all Estimated, with the method named", async () => {
    const out = await run(est({ annual_revenue: 91_200, confidence_level: "High", total_comps: 18 }));
    expect(out.status).toBe("ok");
    expect(fig(out, "shortstay_annual")).toMatchObject({ value: 9_120_000, unit: "AUD_cents", chip: "Estimated", source_ids: ["airdna_rentalizer"], as_of: "2026-11-21" });
    expect(fig(out, "shortstay_monthly")).toMatchObject({ value: 760_000, chip: "Estimated" });
    expect(fig(out, "shortstay_occupancy")).toMatchObject({ value: 0.72, unit: "fraction", chip: "Estimated" });
    expect(fig(out, "shortstay_adr")).toMatchObject({ value: 23_100, unit: "AUD_cents" });
    expect(fig(out, "shortstay_confidence").value).toBe("High");
    expect(fig(out, "shortstay_comps_used").value).toBe(8);
    expect(fig(out, "shortstay_comps_used").note).toContain("AirDNA found 18 comparable listings");
    expect(out.payload).toMatchObject({ method: "airdna", method_text: "AirDNA estimate, high confidence", comps_basis: "strong", assumed: true, bedrooms: 2, bathrooms: 2, cutoff_ratio: 1.4 });
    expect(fig(out, "shortstay_annual").note).toContain("AirDNA estimate, high confidence");
    expect(out.figures.some((f) => f.chip === "Observed" && f.source_ids.includes("airdna_rentalizer"))).toBe(false);
    expect(out.figures.filter((f) => f.source_ids.includes("airdna_rentalizer")).every((f) => f.chip === "Estimated")).toBe(true);
  });

  it("states that the bedrooms and bathrooms are assumed, and sends them to the vendor with the full address, the address pid and the address point", async () => {
    const shortStay = vi.fn(async (_q: unknown): Promise<VendorResult<ShortStayEstimate>> => ok(shortStayEstimate()));
    const out = await run(fakeVendors({ shortStay }));
    expect(shortStay).toHaveBeenCalledTimes(1);
    const q = shortStay.mock.calls[0][0] as { gnaf_pid: string; address: string; bedrooms: number; bathrooms: number; lat: number; lon: number };
    expect(q).toMatchObject({ gnaf_pid: address.gnaf_pid, lat: address.lat, lon: address.lon, bedrooms: REPORT_BEDROOMS, bathrooms: REPORT_BATHROOMS });
    expect(q.address).toMatch(/Docklands/);
    expect(q.address).toMatch(/Australia$/);
    expect(fig(out, "shortstay_annual").note).toMatch(/assumed/);
    expect(strings(out.payload.notes).join(" ")).toMatch(/does not check whether short stays are allowed/);
  });

  it("notes when AirDNA says it used a different size from the one asked for", async () => {
    const out = await run(est({ used_bedrooms: 1, used_bathrooms: 1 }));
    expect(fig(out, "shortstay_annual").note).toContain("AirDNA says it used 1 bedrooms and 1 bathrooms.");
  });

  it("the range comes from the comparable listings used (25th to 75th percentile)", async () => {
    const out = await run(est({ comps: strongComps(8, (i) => 50_000 + i * 2_000) }));
    const revs = Array.from({ length: 8 }, (_, i) => 50_000 + i * 2_000);
    expect(fig(out, "shortstay_annual_p25").value).toBe(percentile(revs, 0.25)! * 100);
    expect(fig(out, "shortstay_annual_p75").value).toBe(percentile(revs, 0.75)! * 100);
  });
});

describe("L06 matrix: our own estimate from the comparable listings", () => {
  it("Medium confidence with at least 5 strong comps uses the median of the nearest 15 strong comps, with the range and the reason", async () => {
    // 20 strong comps nearest first with rising revenue, plus a weak comp (few reviews) that must not count and a far one that falls outside the nearest 15.
    const comps = [...strongComps(20, (i) => 60_000 + i * 1_000), shortStayComp({ id: "weak", distance_m: 10, revenue: 90_000, reviews: 3 })];
    const out = await run(est({ confidence_level: "Medium", annual_revenue: 30_000, comps }));
    const nearest15 = Array.from({ length: 15 }, (_, i) => 60_000 + i * 1_000);
    expect(out.status).toBe("ok");
    expect(fig(out, "shortstay_annual").value).toBe(percentile(nearest15, 0.5)! * 100); // 67,000
    expect(fig(out, "shortstay_annual_p25").value).toBe(percentile(nearest15, 0.25)! * 100);
    expect(fig(out, "shortstay_annual_p75").value).toBe(percentile(nearest15, 0.75)! * 100);
    expect(fig(out, "shortstay_comps_used").value).toBe(15);
    expect(out.payload).toMatchObject({ method: "own", comps_basis: "strong", few: false, strong_comps: 20 });
    expect(out.payload.method_text).toBe("Our estimate from 15 nearby comparable listings, because AirDNA's confidence is Medium");
    expect((out.payload.comps as { id: string }[]).map((c) => c.id)).not.toContain("weak");
    expect(out.figures.map((f) => f.key)).not.toContain("shortstay_occupancy"); // AirDNA's own statistics are not shown beside our figure
    expect(fig(out, "shortstay_confidence").note).toMatch(/not High/);
    expect(fig(out, "shortstay_annual").chip).toBe("Estimated");
  });

  it("Low confidence, or no confidence given, also uses our estimate and says so", async () => {
    const low = await run(est({ confidence_level: "Low" }), [l02(30_000)]);
    expect(low.payload.method_text).toMatch(/because AirDNA's confidence is Low$/);
    const none = await run(est({ confidence_level: null }), [l02(30_000)]);
    expect(none.payload).toMatchObject({ method: "own", method_text: expect.stringContaining("because AirDNA gave no confidence rating") });
  });

  it("uses a comp with revenue of exactly 20,000 and exactly 20 reviews as strong, but not 19,999 or 19 reviews", async () => {
    const comps = [
      ...strongComps(4),
      shortStayComp({ id: "edge-ok", distance_m: 500, revenue: 20_000, reviews: 20 }),
      shortStayComp({ id: "edge-rev", distance_m: 510, revenue: 19_999, reviews: 50 }),
      shortStayComp({ id: "edge-rv", distance_m: 520, revenue: 80_000, reviews: 19 }),
    ];
    const out = await run(est({ confidence_level: "Medium", comps }), [l02(30_000)]);
    const ids = (out.payload.comps as { id: string }[]).map((c) => c.id);
    expect(out.payload.comps_basis).toBe("strong");
    expect(ids).toContain("edge-ok");
    expect(ids).not.toContain("edge-rev");
    expect(ids).not.toContain("edge-rv");
  });

  it("with fewer than 5 strong comps it uses every comp with revenue, nearest 15, and is labelled 'few comparable listings' with a note about weaker listings", async () => {
    const comps = [...strongComps(3, (i) => 80_000 + i * 1_000), shortStayComp({ id: "w1", distance_m: 350, revenue: 70_000, reviews: 4 }), shortStayComp({ id: "w2", distance_m: 360, revenue: 60_000, reviews: 2 }), shortStayComp({ id: "none", distance_m: 5, revenue: null })];
    const out = await run(est({ confidence_level: "Medium", comps }));
    expect(out.status).toBe("ok");
    expect(out.payload).toMatchObject({ method: "own", comps_basis: "all", few: true, strong_comps: 3 });
    expect((out.payload.comps as { id: string }[]).map((c) => c.id)).toEqual(["c1", "c2", "c3", "w1", "w2"]);
    expect(String(out.payload.method_text)).toContain("(few comparable listings)");
    expect(strings(out.payload.notes).join(" ")).toMatch(/Few comparable listings: fewer than 5 established listings/);
    expect(strings(out.payload.notes).join(" ")).toMatch(/less than a full year of income or have few reviews/);
    expect(fig(out, "shortstay_annual").value).toBe(percentile([60_000, 70_000, 80_000, 81_000, 82_000], 0.5)! * 100);
  });

  it("comps with no distance sort last, and a tie keeps a stable order", async () => {
    const comps = [shortStayComp({ id: "z", distance_m: null, revenue: 55_000, reviews: 40 }), shortStayComp({ id: "b", distance_m: 100 }), shortStayComp({ id: "a", distance_m: 100 }), ...strongComps(4).map((c) => ({ ...c, id: `x${c.id}`, distance_m: 900 }))];
    const out = await run(est({ confidence_level: "Low", comps }), [l02(30_000)]);
    expect((out.payload.comps as { id: string }[]).map((c) => c.id)).toEqual(["a", "b", "xc1", "xc2", "xc3", "xc4", "z"]);
  });
});

describe("L06 matrix: fallback and no data", () => {
  it("with no usable comps and AirDNA income present, shows AirDNA's figure labelled as a fallback with its confidence", async () => {
    const out = await run(est({ confidence_level: "Medium", annual_revenue: 88_000, comps: [shortStayComp({ id: "n", revenue: null })] }));
    expect(out.status).toBe("ok");
    expect(out.payload).toMatchObject({ method: "airdna_fallback" });
    expect(String(out.payload.method_text)).toBe("AirDNA estimate, medium confidence (no usable comparable listings, so there is no estimate of our own)");
    expect(fig(out, "shortstay_annual").value).toBe(8_800_000);
    expect(fig(out, "shortstay_occupancy")).toBeTruthy();
    expect(out.figures.map((f) => f.key)).not.toContain("shortstay_annual_p25");
    expect(strings(out.payload.notes).join(" ")).toMatch(/no usable comparable listings/);
  });

  it("with no comps and no AirDNA income it is the gap 'No short-stay estimate is available for this address.'", async () => {
    const out = await run(est({ annual_revenue: null, comps: [] }));
    expect(out).toMatchObject({ status: "gap", message: NO_ESTIMATE_MESSAGE, figures: [] });
  });

  it("a High confidence with no AirDNA income falls back to our comps", async () => {
    const out = await run(est({ annual_revenue: null, confidence_level: "High" }), [l02(30_000)]);
    expect(out.payload.method).toBe("own");
  });
});

describe("L06 matrix: the 1.4 times cutoff", () => {
  it("income exactly 1.4 times a year of rent shows the section", async () => {
    const out = await run(est({ annual_revenue: CUTOFF_DOLLARS, confidence_level: "High" }), [l02(BOUNDARY_WEEKLY_CENTS)]);
    expect(out.status).toBe("ok");
    expect(out.payload.ratio).toBe(1.4);
  });

  it("income one dollar under 1.4 times a year of rent hides it with the one-line reason and no figures", async () => {
    const out = await run(est({ annual_revenue: CUTOFF_DOLLARS - 1, confidence_level: "High" }), [l02(BOUNDARY_WEEKLY_CENTS)]);
    expect(out).toMatchObject({ status: "gap", message: BELOW_CUTOFF_MESSAGE, figures: [], payload: {} });
    expect(BELOW_CUTOFF_MESSAGE).toBe("No short-stay estimate is shown for this address.");
  });

  it("the cutoff is judged on the figure the method chose: our estimate under the line hides it even when AirDNA's own figure is above", async () => {
    const out = await run(est({ annual_revenue: 150_000, confidence_level: "Medium", comps: strongComps(6, () => 50_000) }));
    expect(out).toMatchObject({ status: "gap", message: BELOW_CUTOFF_MESSAGE });
  });

  it("the rent compared with is the L02 figure for the same bedroom count, times 52", async () => {
    expect(weeklyRentFrom([l02(WEEKLY_CENTS)])).toMatchObject({ cents: WEEKLY_CENTS });
    expect(weeklyRentFrom([l02(WEEKLY_CENTS, "ok", "rent_1bed_flat")])).toBeNull(); // another size is not the one the report uses
    const out = await run(est({ annual_revenue: 100_000 }));
    expect(fig(out, "longterm_rent_annual")).toMatchObject({ value: WEEKLY_CENTS * 52, unit: "AUD_cents", source_ids: ["homes_victoria_rents"] });
    expect(fig(out, "longterm_rent_annual").note).toContain("times this");
  });
});

describe("L06 matrix: a house, no rent, and the vendor failing", () => {
  it("a house is the gap 'Short-stay estimates are for apartments.' and the vendor is never asked", async () => {
    const shortStay = vi.fn();
    const out = await run(fakeVendors({ shortStay }), [l02(WEEKLY_CENTS)], { match: "building", is_multi_unit: false });
    expect(out).toMatchObject({ status: "gap", message: HOUSE_MESSAGE, figures: [] });
    expect(HOUSE_MESSAGE).toBe("Short-stay estimates are for apartments.");
    expect(shortStay).not.toHaveBeenCalled();
  });

  it.each([
    ["L02 is a gap", [l02(null, "gap")]],
    ["L02 has no figure", [l02(null, "ok")]],
    ["L02 has a zero rent", [l02(0)]],
    ["L02 is missing", []],
    ["there are no siblings at all", null],
  ])("when %s it is the gap 'No long-term rent figure to compare with.' and the vendor is never asked", async (_name, siblings) => {
    const shortStay = vi.fn();
    const out = await run(fakeVendors({ shortStay }), siblings as LayerResult[] | null);
    expect(out).toMatchObject({ status: "gap", message: NO_RENT_MESSAGE, figures: [] });
    expect(NO_RENT_MESSAGE).toBe("No long-term rent figure to compare with.");
    expect(shortStay).not.toHaveBeenCalled();
  });

  it.each([
    ["no key", { ok: false, reason: "no_key" } as const],
    ["a failure", { ok: false, reason: "unavailable" } as const],
  ])("with %s from the vendor it is the gap 'Short-stay estimates are not available right now.'", async (_name, result) => {
    const out = await run(fakeVendors({ shortStay: async () => result }));
    expect(out).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE, figures: [] });
    expect(UNAVAILABLE_MESSAGE).toBe("Short-stay estimates are not available right now.");
    expect(await run(UNAVAILABLE_VENDORS)).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE });
  });
});

describe("L06 when the vendor misbehaves", () => {
  it("a vendor that throws is the quiet gap 'not available right now', not an error", async () => {
    const out = await run(fakeVendors({ shortStay: async () => { throw new Error("boom"); } }));
    expect(out).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE, figures: [] });
  });

  it("a vendor that never answers (a timeout inside the adapter that did not come back) is the same quiet gap, before the runner's own limit", async () => {
    vi.useFakeTimers();
    try {
      const pending = run(fakeVendors({ shortStay: () => new Promise<never>(() => {}) }));
      await vi.advanceTimersByTimeAsync(VENDOR_BUDGET_MS.airdna + 300);
      expect(await pending).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE });
      expect(VENDOR_BUDGET_MS.airdna + 300).toBeLessThan(L06Shortstay.timeout_ms!);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an address with no coordinates is a gap and the vendor is never asked (the cache is keyed on the point)", async () => {
    const shortStay = vi.fn();
    const out = await run(fakeVendors({ shortStay }), [l02(WEEKLY_CENTS)], { lat: null, lon: null });
    expect(out).toMatchObject({ status: "gap", message: NO_COORDINATES_MESSAGE });
    expect(shortStay).not.toHaveBeenCalled();
  });
});

describe("L06 figure labels follow the method", () => {
  it("AirDNA's own figure labels the comparable listings as shown and the 25th to 75th range as context, not as the range of the estimate", async () => {
    const out = await run(est({ annual_revenue: 91_200, confidence_level: "High" }));
    expect(out.payload.method).toBe("airdna");
    expect(fig(out, "shortstay_comps_used").label).toBe("Comparable listings shown");
    expect(fig(out, "shortstay_annual_p25").label).toBe("Nearby listings, for context: low end, a year");
    expect(fig(out, "shortstay_annual_p75").label).toBe("Nearby listings, for context: high end, a year");
    expect(fig(out, "shortstay_annual_p25").note).toMatch(/context, not the range of AirDNA's estimate/);
    expect(out.figures.map((f) => f.label).join("|")).not.toMatch(/Low end of the range|Comparable listings used/);
  });

  it("AirDNA's figure as the fallback (no usable comparable listings) uses the same labels", async () => {
    const out = await run(est({ annual_revenue: 91_200, confidence_level: "Medium", comps: [] }));
    expect(out.payload.method).toBe("airdna_fallback");
    expect(fig(out, "shortstay_comps_used").label).toBe("Comparable listings shown");
  });

  it("our own estimate keeps the range labels and 'used'", async () => {
    const out = await run(est({ confidence_level: "Medium", annual_revenue: 30_000, comps: strongComps(8, (i) => 60_000 + i * 1_000) }));
    expect(out.payload.method).toBe("own");
    expect(fig(out, "shortstay_comps_used").label).toBe("Comparable listings used");
    expect(fig(out, "shortstay_annual_p25").label).toBe("Low end of the range, a year");
    expect(fig(out, "shortstay_annual_p75").label).toBe("High end of the range, a year");
  });
});

describe("L06 wording and what is kept", () => {
  it("never uses guarantee or forecast language, and keeps only an id, distance, size, income, reviews and a link per comparable listing", async () => {
    const out = await run(est());
    const text = strings([out.figures, out.payload]).join(" ");
    expect(text).not.toMatch(/will earn|guarantee|predict/i);
    expect(text).toMatch(/not a promise or a forecast/);
    for (const c of out.payload.comps as Record<string, unknown>[]) {
      expect(Object.keys(c).sort()).toEqual(["bathrooms", "bedrooms", "distance_m", "id", "link", "revenue_cents", "reviews", "strong"]);
    }
    expect(JSON.stringify(out.payload)).not.toMatch(/photo|cover_img|title/);
  });

  it("builds the full address the way the CRM does", () => {
    expect(airdnaAddress({ display_address: "310/628 Flinders St, Docklands VIC 3008", locality: "Docklands", state: "VIC", postcode: "3008" })).toBe("310/628 Flinders St, Docklands VIC 3008, Australia");
    expect(airdnaAddress({ display_address: "310/628 Flinders St", locality: "Docklands", state: "VIC", postcode: "3008" })).toBe("310/628 Flinders St, Docklands, VIC, 3008, Australia");
  });
});

describe("L06 in the assembled report", () => {
  const report = async (vendors: VendorAdapters) => {
    const model = await assembleReport({ db, address: await resolveQuery(db, DOCKLANDS_UNIT), principal: ANONYMOUS, request_id: "t", vendors });
    return Object.fromEntries(model.layers.map((l) => [l.layer_id, l]));
  };

  it("sits right after L05-return, is free and live, and is a synthesis layer with a longer time limit", () => {
    const ids = LAYERS.map((l) => l.layer_id);
    expect(ids.indexOf("L06-shortstay")).toBe(ids.indexOf("L05-return") + 1);
    expect(L06Shortstay).toMatchObject({ tier: "free", synthesis: true, source_ids: ["airdna_rentalizer", "gnaf"], timeout_ms: 6500 });
  });

  it("keeps the whole report under about 12 s when vendors hang: the layer limits sit just above the vendor budgets and L19 then L06 add up to 12 s", () => {
    expect(VENDOR_BUDGET_MS).toEqual({ airdna: 6000, mapillary: 5000, wikimedia: 5000 });
    expect(L06Shortstay.timeout_ms).toBeGreaterThan(VENDOR_BUDGET_MS.airdna);
    expect(L06Shortstay.timeout_ms).toBeLessThanOrEqual(VENDOR_BUDGET_MS.airdna + 1000);
    expect(L19Photos.timeout_ms).toBeGreaterThan(Math.max(VENDOR_BUDGET_MS.mapillary, VENDOR_BUDGET_MS.wikimedia));
    expect(L19Photos.timeout_ms).toBeLessThanOrEqual(Math.max(VENDOR_BUDGET_MS.mapillary, VENDOR_BUDGET_MS.wikimedia) + 1000);
    expect(L19Photos.timeout_ms! + L06Shortstay.timeout_ms!).toBeLessThanOrEqual(12_000);
  });

  it("reads the real L02 rent: an estimate above 1.4 times shows, one under hides, and L14 credits AirDNA only when the section showed data", async () => {
    const base = await report(fakeVendors());
    const rent = base["L02-rent"].figures.find((f) => f.key === "rent_2bed_flat");
    expect(rent && typeof rent.value === "number", "the fixture Docklands suburb has a 2-bedroom flat rent").toBe(true);
    const annualRentDollars = ((rent!.value as number) * 52) / 100;

    const shown = await report(est({ annual_revenue: Math.ceil(annualRentDollars * 1.4) + 10, confidence_level: "High" }));
    expect(shown["L06-shortstay"].status).toBe("ok");
    const sources = shown["L14-attribution"].payload.sources as { source_id: string; attribution_text: string; used_by: string[]; adapted: boolean }[];
    expect(sources.find((s) => s.source_id === "airdna_rentalizer")).toMatchObject({ attribution_text: "Short-stay estimates use AirDNA market data (RapidAPI).", used_by: ["L06-shortstay"], adapted: true });

    const hidden = await report(est({ annual_revenue: Math.floor(annualRentDollars * 1.4) - 10, confidence_level: "High" }));
    expect(hidden["L06-shortstay"]).toMatchObject({ status: "gap", message: BELOW_CUTOFF_MESSAGE });
    const down = await report(UNAVAILABLE_VENDORS);
    expect(down["L06-shortstay"]).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE });
    for (const r of [hidden, down]) {
      const ids = ((r["L14-attribution"].payload.sources ?? []) as { source_id: string }[]).map((s) => s.source_id);
      expect(ids).not.toContain("airdna_rentalizer");
    }
  });

  it("a vendor that throws turns only L06 into the quiet gap, never an error card: every other section is unaffected (AD-9)", async () => {
    const boom = await report(fakeVendors({ shortStay: async () => { throw new Error("boom"); } }));
    expect(boom["L06-shortstay"]).toMatchObject({ status: "gap", message: UNAVAILABLE_MESSAGE });
    const calm = await report(fakeVendors());
    for (const id of Object.keys(calm)) if (id !== "L06-shortstay") expect(boom[id].status, id).toBe(calm[id].status);
  });

  it("the rights gate fails closed: a pending source makes L06 not_covered and it never runs", async () => {
    const shortStay = vi.fn();
    await db.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'airdna_rentalizer'");
    try {
      const layers = await report(fakeVendors({ shortStay }));
      expect(layers["L06-shortstay"].status).toBe("not_covered");
      expect(shortStay).not.toHaveBeenCalled();
      expect(layers["L19-photos"].status).not.toBe("not_covered");
    } finally {
      await db.query("UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'airdna_rentalizer'");
    }
  });

  it("L13 is unchanged and still reads only the ordinary layers; L14 is the layer that reads L06", () => {
    const l14 = LAYERS.find((l) => l.layer_id === "L14-attribution")!;
    const l13 = LAYERS.find((l) => l.layer_id === "L13-questions")!;
    expect(l14.after_synthesis).toBe(true);
    expect(l13.after_synthesis).toBeUndefined();
  });
});

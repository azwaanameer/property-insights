// L21 Reported recent sales and L04 Price drivers, run end to end on the committed excerpt of the real sold listings (loaded through the real loader,
// matched to the fixture G-NAF buildings, and the model fitted through the real derive step) in PGlite. One test per row of the spec's I/O matrix,
// plus the rights gate, the credit, the "no agent data" guarantee and the wording guard.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { handleCoverage } from "../http/handlers";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, type SuburbDataset, type TestDb } from "../testing/db";
import { UNAVAILABLE_VENDORS } from "../vendors/types";
import { LAYERS } from ".";
import { ASSOCIATION_NOTE, HOUSE_MESSAGE, L04Drivers, layoutLabel } from "./L04-drivers";
import { L21Sales, MAX_SALES, NO_BUILDING_MESSAGE } from "./L21-sales";
import { SALES_CREDIT, coverageMessage, listingLink } from "./shared/sold";
import { getSalesDataset } from "../repos/sale";

const DOCKLANDS_UNIT = "310/628 Flinders St Docklands";
const CARLTON_HOUSE = "7 Smith Rd Carlton";
const LISTING = "https://www.realestate.com.au/";

async function report(t: TestDb, query: string) {
  const address = await resolveQuery(t, query);
  const model = await assembleReport({ db: t, address, principal: ANONYMOUS, request_id: "t" });
  return Object.fromEntries(model.layers.map((l) => [l.layer_id, l])) as Record<string, LayerResult>;
}
const figs = (l: LayerResult) => Object.fromEntries(l.figures.map((f) => [f.key, f]));
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

/** A layer run directly with the address changed, for places the fixture addresses do not reach (a house in South Melbourne, another state). */
async function runWith(layer: { run: (ctx: any) => Promise<any> }, over: Partial<ResolvedAddress>, t: TestDb = db, query = DOCKLANDS_UNIT) {
  const address = { ...(await resolveQuery(t, query)), ...over };
  return layer.run({ db: t, address, request_id: "t", vendors: UNAVAILABLE_VENDORS });
}
/** A house on a South Melbourne street: not a unit, not in a multi-unit building. */
const house = (street: string, over: Partial<ResolvedAddress> = {}): Partial<ResolvedAddress> => ({
  match: "building", is_multi_unit: false, building_id: null, unit_number: null, flat_type: null, level_number: null, building_name: null,
  street, street_number: "1", locality: "South Melbourne", postcode: "3205", sal_code: "22310", sal_name: "South Melbourne", state: "VIC", display_address: `1 ${street}, South Melbourne VIC 3205`, ...over,
});
async function withDb<T>(fn: (t: TestDb) => Promise<T>, omit: SuburbDataset[] = []): Promise<T> {
  const t = await createSuburbDataTestDb({ omit });
  try {
    return await fn(t.db);
  } finally {
    await t.close();
  }
}

describe("L21: an apartment with sales in its building (Docklands unit)", () => {
  let l21: LayerResult;
  beforeAll(async () => {
    l21 = (await report(db, DOCKLANDS_UNIT))["L21-sales"];
  });

  it("is ok, free, and lists up to 8 sales of the same building, newest first, with the count of all of them", () => {
    expect(l21).toMatchObject({ status: "ok", tier: "free", title: "Reported recent sales" });
    const p = l21.payload as { scope: string; total: number; shown: number; sales: { sold_on: string }[] };
    expect(p).toMatchObject({ scope: "building", total: 11, shown: MAX_SALES });
    expect(p.sales).toHaveLength(8);
    expect(p.sales.map((s) => s.sold_on)).toEqual([...p.sales.map((s) => s.sold_on)].sort().reverse());
    expect(p.sales[0].sold_on).toBe("2026-09-17");
    expect(figs(l21).reported_sales_count).toMatchObject({ value: 11, unit: "count" });
  });

  it("gives every sale its date, price in cents, beds, baths, car spaces, address and a link to its listing page on realestate.com.au", () => {
    const sales = (l21.payload as { sales: Record<string, unknown>[] }).sales;
    for (const s of sales) {
      expect(s).toMatchObject({ reported_by: "realestate.com.au" });
      expect(s.sold_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(s.price_cents) && (s.price_cents as number) % 100 === 0).toBe(true);
      expect(typeof s.address).toBe("string");
      expect(String(s.address)).toMatch(/\/628 Flinders Street$/);
      for (const k of ["bed", "bath", "park"]) expect(typeof s[k]).toBe("number");
      expect(String(s.link)).toMatch(/^https:\/\/www\.realestate\.com\.au\/property-apartment-vic-docklands-\d+$/);
    }
    expect(sales[0]).toMatchObject({ price_cents: 76_000_000, bed: 2, bath: 2, park: 1, address: "3203/628 Flinders Street", link: `${LISTING}property-apartment-vic-docklands-152088352` });
  });

  it("labels the sales as reported, never as verified or as a title record, and carries the credit and the dataset (harvest) date", () => {
    const text = strings(l21.payload).join(" ");
    expect(text).toMatch(/as reported on realestate\.com\.au/);
    expect(text).toMatch(/not checked, and it is not a Victorian title record/);
    expect(text).not.toMatch(/verified/i);
    expect((l21.payload as { credit: string }).credit).toBe(SALES_CREDIT);
    expect((l21.payload as { harvested_on: string }).harvested_on).toBe("2026-11-21");
    for (const f of l21.figures) expect(f).toMatchObject({ chip: "Estimated", source_ids: ["rp_sold_listings"], as_of: "2026-11-21" });
  });

  it("shows the most recent sale as a figure with its date, and no valuation or estimated price for this property", () => {
    const f = figs(l21).latest_reported_sale;
    expect(f).toMatchObject({ value: 76_000_000, unit: "AUD_cents", label: "Most recent reported sale" });
    expect(f.note).toMatch(/Sold 2026-09-17/);
    expect(l21.figures.some((x) => /valuation|estimated price|worth/i.test(x.label))).toBe(false);
  });

  it("lists only sales of this building: a sale matched to no building, or to another, is not here", async () => {
    const sales = (l21.payload as { sales: { address: string }[] }).sales;
    expect(sales.every((s) => /628 Flinders Street/.test(s.address))).toBe(true);
    const other = await db.query("SELECT count(*)::int AS n FROM fact_reported_sale WHERE address_text LIKE '%628 Flinders Street%' AND building_id IS NULL");
    expect(other[0].n).toBe(0);
  });

  it("has a link that is the site plus the stored url", async () => {
    const [r] = await db.query("SELECT url FROM fact_reported_sale WHERE listing_id = '152088352'");
    expect(listingLink(r.url)).toBe(`${LISTING}${r.url}`);
    expect(listingLink("property-residential land-vic-x-1")).toBe(`${LISTING}property-residential%20land-vic-x-1`);
  });
});

describe("L21: a house with sales on its street", () => {
  it("lists the houses and townhouses sold on the same street, newest first, and leaves the apartments out", async () => {
    const out = await runWith(L21Sales, house("PARK STREET"));
    expect(out.status).toBe("ok");
    expect(out.payload).toMatchObject({ scope: "street", total: 4, shown: 4 });
    const sales = out.payload.sales as { address: string; sold_on: string; property_type: string }[];
    expect(sales.map((s) => s.address)).toEqual(["198 Park Street", "339 Park Street", "389 Park Street", "101 Park Street"]);
    expect(sales.map((s) => s.property_type)).toEqual(["house", "house", "house", "townhouse"]);
    expect(out.payload.notes.join(" ")).toMatch(/apartments are not included/);
    expect(out.figures.find((f: { key: string }) => f.key === "reported_sales_count")).toMatchObject({ value: 4, label: "Reported sales on this street" });
  });

  it("is a gap that says no sale on the street is in the dataset when there is none, and the dataset's coverage", async () => {
    const out = await runWith(L21Sales, house("NOWHERE STREET"));
    expect(out.status).toBe("gap");
    expect(out.message).toMatch(/No sale on NOWHERE STREET is in the reported sales dataset \(4 suburbs, sold \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}\)/);
  });

  it("matches the street, the suburb and the postcode together: the same street name in another suburb is not this street", async () => {
    const out = await runWith(L21Sales, house("PARK STREET", { locality: "Docklands", postcode: "3008", sal_code: "20766" }));
    expect(out.status).toBe("gap");
  });
});

describe("L21 and L04: a suburb that was not harvested", () => {
  it.each([CARLTON_HOUSE])("%s: both sections are honest gaps naming the coverage", async (q) => {
    const layers = await report(db, q);
    const dataset = (await getSalesDataset(db))!;
    for (const id of ["L21-sales", "L04-drivers"]) {
      expect(layers[id], id).toMatchObject({ status: "gap", figures: [] });
      expect(layers[id].message).toBe(coverageMessage(dataset));
    }
    expect(layers["L21-sales"].message).toMatch(/^Reported sales are loaded for 4 suburbs only \(Docklands, Melbourne CBD, South Melbourne, St Kilda\), and this address is not in one of them\.$/);
    // The rest of the report is untouched.
    expect(layers["L03-price"].status).toBe("ok");
  });

  it("an address whose suburb matches no ABS suburb (Fakeville) says it could not be matched", async () => {
    const layers = await report(db, "5 Odd Court Fakeville");
    for (const id of ["L21-sales", "L04-drivers"]) expect(layers[id]).toMatchObject({ status: "gap", message: "The suburb of this address could not be matched to one ABS suburb, so reported sales are not shown." });
  });

  it("an address in another state is the same gap, and a suburb that could not be matched says so", async () => {
    expect((await runWith(L21Sales, { state: "NSW" })).message).toBe(coverageMessage((await getSalesDataset(db))!));
    expect((await runWith(L21Sales, { sal_code: null })).message).toMatch(/could not be matched to one ABS suburb/);
    expect((await runWith(L04Drivers, { state: "NSW" })).status).toBe("gap");
    expect((await runWith(L04Drivers, { sal_code: null })).status).toBe("gap");
  });
});

describe("L21: a unit without a building, and an unloaded dataset", () => {
  it("a unit whose building is not known cannot list building sales", async () => {
    const out = await runWith(L21Sales, { building_id: null });
    expect(out).toMatchObject({ status: "gap", message: NO_BUILDING_MESSAGE });
  });

  it("with no dataset loaded L21 and L04 say 'Reported sales are not loaded.' and nothing else changes", async () => {
    await withDb(async (t) => {
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers["L21-sales"]).toMatchObject({ status: "gap", message: "Reported sales are not loaded.", figures: [] });
      expect(layers["L04-drivers"]).toMatchObject({ status: "gap", message: "Reported sales are not loaded.", figures: [] });
      for (const id of ["L01-property", "L03-price", "L16-transport", "L11-building", "L14-attribution"]) expect(layers[id].status, id).toBe("ok");
      const sources = (layers["L14-attribution"].payload.sources as { source_id: string }[]).map((s) => s.source_id);
      expect(sources).not.toContain("rp_sold_listings");
    }, ["sold"]);
  });

  it("with the sales loaded but no model, L21 is ok and L04 says the model is not loaded", async () => {
    await withDb(async (t) => {
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers["L21-sales"].status).toBe("ok");
      expect(layers["L04-drivers"]).toMatchObject({ status: "gap", message: "The price-driver model is not loaded." });
    }, ["drivers"]);
  });
});

describe("L04: price drivers for a Docklands apartment", () => {
  let l04: LayerResult;
  beforeAll(async () => {
    l04 = (await report(db, DOCKLANDS_UNIT))["L04-drivers"];
  });

  it("is ok and shows the pooled drivers (2 and 3 bedrooms, 2+ baths, a car space, three floor bands) each with its effect, standard error and sample size", () => {
    expect(l04).toMatchObject({ status: "ok", tier: "free" });
    const drivers = (l04.payload as { drivers: Record<string, unknown>[] }).drivers;
    expect(drivers.map((d) => d.key)).toEqual(["bed_2", "bed_3", "bath_2plus", "car_space", "floor_10_19", "floor_20_29", "floor_30plus"]);
    for (const d of drivers) {
      expect(typeof d.effect_pct).toBe("number");
      expect(d.se_pct as number).toBeGreaterThan(0);
      expect(d.n_group as number).toBeGreaterThan(0);
      expect(d.n_used as number).toBeGreaterThan(100);
    }
    const f = figs(l04);
    expect(f.effect_bed_2.value as number).toBeGreaterThan(0.2);
    expect(f.effect_bed_2.value as number).toBeLessThan(0.45);
    expect(f.effect_bed_3.value as number).toBeGreaterThan(f.effect_bed_2.value as number);
    expect(f.effect_bed_2).toMatchObject({ unit: "fraction", chip: "Estimated", source_ids: ["rp_sold_listings", "rp_sold_model"], as_of: "2026-11-21" });
    expect(f.effect_bed_2.note).toMatch(/Standard error [\d.]+ percentage points\. \d+ of the \d+ sales used/);
  });

  it("gives this suburb's difference against the reference suburb, with its standard error and its sales", () => {
    const f = figs(l04).effect_suburb;
    expect(f.label).toBe("Sale price difference, Docklands compared with Melbourne CBD");
    expect(f.chip).toBe("Estimated");
    expect(f.note).toMatch(/Standard error [\d.]+ percentage points, from 142 sales in Docklands/);
    expect((l04.payload as { suburb: Record<string, unknown> }).suburb).toMatchObject({ name: "Docklands", reference: "Melbourne CBD", is_reference: false, n: 142 });
  });

  it("says the effects are associations, not causes, and gives the window and the number of sales", () => {
    const p = l04.payload as { notes: string[]; association: boolean; model: { n_used: number; n_total: number; window_from: string; window_to: string; suburbs: number } };
    expect(p.association).toBe(true);
    expect(p.notes[0]).toBe(ASSOCIATION_NOTE);
    expect(ASSOCIATION_NOTE).toMatch(/associations in past reported sales, not causes/);
    const text = p.notes.join(" ");
    expect(text).toContain(`Based on ${p.model.n_used} of ${p.model.n_total} apartment sales`);
    expect(text).toContain(`sold ${p.model.window_from} to ${p.model.window_to}`);
    expect(p.model.window_from < p.model.window_to).toBe(true);
    expect(p.model.n_used).toBeGreaterThan(200);
  });

  it("counts the sales the model could not use: it used fewer than all the apartment sales (no unit number, thin suburb) and says 'used X of Y'", () => {
    const p = l04.payload as { model: { n_used: number; n_total: number } };
    expect(p.model.n_used).toBeLessThan(p.model.n_total);
    const f = figs(l04).sales_used;
    expect(f.value).toBe(p.model.n_used);
    expect(f.note).toContain(`Used ${p.model.n_used} of ${p.model.n_total} apartment sales`);
    expect(f.note).toMatch(/unit number has fewer than three digits/);
  });

  it("shows the layout medians with their sales, only for layouts with at least 20 sales in the suburb", () => {
    const layouts = (l04.payload as { layouts: { beds: number; baths: number; has_car: boolean; label: string; median_cents: number; n: number }[] }).layouts;
    expect(layouts.map((l) => [l.label, l.median_cents, l.n])).toEqual([
      ["1 bed, 1 bath, no car space", 37_000_000, 28],
      ["1 bed, 1 bath, with a car space", 42_000_000, 23],
      ["2 bed, 1 bath, with a car space", 56_500_000, 31],
      ["2 bed, 2 or more bath, with a car space", 69_800_000, 47],
    ]);
    for (const l of layouts) expect(l.n).toBeGreaterThanOrEqual(20);
    expect(layoutLabel({ beds: 3, baths: 2, has_car: false })).toBe("3 bed, 2 or more bath, no car space");
  });

  it("omits a thin layout even when one was stored: a cell with fewer than 20 sales is not shown", async () => {
    await withDb(async (t) => {
      await t.query("UPDATE derived_layout_median SET n = 12 WHERE sal_code = '20766' AND beds = 1 AND baths = 1 AND has_car = false");
      const l04b = (await report(t, DOCKLANDS_UNIT))["L04-drivers"];
      const labels = (l04b.payload as { layouts: { label: string }[] }).layouts.map((l) => l.label);
      expect(labels).toHaveLength(3);
      expect(labels).not.toContain("1 bed, 1 bath, no car space");
    });
  });

  it("is a gap for a house in a harvested suburb, saying it covers apartments only", async () => {
    const out = await runWith(L04Drivers, house("COBDEN STREET"));
    expect(out).toMatchObject({ status: "gap", message: HOUSE_MESSAGE, figures: [] });
  });

  it("for the reference suburb says it is the reference and has no effect of its own; for a suburb too thin to carry one, says so and shows a gap figure", async () => {
    const reference = await runWith(L04Drivers, { sal_code: "21640", sal_name: "Melbourne", locality: "Melbourne" });
    expect(reference.status).toBe("ok");
    expect(reference.payload.suburb).toMatchObject({ name: "Melbourne CBD", is_reference: true, effect_pct: 0 });
    expect(reference.figures.map((f: { key: string }) => f.key)).not.toContain("effect_suburb");

    const thin = await runWith(L04Drivers, { sal_code: "22343", sal_name: "St Kilda", locality: "St Kilda" });
    expect(thin.status).toBe("ok");
    expect(thin.payload.suburb).toMatchObject({ name: "St Kilda", effect_pct: null, se_pct: null, is_reference: false });
    const gap = thin.figures.find((f: { key: string }) => f.key === "effect_suburb");
    expect(gap).toMatchObject({ value: null, chip: "Unknown" });
    expect(gap.note).toMatch(/fewer than 20 usable apartment sales/);
    expect(thin.payload.layouts).toEqual([]);
    expect(thin.payload.notes.join(" ")).toMatch(/No layout has 20 or more reported sales in St Kilda/);
  });
});

describe("rights, credit and registration", () => {
  it("a source set to pending turns its section into 'Not available yet' (AD-4 fails closed)", async () => {
    await withDb(async (t) => {
      await t.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'rp_sold_listings'");
      const layers = await report(t, DOCKLANDS_UNIT);
      for (const id of ["L21-sales", "L04-drivers"]) {
        expect(layers[id].status, id).toBe("not_covered");
        expect(layers[id].message).toBe("Not available yet");
        expect(JSON.stringify(layers[id])).not.toMatch(/rp_sold|pending|cleared/i);
      }
      const sources = (layers["L14-attribution"].payload.sources as { source_id: string }[]).map((s) => s.source_id);
      expect(sources).not.toContain("rp_sold_listings");
      expect(sources).not.toContain("rp_sold_model");
    });
  });

  it("L14 credits the listing data with its attribution text, the owner's licence line and the harvest date, and the model as adapted, only when a section returned data", async () => {
    const sources = (await report(db, DOCKLANDS_UNIT))["L14-attribution"].payload.sources as Record<string, unknown>[];
    const by = Object.fromEntries(sources.map((s) => [s.source_id as string, s]));
    expect(by.rp_sold_listings).toMatchObject({
      attribution_text: "Recent sales as reported on realestate.com.au listings, retrieved by VicProp.",
      licence: "Third-party listing data (realestate.com.au via RapidAPI realty-in-au); reuse ruled acceptable by the owner 2026-11-21",
      licence_url: null,
      adapted: true,
      as_of: "2026-11-21",
      used_by: ["L21-sales", "L04-drivers"],
    });
    expect(by.rp_sold_model).toMatchObject({ used_by: ["L04-drivers"], adapted: true, as_of: "2026-11-21" });
    expect(String(by.rp_sold_model.attribution_text)).toMatch(/computed by VicProp/);
    // A gap credits nothing.
    const carlton = (await report(db, CARLTON_HOUSE))["L14-attribution"].payload.sources as { source_id: string }[];
    expect(carlton.map((s) => s.source_id)).not.toContain("rp_sold_listings");
  });

  it("L21 comes right after L03-price and L04 right after L21, and both are live in the coverage endpoint", async () => {
    const ids = LAYERS.map((l) => l.layer_id);
    expect(ids.indexOf("L21-sales")).toBe(ids.indexOf("L03-price") + 1);
    expect(ids.indexOf("L04-drivers")).toBe(ids.indexOf("L21-sales") + 1);
    const body = await (await handleCoverage(() => db)).json();
    const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
    expect(status["L21-sales"]).toBe("live");
    expect(status["L04-drivers"]).toBe("live");
    expect(LAYERS.find((l) => l.layer_id === "L21-sales")!.source_ids).toEqual(["rp_sold_listings", "gnaf"]);
    expect(LAYERS.find((l) => l.layer_id === "L04-drivers")!.source_ids).toEqual(["rp_sold_listings", "rp_sold_model", "gnaf"]);
  });

  it("the credit the layers show is the one the source row carries", async () => {
    const [src] = await db.query("SELECT attribution_text FROM src_source WHERE source_id = 'rp_sold_listings'");
    expect(src.attribution_text).toBe(SALES_CREDIT);
  });
});

describe("no agent data, and the wording guard", () => {
  const FORBIDDEN_TEXT = /\b(valuation|valued|forecast\w*|predict\w*|best|agent|agency|phone|appraisal)\b/i;
  const FORBIDDEN_KEY = /(^|_)(score|forecast|prediction|predicted|agent|agency|phone|valuation|estimate|estimated_price)(_|$)/i;

  it.each([DOCKLANDS_UNIT, CARLTON_HOUSE])("%s: no agent, agency or phone value or field in either section", async (q) => {
    const layers = await report(db, q);
    for (const id of ["L21-sales", "L04-drivers"]) {
      const json = JSON.stringify(layers[id]);
      expect(json, id).not.toMatch(/Fixture Agen|0400000000|Fixture listing/i);
      for (const k of keys({ figures: layers[id].figures, payload: layers[id].payload })) expect(k, `${id} key ${k}`).not.toMatch(FORBIDDEN_KEY);
      for (const s of strings(layers[id])) expect(s, `${id}: ${s}`).not.toMatch(FORBIDDEN_TEXT);
      // "worth" is the section's heading in the report (copy.ts), not a word of the layer.
      expect(json, id).not.toMatch(/\bworth\b/i);
    }
  });

  it("no figure of either section is a price for this property: every L21 price is a listed sale and L04 has none at all", async () => {
    const layers = await report(db, DOCKLANDS_UNIT);
    expect(layers["L04-drivers"].figures.some((f) => f.unit === "AUD_cents")).toBe(false);
    const sold = new Set((await db.query("SELECT price_aud::int * 100 AS c FROM fact_reported_sale")).map((r) => r.c));
    const prices = (layers["L21-sales"].payload.sales as { price_cents: number }[]).map((s) => s.price_cents);
    for (const p of prices) expect(sold.has(p)).toBe(true);
  });
});

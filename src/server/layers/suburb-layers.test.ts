// Layers L02 Rent, L03 Price, L07 History and L09 Suburb compare, run end to end on excerpts of the real files
// loaded through the real pipelines into PGlite. One test per row of the spec's I/O matrix, plus the "no score or forecast" guard.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { handleCoverage } from "../http/handlers";
import { cagr, grossYield, rankAmong, relativeChange } from "./shared/derive";
import { createSuburbDataTestDb, type SuburbDataset, type TestDb } from "../testing/db";
import { parseRentGrid } from "../../../pipeline/ingest/homes-vic-rents.mjs";
import { rentGrid } from "../../../pipeline/ingest/fixtures/suburb-data.mjs";
import { L02Rent } from "./L02-rent";
import { L03Price } from "./L03-price";
import { L07History } from "./L07-history";
import { L09SuburbCompare } from "./L09-suburb-compare";

const SUBURB_LAYERS = ["L02-rent", "L03-price", "L07-history", "L09-suburb-compare"];

async function report(db: TestDb, query: string) {
  const address = await resolveQuery(db, query);
  const model = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "t" });
  return Object.fromEntries(model.layers.map((l) => [l.layer_id, l])) as Record<string, LayerResult>;
}
const figs = (l: LayerResult) => Object.fromEntries(l.figures.map((f) => [f.key, f]));

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
});
afterAll(() => close());

describe("full suburb: a Docklands unit", () => {
  it("L01, L02, L03, L07 and L09 are ok, and every figure has a chip, source ids and an as_of", async () => {
    const layers = await report(db, "310/628 Flinders St Docklands");
    for (const id of ["L01-property", ...SUBURB_LAYERS]) {
      expect(layers[id].status, id).toBe("ok");
      for (const f of layers[id].figures) {
        expect(f.chip, `${id} ${f.key}`).toMatch(/^(Observed|Estimated|Unknown|Conflict)$/);
        expect(f.source_ids.length, `${id} ${f.key}`).toBeGreaterThan(0);
        expect(f.as_of, `${id} ${f.key}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("L02: median weekly rent with the lettings count and the year-ago change (suburb_context.json: $800, 1,471 lettings, $750 a year ago)", async () => {
    const l02 = (await report(db, "310/628 Flinders St Docklands"))["L02-rent"];
    const f = figs(l02);
    expect(f.rent_2bed_flat).toMatchObject({ value: 80_000, unit: "AUD_cents_per_week", chip: "Observed", source_ids: ["homes_victoria_rents"], as_of: "2026-06-30" });
    expect(f.rent_2bed_flat_lettings).toMatchObject({ value: 1471, unit: "count", chip: "Observed" });
    expect(f.rent_2bed_flat_change_1y).toMatchObject({ value: relativeChange(800, 750), unit: "fraction", chip: "Estimated" });
    expect(f.rent_2bed_flat_change_1y.note).toContain("Derived");
    // 1- and 3-bedroom flats come from the same file.
    expect(f.rent_1bed_flat.value).toBeGreaterThan(0);
    expect(f.rent_3bed_flat.value).toBeGreaterThan(f.rent_2bed_flat.value as number);
    expect(l02.payload).toMatchObject({ sal_code: "20766", dwelling_family: "unit", rent_area: "Docklands", rent_area_match_type: "exact" });
  });

  it("L02: gross yield is rent x 52 / median unit price, Estimated, and names both sources and the method", async () => {
    const f = figs((await report(db, "310/628 Flinders St Docklands"))["L02-rent"]);
    expect(f.gross_yield).toMatchObject({ value: grossYield(80_000, 56_650_000), unit: "fraction", chip: "Estimated" });
    expect(f.gross_yield.source_ids).toEqual(["homes_victoria_rents", "vgv_medians"]);
    expect(f.gross_yield.note).toMatch(/x 52/);
    expect(f.gross_yield.note).toMatch(/different files/);
    expect(f.gross_yield.as_of).toBe("2026-03-31"); // the older of the two dataset dates
  });

  it("L03: median unit price with the sales count, one-year change and calendar-year median", async () => {
    const f = figs((await report(db, "310/628 Flinders St Docklands"))["L03-price"]);
    expect(f.unit_median_price).toMatchObject({ value: 56_650_000, unit: "AUD_cents", chip: "Observed", source_ids: ["vgv_medians"], as_of: "2026-03-31" });
    expect(f.unit_median_price.label).toContain("March quarter 2026");
    expect(f.unit_sales_count).toMatchObject({ value: 144, unit: "count", chip: "Observed" });
    expect(f.unit_price_change_1y).toMatchObject({ value: relativeChange(566_500, 635_000), chip: "Estimated" }); // file says -10.8%
    expect(f.unit_median_price_year).toMatchObject({ value: 58_500_000, chip: "Observed" });
    expect(f.unit_median_price_year.label).toContain("2025");
  });

  it("L07: annual series 2015 to 2025 and the 5- and 10-year growth rates, Estimated with the method named", async () => {
    const l07 = (await report(db, "310/628 Flinders St Docklands"))["L07-history"];
    const f = figs(l07);
    expect(f.unit_price_cagr_5y).toMatchObject({ value: cagr(602_000, 585_000, 5), unit: "fraction", chip: "Estimated" });
    expect(f.unit_price_cagr_10y).toMatchObject({ value: cagr(645_000, 585_000, 10), chip: "Estimated" });
    expect(f.unit_price_cagr_5y.note).toContain("^ (1/5) - 1");
    const series = (l07.payload.price_series as { unit: { year: number; median_cents: number; low_count: boolean }[] }).unit;
    expect(series.map((p) => p.year)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    // Docklands has no thin year in the real file, so every point says so explicitly.
    expect(series.map((p) => p.low_count)).toEqual(Array(11).fill(false));
    expect(series[0].median_cents).toBe(64_500_000);
    expect(l07.payload.price_series_meta).toMatchObject({ chip: "Observed", source_ids: ["vgv_medians"], as_of: "2026-03-31" });
    // Rent growth from the June quarters of the 2-bedroom flat rent.
    const dock = parseRentGrid(rentGrid("2 bedroom flat")).areas.find((a) => a.area === "Docklands")!;
    const at = (p: string) => dock.values.find((v) => v.period === p)!.median;
    expect(f.rent_cagr_5y.value).toBe(cagr(at("2021-06-30"), at("2026-06-30"), 5));
    expect(f.rent_cagr_10y.value).toBe(cagr(at("2016-06-30"), at("2026-06-30"), 10));
  });

  it("L09: compares the suburb with its real neighbours, side by side, with positions that say how they were derived", async () => {
    const l09 = (await report(db, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
    const table = l09.payload.table as { columns: { key: string; unit: string; chip: string; source_ids: string[]; as_of: string | null }[]; rows: { name: string; is_subject: boolean; thin: string[]; values: Record<string, number | null> }[] };
    expect(table.rows[0]).toMatchObject({ name: "Docklands", is_subject: true });
    expect(Object.fromEntries(table.columns.map((c) => [c.key, c.unit]))).toEqual({
      price_cents: "AUD_cents",
      rent_weekly_cents: "AUD_cents_per_week",
      gross_yield: "fraction",
      price_cagr_5y: "fraction",
      seifa_irsad: "index",
      flat_share: "fraction",
      owner_share: "fraction",
    });
    // Nothing in the Docklands excerpts is thin or flagged, and every row lists its thin columns explicitly.
    expect(table.rows.every((r) => Array.isArray(r.thin))).toBe(true);
    expect(table.rows[0].thin).toEqual([]);
    expect(table.rows[0].values).toMatchObject({ price_cents: 56_650_000, rent_weekly_cents: 80_000, seifa_irsad: 1109 });
    expect(table.rows[0].values.flat_share).toBeCloseTo(7376 / 7540, 6);
    const names = table.rows.slice(1).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Melbourne", "Southbank"]));
    expect(names).not.toContain("Docklands");
    for (const c of table.columns) {
      expect(c.chip).toMatch(/^(Observed|Estimated)$/);
      expect(c.source_ids.length).toBeGreaterThan(0);
      expect(c.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const f = figs(l09);
    // Unit prices among Docklands 566,500, Melbourne 490,000 and Southbank 590,000: Docklands is second of three.
    expect(f.rank_price_cents).toMatchObject({ value: "2 of 3", chip: "Estimated", unit: "rank" });
    expect(f.rank_price_cents.note).toContain("Derived");
    expect(f.rank_price_cents.note).toContain("not a score");
    expect(f.neighbour_count).toMatchObject({ unit: "count", chip: "Estimated" });
    expect(f.neighbour_count.value).toBeGreaterThanOrEqual(5);
  });
});

describe("no house prices: a suburb with units only", () => {
  it("L03 shows the unit median, the house figure is a gap figure with a note, and the layer is ok", async () => {
    const l03 = (await report(db, "310/628 Flinders St Docklands"))["L03-price"];
    const f = figs(l03);
    expect(l03.status).toBe("ok");
    expect(f.house_median_price).toMatchObject({ value: null, chip: "Unknown", source_ids: ["vgv_medians"], as_of: "2026-03-31" });
    expect(f.house_median_price.note).toContain("no house median");
    expect(l03.figures[0].key).toBe("unit_median_price"); // the address's own kind comes first
  });

  it("a house address lists the house figures first, and the layers say plainly when the suburb has no rent", async () => {
    const layers = await report(db, "7 Smith Rd Carlton");
    expect(layers["L03-price"].figures[0].key).toBe("house_median_price");
    // Carlton's rents are published only for the group "Carlton-Parkville": not matched, so there is nothing to show.
    expect(layers["L02-rent"].status).toBe("gap");
    expect(layers["L02-rent"].message).toMatch(/larger area/);
    expect(layers["L02-rent"].figures[0]).toMatchObject({ key: "rent_3bed_house", value: null, chip: "Unknown" });
  });
});

describe("derive helpers", () => {
  it("cagr, change, yield and rank", () => {
    expect(cagr(100, 121, 2)).toBe(0.1);
    expect(cagr(0, 121, 2)).toBeNull();
    expect(cagr(100, null, 2)).toBeNull();
    expect(relativeChange(110, 100)).toBe(0.1);
    expect(relativeChange(100, 0)).toBeNull();
    expect(grossYield(80_000, 56_650_000)).toBe(0.0734);
    expect(grossYield(null, 1)).toBeNull();
    expect(rankAmong(5, [9, 5, 1])).toEqual({ position: 2, of: 3 });
    expect(rankAmong(5, [5, 5, 3])).toEqual({ position: 1, of: 3 }); // a tie shares the higher place
    expect(rankAmong(5, [5])).toBeNull();
    expect(rankAmong(null, [5, 6])).toBeNull();
  });
});

describe("suburb not matched", () => {
  it("an address with no sal_code gets a gap from every suburb layer", async () => {
    const layers = await report(db, "5 Odd Court Fakeville");
    expect(layers["L01-property"].status).toBe("ok");
    for (const id of SUBURB_LAYERS) {
      expect(layers[id].status, id).toBe("gap");
      expect(layers[id].message?.toLowerCase(), id).toContain("suburb not matched");
      expect(layers[id].figures, id).toEqual([]);
    }
  });
});

describe("no score, rating, forecast or prediction (AD-5, AD-10)", () => {
  const FORBIDDEN_KEY = /(^|_)(score|rating|forecast|prediction|predicted|composite|best)(_|$)/i;
  const FORBIDDEN_TEXT = /\b(forecast|predict\w*|best|rating|composite)\b/i;
  const keysOf = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.push(k), keysOf(x, out));
    return out;
  };
  const stringsOf = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => stringsOf(x, out));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => stringsOf(x, out));
    return out;
  };

  it.each(["310/628 Flinders St Docklands", "7 Smith Rd Carlton", "1 X Street Southbank"])("%s: keys, labels and notes carry none of those words", async (q) => {
    const layers = await report(db, q);
    for (const id of SUBURB_LAYERS) {
      const l = layers[id];
      for (const k of keysOf({ figures: l.figures, payload: l.payload })) expect(k, `${id} key ${k}`).not.toMatch(FORBIDDEN_KEY);
      for (const s of stringsOf(l)) expect(s, `${id} text`).not.toMatch(FORBIDDEN_TEXT);
    }
  });

  it("L09 never adds measures together: no figure is a sum or total of ranks", async () => {
    const l09 = (await report(db, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
    for (const f of l09.figures) {
      if (f.key.startsWith("rank_")) expect(f.value).toMatch(/^\d+ of \d+$/);
      expect(f.key).not.toMatch(/total|sum|overall/);
    }
  });
});

describe("layers are registered in the config the rights gate reads", () => {
  it("each layer's tier and sources match layer_config, and the coverage endpoint reports them live", async () => {
    const rows = await db.query<{ layer_id: string; tier: string; source_ids: string[] }>("SELECT layer_id, tier, source_ids FROM layer_config");
    const by = new Map(rows.map((r) => [r.layer_id, r]));
    for (const layer of [L02Rent, L03Price, L07History, L09SuburbCompare]) {
      expect(by.get(layer.layer_id)?.tier).toBe("free");
      expect([...by.get(layer.layer_id)!.source_ids].sort()).toEqual([...layer.source_ids].sort());
    }
    const body = await (await handleCoverage(() => db)).json();
    const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
    for (const id of SUBURB_LAYERS) expect(status[id], id).toBe("live");
  });
});

// The tests below change data, so each gets its own database.
describe("states that change the data", () => {
  async function withDb<T>(fn: (t: TestDb) => Promise<T>, omit: SuburbDataset[] = []): Promise<T> {
    const t = await createSuburbDataTestDb({ omit });
    try {
      return await fn(t.db);
    } finally {
      await t.close();
    }
  }

  it("thin data: under 10 sales or lettings keeps the figure, with the chip Estimated and a note saying few sales", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE series_price SET sales_count = 6, low_count = true WHERE sal_code = '20766' AND dwelling_type = 'unit' AND period_type = 'quarter' AND period = '2026-03-31'`);
      await t.query(`UPDATE series_rent SET lettings_count = 4, low_count = true WHERE sal_code = '20766' AND dwelling_type = 'unit' AND bedrooms = 2 AND period = '2026-06-30'`);
      const layers = await report(t, "310/628 Flinders St Docklands");
      const price = figs(layers["L03-price"]).unit_median_price;
      expect(price).toMatchObject({ value: 56_650_000, chip: "Estimated" });
      expect(price.note).toContain("Few sales");
      const rent = figs(layers["L02-rent"]).rent_2bed_flat;
      expect(rent).toMatchObject({ value: 80_000, chip: "Estimated" });
      expect(rent.note).toContain("Few lettings");
      expect(figs(layers["L02-rent"]).gross_yield.note).toContain("few sales or lettings");
      // The count itself is still an observed count.
      expect(figs(layers["L03-price"]).unit_sales_count).toMatchObject({ value: 6, chip: "Observed" });
    });
  });

  it("a carried-forward median is Estimated with the carried-forward note, in L03 and in an L07 growth rate", async () => {
    await withDb(async (t) => {
      await t.query(
        `UPDATE series_price SET carried_forward = true WHERE sal_code = '20766' AND dwelling_type = 'unit'
           AND ((period_type = 'quarter' AND period = '2026-03-31') OR (period_type = 'year' AND period = '2025-12-31'))`,
      );
      const layers = await report(t, "310/628 Flinders St Docklands");
      const price = figs(layers["L03-price"]).unit_median_price;
      expect(price.chip).toBe("Estimated");
      expect(price.note).toContain("carried an earlier median forward");
      const growth = figs(layers["L07-history"]).unit_price_cagr_5y;
      expect(growth.chip).toBe("Estimated");
      expect(growth.note).toContain("carried an earlier median forward");
      expect(growth.note).not.toContain("fewer than 10 sales"); // it had no sales at all, which is a different thing
      const series = (layers["L07-history"].payload.price_series as { unit: { year: number; low_count: boolean }[] }).unit;
      expect(series.find((p) => p.year === 2025)!.low_count).toBe(true);
    });
  });

  it("L07: with no published rent dataset the rent growth is one gap figure that says so", async () => {
    await withDb(async (t) => {
      const l07 = (await report(t, "310/628 Flinders St Docklands"))["L07-history"];
      expect(l07.status).toBe("ok");
      const f = figs(l07);
      expect(f.rent_growth).toMatchObject({ value: null, chip: "Unknown", source_ids: ["homes_victoria_rents"], note: "Homes Victoria rents are not loaded." });
      expect(f.rent_cagr_5y).toBeUndefined();
      expect(l07.figures.filter((x) => x.key.startsWith("rent_"))).toHaveLength(1);
    }, ["rents"]);
  });

  it("L09: more than 24 neighbours shows the first 24 and reports the true count", async () => {
    await withDb(async (t) => {
      const ver = (src: string) => `(SELECT dataset_version_id FROM src_dataset_current WHERE source_id = '${src}')`;
      for (let i = 1; i <= 30; i++) {
        const code = String(29100 + i);
        const name = `Testville ${String(i).padStart(2, "0")}`;
        await t.query(`INSERT INTO ref_suburb (dataset_version_id, sal_code, name, state) VALUES (${ver("abs_asgs_2021")}, $1, $2, 'VIC')`, [code, name]);
        await t.query(
          `INSERT INTO ref_suburb_neighbour (dataset_version_id, sal_code, neighbour_sal_code, sal_match_type, neighbour_match_type) VALUES (${ver("gnaf_neighbours")}, '20766', $1, 'exact', 'exact')`,
          [code],
        );
      }
      const l09 = (await report(t, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
      const real = 6; // the real G-NAF neighbours of Docklands in the excerpts
      expect(l09.status).toBe("ok");
      expect(l09.payload.neighbour_count).toBe(real + 30);
      expect(l09.payload.total_neighbours).toBe(real + 30);
      const f = figs(l09);
      expect(f.neighbour_count.value).toBe(real + 30);
      expect(f.neighbour_count.note).toContain("showing the first 24 of 36");
      // The 24 shown are the first 24 by name; the Testvilles have no figures, so they are left out of the table, not silently dropped.
      expect(l09.payload.left_out).toBeGreaterThan(0);
    });
  });

  it("L09: a SEIFA score the ABS flags q (small population) is Estimated, listed as thin, and noted", async () => {
    await withDb(async (t) => {
      const flag = (sal: string) =>
        t.query(
          `UPDATE fact_suburb_marker SET flag = 'q' WHERE sal_code = $1 AND marker_key = 'seifa_irsad'
             AND dataset_version_id = (SELECT dataset_version_id FROM src_dataset_current WHERE source_id = 'abs_seifa_2021')`,
          [sal],
        );
      await flag("20766");
      await flag("22315");
      const l09 = (await report(t, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
      const table = l09.payload.table as { columns: { key: string; chip: string; note?: string }[]; rows: { sal_code: string; thin: string[] }[] };
      const col = table.columns.find((c) => c.key === "seifa_irsad")!;
      expect(col.chip).toBe("Estimated");
      expect(col.note).toContain("small population");
      const thinOf = (sal: string) => table.rows.find((r) => r.sal_code === sal)!.thin;
      expect(thinOf("20766")).toContain("seifa_irsad");
      expect(thinOf("22315")).toContain("seifa_irsad");
      expect(thinOf("21640")).not.toContain("seifa_irsad"); // Melbourne is not flagged
    });
  });

  it("no neighbours: L09 returns a gap, not an error", async () => {
    await withDb(async (t) => {
      await t.query(`DELETE FROM ref_suburb_neighbour WHERE sal_code = '20766'`);
      const l09 = (await report(t, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
      expect(l09.status).toBe("gap");
      expect(l09.message).toContain("No adjacent suburbs");
    });
  });

  it("neighbours with no figures at all are left out of the table and counted", async () => {
    await withDb(async (t) => {
      // South Wharf (22313): take away its Census and SEIFA markers; it has no price or rent in the excerpts either.
      await t.query(`DELETE FROM fact_suburb_marker WHERE sal_code = '22313'`);
      const l09 = (await report(t, "310/628 Flinders St Docklands"))["L09-suburb-compare"];
      const table = l09.payload.table as { rows: { sal_code: string }[] };
      expect(table.rows.map((r) => r.sal_code)).not.toContain("22313");
      expect(l09.payload.left_out).toBe(1);
      expect(l09.payload.neighbour_count).toBe(table.rows.length); // subject + shown neighbours = neighbours + 1 - left out
      expect(figs(l09).neighbour_count.note).toContain("1 of them have no published figures");
    });
  });

  it("dataset missing: layers that read it are not_covered and never run; the others still answer", async () => {
    await withDb(async (t) => {
      const spies = [L03Price, L07History, L09SuburbCompare].map((l) => vi.spyOn(l, "run"));
      const layers = await report(t, "310/628 Flinders St Docklands");
      for (const id of ["L03-price", "L07-history", "L09-suburb-compare"]) {
        expect(layers[id].status, id).toBe("not_covered");
        expect(layers[id].message).toBe("Not available yet");
        expect(layers[id].figures).toEqual([]);
      }
      for (const s of spies) expect(s).not.toHaveBeenCalled();
      // L02 reads only the rents dataset; its yield says the price is missing rather than failing.
      expect(layers["L02-rent"].status).toBe("ok");
      expect(figs(layers["L02-rent"]).gross_yield).toMatchObject({ value: null, chip: "Unknown", note: "Valuer-General medians are not loaded." });
      vi.restoreAllMocks();
    }, ["vgv"]);
  });

  it("dataset missing: the coverage endpoint says not_covered for those layers", async () => {
    await withDb(async (t) => {
      const body = await (await handleCoverage(() => t)).json();
      const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
      expect(status["L09-suburb-compare"]).toBe("not_covered");
      expect(status["L02-rent"]).toBe("live");
    }, ["neighbours"]);
  });

  it("source not cleared: not_covered with the public text only, and the layer never runs", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'homes_victoria_rents'`);
      const spies = [L02Rent, L07History, L09SuburbCompare].map((l) => vi.spyOn(l, "run"));
      const layers = await report(t, "310/628 Flinders St Docklands");
      for (const id of ["L02-rent", "L07-history", "L09-suburb-compare"]) {
        expect(layers[id].status, id).toBe("not_covered");
        expect(layers[id].message).toBe("Not available yet");
        expect(JSON.stringify(layers[id])).not.toMatch(/homes_victoria|rights|pending|cleared/);
      }
      expect(layers["L03-price"].status).toBe("ok");
      for (const s of spies) expect(s).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });

  it("re-running a load flips the pointer and the report reads the new version", async () => {
    await withDb(async (t) => {
      const before = (await t.query<{ dataset_version_id: string }>(`SELECT dataset_version_id::text AS dataset_version_id FROM src_dataset_current WHERE source_id = 'vgv_medians'`))[0].dataset_version_id;
      // Copy the current rows to a new published version with a changed Docklands median: repositories must read the new one.
      const [v] = await t.query<{ id: string }>(
        `INSERT INTO src_dataset_version (source_id, retrieved_at, licence_snapshot, as_of, row_count, states, status)
         SELECT source_id, now(), licence_snapshot, as_of, row_count, states, 'published' FROM src_dataset_version WHERE dataset_version_id = $1 RETURNING dataset_version_id::text AS id`,
        [before],
      );
      await t.query(`INSERT INTO series_price (dataset_version_id, sal_code, dwelling_type, period_type, period, median_cents, sales_count, low_count, carried_forward, source_name, sal_match_type)
                     SELECT $2::bigint, sal_code, dwelling_type, period_type, period, median_cents, sales_count, low_count, carried_forward, source_name, sal_match_type FROM series_price WHERE dataset_version_id = $1`, [before, v.id]);
      await t.query(`UPDATE series_price SET median_cents = 60000000 WHERE dataset_version_id = $1 AND sal_code = '20766' AND dwelling_type = 'unit' AND period_type = 'quarter' AND period = '2026-03-31'`, [v.id]);
      expect(figs((await report(t, "310/628 Flinders St Docklands"))["L03-price"]).unit_median_price.value).toBe(56_650_000);
      await t.query(`UPDATE src_dataset_current SET dataset_version_id = $1 WHERE source_id = 'vgv_medians'`, [v.id]);
      expect(figs((await report(t, "310/628 Flinders St Docklands"))["L03-price"]).unit_median_price.value).toBe(60_000_000);
    });
  });
});

// Layers L16 Transport, L17 Schools, L11 Building, L08 Supply, L10 Screener and L14 Attribution, plus the new L13 questions, run end to
// end on real excerpts (GTFS stops, school zones and locations, City of Melbourne buildings and developments, Census, Valuer-General and
// Homes Victoria) loaded through the real pipelines into PGlite. One test per row of the spec's I/O matrix, plus the wording guard.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { handleCoverage } from "../http/handlers";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, fixtureStopsDir, type SuburbDataset, type TestDb } from "../testing/db";
import { COM_TEXTS, COM_TOWER } from "../../../pipeline/ingest/fixtures/com.mjs";
import { haversineMetres as comHaversine, parseSupply } from "../../../pipeline/ingest/com-buildings.mjs";
import { readExtract } from "../../../pipeline/ingest/gtfs-stops.mjs";
import { haversineMetres, pointInPolygon } from "../geo";
import { L08Supply, STAGES } from "./L08-supply";
import { L10Screener } from "./L10-screener";
import { L11Building, COM_ONLY_MESSAGE, NO_MATCH_MESSAGE, unitRange } from "./L11-building";
import { buildQuestions, L13Questions } from "./L13-questions";
import { ADAPTED_SOURCES, citedBy, L14Attribution } from "./L14-attribution";
import { L16Transport, pickMapStops, RINGS_M } from "./L16-transport";
import { isComCovered } from "../repos/building";
import { getRating } from "../repos/rating";
import { L17Schools, CONFIRM_NOTICE, NO_ZONE_LISTED, NO_ZONE_MESSAGE, PURCHASE_NOTICE, zoneYearNotice } from "./L17-schools";
const ZONE_YEAR_NOTICE = zoneYearNotice([2026]);
import { NO_COORDINATES_MESSAGE } from "./shared/location";
import { RATING_LABEL } from "./L15-conditions";

const NEW_LAYERS = ["L16-transport", "L17-schools", "L11-building", "L08-supply", "L10-screener", "L14-attribution"];
const DOCKLANDS_UNIT = "310/628 Flinders St Docklands";

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

/** A layer run directly with the address changed, for places the fixture addresses do not reach (no coordinates, outside the council). */
async function runWith(layer: { run: (ctx: any) => Promise<any> }, over: Partial<ResolvedAddress>, t: TestDb = db, query = DOCKLANDS_UNIT) {
  const address = { ...(await resolveQuery(t, query)), ...over };
  return layer.run({ db: t, address, request_id: "t" });
}
async function withDb<T>(fn: (t: TestDb) => Promise<T>, omit: SuburbDataset[] = []): Promise<T> {
  const t = await createSuburbDataTestDb({ omit });
  try {
    return await fn(t.db);
  } finally {
    await t.close();
  }
}

describe("a Docklands unit: every new section answers from real data", () => {
  it("L16, L17, L11, L08, L10 and L14 are ok and every figure has a chip, source ids and an as_of", async () => {
    const layers = await report(db, DOCKLANDS_UNIT);
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

  it("L16: the nearest stop of each mode and the counts within 400 m and 800 m agree with a recount from the extracted stops, as straight lines", async () => {
    const l16 = (await report(db, DOCKLANDS_UNIT))["L16-transport"];
    const f = figs(l16);
    const address = await resolveQuery(db, DOCKLANDS_UNIT);
    const { stops } = await readExtract(await fixtureStopsDir());
    for (const mode of ["train", "tram", "bus", "coach"]) {
      const d = stops.filter((s: any) => s.mode === mode).map((s: any) => comHaversine(address.lat!, address.lon!, s.lat, s.lon)).sort((a: number, b: number) => a - b);
      expect(f[`nearest_${mode}`].value, mode).toBe(Math.round(d[0]));
      expect(f[`nearest_${mode}`]).toMatchObject({ unit: "metres", chip: "Estimated", source_ids: ["gtfs_vic"], as_of: "2026-11-06" });
      expect(f[`${mode}_stops_within_800m`].value, mode).toBe(d.filter((x: number) => Math.round(x) <= 800).length);
      const counts = (l16.payload.counts as any)[mode];
      expect(counts.within_400, mode).toBe(d.filter((x: number) => Math.round(x) <= 400).length);
    }
    // Real excerpt: a tram stop 192 m away, four tram stops within 400 m; the nearest coach stop is past the 800 m ring, found by widening the search.
    expect(f.nearest_tram.value).toBe(192);
    expect((l16.payload.counts as any).tram).toEqual({ within_400: 4, within_800: 10 });
    expect(f.nearest_coach.value as number).toBeGreaterThan(800);
    expect(f.coach_stops_within_800m.value).toBe(0);
  });

  it("L16: every figure says straight line, there is no walk time anywhere, and each map point sits at its stated distance", async () => {
    const l16 = (await report(db, DOCKLANDS_UNIT))["L16-transport"];
    for (const fg of l16.figures.filter((x) => x.key.startsWith("nearest_"))) expect(fg.note, fg.key).toMatch(/[Ss]traight-line/);
    expect(JSON.stringify(l16)).not.toMatch(/walk(ing)? time|minutes? walk|isochrone/i);
    expect(l16.payload).toMatchObject({ straight_line: true, rings_m: [...RINGS_M] });
    const stops = l16.payload.stops as { east: number; north: number; distance_m: number; mode: string }[];
    expect(stops.length).toBeGreaterThan(5);
    for (const s of stops) {
      expect(Math.hypot(s.east, s.north), s.mode).toBeCloseTo(s.distance_m, -1);
      expect(s.distance_m).toBeLessThanOrEqual(800);
    }
  });

  it("L17: zoned for Docklands Primary and University High, each year level listed, with the 2026 zone year and the confirm and do-not-rely wording", async () => {
    const l17 = (await report(db, DOCKLANDS_UNIT))["L17-schools"];
    const f = figs(l17);
    expect(f.zone_year).toMatchObject({ value: 2026, unit: "year", chip: "Observed", source_ids: ["vic_school_zones_2026"] });
    expect(f.zoned_primary).toMatchObject({ value: "Docklands Primary School", chip: "Observed", as_of: "2026-11-14" });
    const secondary = l17.figures.filter((x) => x.key.startsWith("zoned_secondary"));
    expect(secondary.map((x) => x.label)).toEqual(["Zoned secondary school (Years 7 to 9, Year 10, Year 11, Year 12)"]);
    expect(secondary.every((x) => x.value === "University High School")).toBe(true);
    const notices = l17.payload.notices as string[];
    expect(notices).toEqual(expect.arrayContaining([ZONE_YEAR_NOTICE, CONFIRM_NOTICE, PURCHASE_NOTICE]));
    expect(notices.join(" ")).toContain("2026");
    expect(CONFIRM_NOTICE).toMatch(/not a guarantee of a place/);
    expect(CONFIRM_NOTICE).toMatch(/Confirm with the school or the Department/);
    expect(PURCHASE_NOTICE).toMatch(/should not be relied on for property purchase decisions/);
    // The zone school is joined to its location row, so its distance is shown.
    expect((l17.payload.zones as any[]).find((z) => z.school_name === "Docklands Primary School")).toMatchObject({ sector: "Government", school_type: "Primary", distance_m: 1363 });
  });

  it("L17: the nearest government and non-government schools, with distances, and whether the address is in each government zone", async () => {
    const l17 = (await report(db, DOCKLANDS_UNIT))["L17-schools"];
    const f = figs(l17);
    expect(f.nearest_government_primary.note).toContain("South Melbourne Primary School");
    expect(f.nearest_government_primary.note).toContain("not in this school's zone");
    expect(f.nearest_non_government_primary.note).toContain("Galilee Regional Catholic Primary School");
    expect(f.nearest_non_government_secondary.note).toContain("Simonds Catholic College");
    const groups = l17.payload.nearest as { key: string; schools: { name: string; distance_m: number; in_zone: boolean }[] }[];
    expect(groups.map((g) => g.key)).toEqual(["government_primary", "government_secondary", "non_government_primary", "non_government_secondary"]);
    const govPrimary = groups[0].schools;
    expect(govPrimary.map((s) => s.distance_m)).toEqual([...govPrimary.map((s) => s.distance_m)].sort((a, b) => a - b));
    expect(govPrimary.find((s) => s.name === "Docklands Primary School")?.in_zone).toBe(true);
  });

  it("L11: the G-NAF unit count as a range labelled Estimated, and the City of Melbourne facts with the match type", async () => {
    const l11 = (await report(db, DOCKLANDS_UNIT))["L11-building"];
    const f = figs(l11);
    // The fixture G-NAF tower has two unit addresses, so the range is 1 to 3.
    expect(unitRange(2)).toEqual({ low: 1, high: 3 });
    expect(f.apartments_in_building).toMatchObject({ value: "1 to 3", chip: "Estimated", source_ids: ["gnaf"], as_of: "2026-08-31" });
    expect(f.apartments_in_building.note).toContain("2 unit addresses");
    expect(f.year_built).toMatchObject({ value: 2018, unit: "year", chip: "Observed", source_ids: ["com_open_data"], as_of: "2026-11-14" });
    expect(f.floors_above_ground).toMatchObject({ value: 45, chip: "Observed" });
    expect(f.main_use).toMatchObject({ value: "Residential Apartment" });
    expect(f.council_dwelling_count.value as number).toBeGreaterThan(100);
    expect(f.building_match).toMatchObject({ value: "Same street number", chip: "Estimated" });
    expect(l11.payload).toMatchObject({ com: { property_id: COM_TOWER, match_type: "exact_street_number", census_year: 2024 }, unit_count: 2 });
  });

  it("L08: projects and dwellings within 1 km by stage equal an independent recount of the monitor rows", async () => {
    const l08 = (await report(db, DOCKLANDS_UNIT))["L08-supply"];
    const f = figs(l08);
    const address = await resolveQuery(db, DOCKLANDS_UNIT);
    const rows = parseSupply(COM_TEXTS.monitor).rows;
    for (const s of STAGES) {
      const near = rows.filter((r: any) => r.status === s.status && comHaversine(address.lat!, address.lon!, r.lat, r.lon) <= 1000);
      expect(f[`projects_${s.key}`].value, s.status).toBe(near.length);
      expect(f[`dwellings_${s.key}`].value, s.status).toBe(near.reduce((n: number, r: any) => n + r.resi_dwellings, 0));
      expect(f[`projects_${s.key}`]).toMatchObject({ unit: "count", chip: "Estimated", source_ids: ["com_open_data"], as_of: "2026-11-14" });
    }
    expect(f.projects_under_construction.value).toBe(5);
    expect(f.dwellings_under_construction.value).toBe(1331);
    expect(f.dwellings_in_pipeline.value).toBe((f.dwellings_under_construction.value as number) + (f.dwellings_approved.value as number) + (f.dwellings_applied.value as number));
    const listed = l08.payload.projects as { distance_m: number; status: string }[];
    expect(listed.length).toBeLessThanOrEqual(15);
    expect(listed.map((p) => p.distance_m)).toEqual([...listed.map((p) => p.distance_m)].sort((a, b) => a - b));
    expect(listed.every((p) => p.distance_m <= 1000 && p.status !== "COMPLETED")).toBe(true);
  });

  it("L10: nearby suburbs with price, rent and gross yield before costs, the subject first, the rest ordered by yield, and the rating where validated", async () => {
    const l10 = (await report(db, DOCKLANDS_UNIT))["L10-screener"];
    const table = l10.payload.table as { columns: { key: string }[]; rating_column: { label: string } | null; rows: { name: string; is_subject: boolean; hops: number; values: Record<string, number>; conditions?: { label: string } | null }[] };
    expect(table.rows[0]).toMatchObject({ name: "Docklands", is_subject: true, hops: 0 });
    expect(table.rows[0].values).toMatchObject({ price_cents: 56_650_000, rent_weekly_cents: 80_000 });
    const rest = table.rows.slice(1);
    expect(rest.length).toBeGreaterThanOrEqual(2);
    expect(rest.map((r) => r.values.gross_yield)).toEqual([...rest.map((r) => r.values.gross_yield)].sort((a, b) => b - a));
    expect(rest.map((r) => r.name)).toEqual(expect.arrayContaining(["Southbank", "St Kilda"]));
    expect(rest.find((r) => r.name === "St Kilda")!.hops).toBe(2);
    // Victorian unit suburbs are validated (AD-5), so the rating column is there, with its mandatory label.
    expect(table.rating_column?.label).toBe(RATING_LABEL);
    expect(table.rows.every((r) => r.conditions === null || typeof r.conditions?.label === "string")).toBe(true);
    expect(l10.payload.note).toMatch(/before rates, fees, insurance, vacancy and every other cost/);
    expect(l10.payload.note).toMatch(/groups several suburbs/);
    expect(figs(l10).nearby_suburbs.unit).toBe("count");
  });

  it("L14: every source the sections cited, once, with its attribution text, licence and dataset date; the own-data registry is not credited", async () => {
    const l14 = (await report(db, DOCKLANDS_UNIT))["L14-attribution"];
    const sources = l14.payload.sources as { source_id: string; name: string; licence: string; attribution_text: string; as_of: string | null; used_by: string[] }[];
    const ids = sources.map((s) => s.source_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["gnaf", "gtfs_vic", "vic_school_zones_2026", "vic_school_locations_2026", "com_open_data", "vgv_medians", "homes_victoria_rents", "abs_census_2021"]));
    expect(ids).not.toContain("vicprop_registry");
    for (const s of sources) {
      expect(s.attribution_text.length, s.source_id).toBeGreaterThan(10);
      expect(s.licence, s.source_id).toContain("CC BY");
      expect(s.used_by.length, s.source_id).toBeGreaterThan(0);
    }
    expect(sources.find((s) => s.source_id === "gtfs_vic")).toMatchObject({ as_of: "2026-11-06", used_by: ["L16-transport"] });
    expect(sources.find((s) => s.source_id === "com_open_data")!.used_by).toEqual(["L11-building", "L08-supply"]);
    expect(sources.find((s) => s.source_id === "vic_school_zones_2026")!.attribution_text).toContain("Department of Education");
  });

  it("L14 lists a source only when a section that ran cited it: a locked, not-covered or failed section credits nothing", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'gtfs_vic'`);
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers["L16-transport"].status).toBe("not_covered");
      const ids = (layers["L14-attribution"].payload.sources as { source_id: string }[]).map((s) => s.source_id);
      expect(ids).not.toContain("gtfs_vic");
      expect(ids).toContain("gnaf");
    });
  });

  it("citedBy credits a source only for an ok section with a non-null figure from it, and notes Estimated figures", () => {
    const fig = (key: string, value: number | null, chip: "Observed" | "Estimated" | "Unknown", source: string) => ({ key, label: key, value, chip, source_ids: [source], as_of: "2026-11-14" });
    const sec = (layer_id: string, status: LayerResult["status"], figures: LayerResult["figures"], payload: Record<string, unknown> = {}): LayerResult =>
      ({ layer_id, title: layer_id, tier: "free", status, coverage: { market_tier: "A", match_type: "unit" }, figures, payload, ...(status === "gap" ? { message: "m" } : {}) });
    const used = citedBy([
      sec("A", "ok", [fig("a", 1, "Observed", "s1"), fig("b", null, "Unknown", "s2")], { table: { source_ids: ["s3"] } }),
      sec("B", "gap", [fig("c", 2, "Observed", "s4")]),
      sec("C", "ok", [fig("d", 3, "Estimated", "s1")]),
    ]);
    expect([...used.keys()].sort()).toEqual(["s1"]);
    expect(used.get("s1")).toEqual({ layers: ["A", "C"], estimated: true });
    expect(ADAPTED_SOURCES.has("gtfs_vic")).toBe(true);
  });

  it("a section that is a gap, or whose only figure from a source is empty, does not credit it; each credit carries the licence link and whether VicProp adapted it", async () => {
    const layers = await report(db, "7 Smith Rd Carlton");
    expect(layers["L11-building"].status).toBe("gap");
    const sources = layers["L14-attribution"].payload.sources as { source_id: string; licence_url: string | null; adapted: boolean; used_by: string[] }[];
    const ids = sources.map((s) => s.source_id);
    expect(ids).not.toContain("com_open_data");
    for (const s of sources) if (s.source_id !== "gnaf") expect(s.licence_url, s.source_id).toBe("https://creativecommons.org/licenses/by/4.0/");
    const by = Object.fromEntries(sources.map((s) => [s.source_id, s]));
    expect(by.gtfs_vic.adapted).toBe(true);
    expect(by.vic_school_zones_2026.adapted).toBe(true);
    // Building facts from L11 ok-with-no-council-record credit only G-NAF, not the council.
    const out = await runWith(L11Building, { building_id: "GAVIC100000010", is_multi_unit: true, lat: -38.1, lon: 145.28 });
    expect(citedBy([{ layer_id: "L11-building", title: "t", tier: "free", status: "ok", coverage: { market_tier: "A", match_type: "unit" }, figures: out.figures, payload: {} }]).has("com_open_data")).toBe(false);
  });
});

describe("a house outside the City of Melbourne (Cranbourne North)", () => {
  // The fixture G-NAF has no Cranbourne North address, so a house is a fixture house moved there: no building under it, no suburb data
  // needed by the location layers.
  const CRANBOURNE = { lat: -38.1, lon: 145.28, building_id: "GAVIC100000030", is_multi_unit: false, match: "building" as const, unit_number: null };

  it("L08 is a gap that says the dataset covers the City of Melbourne only, and shows no number", async () => {
    const out = await runWith(L08Supply, CRANBOURNE, db, "7 Smith Rd Carlton");
    expect(out.status).toBe("gap");
    expect(out.message).toMatch(/covers the City of Melbourne only/);
    expect(out.figures).toEqual([]);
  });

  it("L11 is a gap when the address has no building, and says the dataset covers the City of Melbourne only", async () => {
    const out = await runWith(L11Building, CRANBOURNE, db, "7 Smith Rd Carlton");
    expect(out.status).toBe("gap");
    expect(out.message).toBe(COM_ONLY_MESSAGE);
    expect(out.figures).toEqual([]);
  });

  it("L11 is ok with only the G-NAF unit count (a range, Estimated) when the address has a building, and no building fact is invented", async () => {
    const out = await runWith(L11Building, { ...CRANBOURNE, building_id: "GAVIC100000010", is_multi_unit: true }, db, "7 Smith Rd Carlton");
    expect(out.status).toBe("ok");
    const f = Object.fromEntries(out.figures.map((x: any) => [x.key, x]));
    expect(f.apartments_in_building).toMatchObject({ chip: "Estimated", value: "2 to 4" });
    expect(unitRange(3)).toEqual({ low: 2, high: 4 });
    expect(unitRange(0)).toBeNull();
    expect(unitRange(-2)).toBeNull();
    expect(f.council_building_facts).toMatchObject({ value: null, chip: "Unknown" });
    expect(f.council_building_facts.note).toBe(COM_ONLY_MESSAGE);
    for (const k of ["year_built", "floors_above_ground", "main_use", "council_dwelling_count", "building_match"]) expect(f[k], k).toBeUndefined();
    expect(out.payload.com).toBeNull();
  });

  it("L16, L17, L10 and L14 are still ok for a real house in the fixture (Carlton): location needs no council data", async () => {
    const layers = await report(db, "7 Smith Rd Carlton");
    for (const id of ["L16-transport", "L17-schools", "L10-screener", "L14-attribution"]) expect(layers[id].status, `${id}: ${layers[id].message ?? ""}`).toBe("ok");
    // A house: no rating column in the screener (AD-5: validated for Victorian units only).
    expect((layers["L10-screener"].payload.table as any).rating_column).toBeNull();
    expect(JSON.stringify(layers["L10-screener"].payload)).not.toMatch(/"conditions"/);
  });
});

describe("inside the council area but no single building record matches", () => {
  it("L11 says no record could be matched, keeps the G-NAF count when there is one, and invents nothing", async () => {
    // The Docklands coordinates are inside the area the council data covers; this G-NAF building has no match.
    const out = await runWith(L11Building, { building_id: "GAVIC100000010", is_multi_unit: true });
    expect(out.status).toBe("ok");
    const f = Object.fromEntries(out.figures.map((x: any) => [x.key, x]));
    expect(f.council_building_facts.note).toBe(NO_MATCH_MESSAGE);
    expect(f.apartments_in_building.chip).toBe("Estimated");
    expect(out.payload.com).toBeNull();
    const gap = await runWith(L11Building, { building_id: "GAVIC100000030", is_multi_unit: false });
    expect(gap).toMatchObject({ status: "gap", message: NO_MATCH_MESSAGE });
  });

  it("a building the pipeline matched to a range record (G-NAF 628 inside City of Melbourne 614-644) is Estimated, not Observed", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE ref_com_building_match SET match_type = 'nearest_within_30m_same_street' WHERE gnaf_building_id = 'GAVIC100000001'`);
      const l11 = (await report(t, DOCKLANDS_UNIT))["L11-building"];
      const f = figs(l11);
      expect(f.year_built).toMatchObject({ value: 2018, chip: "Estimated" });
      expect(f.building_match.value).toBe("Inside the street-number range");
      expect(f.year_built.note).toContain("within 30 m");
    });
  });
});

describe("no coordinates", () => {
  it("L16, L17 and L08 are gaps that say the address has no coordinates", async () => {
    for (const layer of [L16Transport, L17Schools, L08Supply]) {
      const out = await runWith(layer, { lat: null, lon: null });
      expect(out, layer.layer_id).toMatchObject({ status: "gap", message: NO_COORDINATES_MESSAGE, figures: [] });
    }
    expect(NO_COORDINATES_MESSAGE).toBe("This address has no coordinates, so nothing nearby can be measured.");
  });
});

describe("school zones", () => {
  it("no zone contains the point: the section says only government neighbourhood schools have zones and the address may have none", async () => {
    const out = await runWith(L17Schools, { lat: -37.9, lon: 145.0 });
    expect(out.status).toBe("ok");
    const f = Object.fromEntries(out.figures.map((x: any) => [x.key, x]));
    expect(f.zoned_primary).toMatchObject({ value: null, chip: "Unknown" });
    expect(f.zoned_secondary.note).toBe(NO_ZONE_MESSAGE);
    expect(NO_ZONE_MESSAGE).toMatch(/Only government neighbourhood schools have zones/);
    expect(NO_ZONE_MESSAGE).toMatch(/may have none/);
    expect(out.payload.no_zone_message).toBe(NO_ZONE_MESSAGE);
    // The notices (zone year, confirm, do not rely) are still there.
    expect(out.payload.notices).toEqual(expect.arrayContaining([ZONE_YEAR_NOTICE, CONFIRM_NOTICE, PURCHASE_NOTICE]));
  });

  it("a point in two zones lists each, with its year level, and picks none", async () => {
    await withDb(async (t) => {
      await t.query(
        `INSERT INTO ref_school_zone (dataset_version_id, zone_id, school_name, level, year_levels, boundary_year, min_lat, max_lat, min_lon, max_lon, rings)
         SELECT dataset_version_id, 'P-OVERLAP', 'Overlap Primary School', 'primary', 'Prep to Year 6', 2026, -37.84, -37.80, 144.93, 144.97,
                '[[[144.93,-37.84],[144.97,-37.84],[144.97,-37.80],[144.93,-37.80],[144.93,-37.84]]]'::jsonb
         FROM src_dataset_current WHERE source_id = 'vic_school_zones_2026'`,
      );
      const l17 = (await report(t, DOCKLANDS_UNIT))["L17-schools"];
      const primary = l17.figures.filter((x) => x.key.startsWith("zoned_primary"));
      expect(primary.map((x) => x.value).sort()).toEqual(["Docklands Primary School", "Overlap Primary School"]);
      expect(primary.every((x) => x.label.includes("Prep to Year 6"))).toBe(true);
      expect(l17.payload.no_zone_message).toBeNull();
      // The overlap school has no row in the locations file: its name is kept and its distance is not shown.
      expect((l17.payload.zones as any[]).find((z) => z.school_name === "Overlap Primary School").distance_m).toBeNull();
    });
  });

  it("point in polygon: inside, outside and inside a hole", () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(pointInPolygon(5, 2, [square, hole])).toBe(true);
    expect(pointInPolygon(5, 5, [square, hole])).toBe(false);
    expect(pointInPolygon(11, 5, [square])).toBe(false);
    expect(haversineMetres(-37.82, 144.95, -37.82, 144.95)).toBe(0);
    expect(haversineMetres(-37.82, 144.95, -37.83, 144.95)).toBeCloseTo(1112, -1);
  });
});

describe("sources and datasets: AD-4 fails closed, AD-7 needs a published dataset", () => {
  it.each([
    ["gtfs_vic", "L16-transport"],
    ["vic_school_zones_2026", "L17-schools"],
    ["vic_school_locations_2026", "L17-schools"],
    ["com_open_data", "L11-building"],
    ["com_open_data", "L08-supply"],
    ["vicprop_registry", "L14-attribution"],
    ["conditions_rating", "L10-screener"],
  ])("%s set to pending: %s is not_covered with the public text only, and its code never runs", async (source, layerId) => {
    await withDb(async (t) => {
      await t.query(`UPDATE src_source SET rights_status = 'pending' WHERE source_id = '${source}'`);
      const { LAYERS } = await import(".");
      const layer = LAYERS.find((l) => l.layer_id === layerId)!;
      const spy = vi.spyOn(layer, "run");
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers[layerId].status).toBe("not_covered");
      expect(layers[layerId].message).toBe("Not available yet");
      expect(JSON.stringify(layers[layerId])).not.toMatch(/gtfs|com_open|vic_school|registry|pending|cleared/);
      expect(spy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });

  it.each([
    ["transit", ["L16-transport"]],
    ["schools", ["L17-schools"]],
    ["com", ["L11-building", "L08-supply"]],
  ] as [SuburbDataset, string[]][])("dataset %s not published: %j are not_covered and the report still renders", async (omit, ids) => {
    await withDb(async (t) => {
      const layers = await report(t, DOCKLANDS_UNIT);
      for (const id of ids) expect(layers[id].status, id).toBe("not_covered");
      expect(layers["L01-property"].status).toBe("ok");
      expect(layers["L14-attribution"].status).toBe("ok");
      const body = await (await handleCoverage(() => t)).json();
      const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
      for (const id of ids) expect(status[id], id).toBe("not_covered");
    }, [omit]);
  });

  it("the coverage endpoint reports all six new layers live", async () => {
    const body = await (await handleCoverage(() => db)).json();
    const status = Object.fromEntries(body.layers.map((l: { layer_id: string; status: string }) => [l.layer_id, l.status]));
    for (const id of NEW_LAYERS) expect(status[id], id).toBe("live");
  });

  it("a layer that throws is isolated: the others still answer", async () => {
    const spy = vi.spyOn(L16Transport, "run").mockRejectedValue(new Error("boom"));
    const layers = await report(db, DOCKLANDS_UNIT);
    spy.mockRestore();
    expect(layers["L16-transport"].status).toBe("error");
    expect(layers["L17-schools"].status).toBe("ok");
    expect(layers["L14-attribution"].status).toBe("ok");
  });
});

describe("wording guard: no school quality score, no forecast, no walk time", () => {
  const FORBIDDEN_TEXT = /\b(ICSEA|NAPLAN|VCE|NQS|forecast\w*|predict\w*|best|walk(ing)? time|isochrone)\b/i;
  const FORBIDDEN_KEY = /(^|_)(score|forecast|prediction|predicted|composite|best|icsea|naplan|quality|walk_time)(_|$)/i;
  // AD-5 makes one sentence mandatory beside the rating: it is a conditions rating, not a price forecast.
  const strip = (s: string) => s.replace(/conditions rating, not a price forecast/gi, "");

  it.each([DOCKLANDS_UNIT, "7 Smith Rd Carlton", "999/628 Flinders St Docklands", "5 Odd Court Fakeville"])("%s", async (q) => {
    const layers = await report(db, q);
    for (const id of NEW_LAYERS) {
      for (const s of strings(layers[id])) expect(strip(s), `${id}: ${s}`).not.toMatch(FORBIDDEN_TEXT);
      for (const k of keys({ figures: layers[id].figures, payload: layers[id].payload })) expect(k, `${id} key ${k}`).not.toMatch(FORBIDDEN_KEY);
    }
    // The school section never says "rating": it has no rating of a school.
    expect(strings(layers["L17-schools"]).join(" ")).not.toMatch(/\brating\b/i);
  });

  it("the wording guard itself catches the words it is meant to", () => {
    for (const bad of ["Top ICSEA schools", "NAPLAN results", "a price forecast", "we predict growth", "the best school", "a 12 minute walk time"]) expect(bad).toMatch(FORBIDDEN_TEXT);
  });
});

describe("L13 questions from the new sections", () => {
  const res = (layer_id: string, figures: LayerResult["figures"], payload: Record<string, unknown> = {}, status: LayerResult["status"] = "ok"): LayerResult => ({
    layer_id, title: layer_id, tier: "free", status, coverage: { market_tier: "A", match_type: "unit" }, figures, payload, ...(status === "gap" ? { message: "m" } : {}),
  });
  const fg = (key: string, value: number | string | null, chip: "Observed" | "Estimated" | "Unknown" = "Estimated", source = "gtfs_vic"): LayerResult["figures"][number] => ({ key, label: key, value, chip, source_ids: [source], as_of: "2026-11-14" });
  const prompted = (siblings: LayerResult[], family: "unit" | "house" = "unit") => buildQuestions(siblings, family).filter((q) => !q.standard);

  it("no zone found asks which school a child would attend, and names the 2026 zone trigger; a found zone does not", () => {
    const none = prompted([res("L17-schools", [fg("zoned_primary", null, "Unknown", "vic_school_zones_2026")], { zones: [] })]);
    expect(none.map((q) => q.id)).toEqual(["schools-no-zone"]);
    expect(none[0]).toMatchObject({ ask: "school or the Department of Education", standard: false });
    expect(none[0].trigger).toMatchObject({ layer_id: "L17-schools", chip: "Unknown", source_ids: ["vic_school_zones_2026"] });
    expect(none[0].trigger!.text).toMatch(/No government school zone/);
    expect(prompted([res("L17-schools", [fg("zoned_primary", "Docklands Primary School", "Observed")], { zones: [{ school_name: "Docklands Primary School" }] })])).toEqual([]);
    // A section that did not run prompts nothing.
    expect(prompted([res("L17-schools", [], {}, "not_covered")])).toEqual([]);
  });

  it("no stop within 800 m asks about getting to a stop; one stop within 800 m does not", () => {
    const far = { counts: { train: { within_400: 0, within_800: 0 }, tram: { within_400: 0, within_800: 0 }, bus: { within_400: 0, within_800: 0 }, coach: { within_400: 0, within_800: 0 } } };
    const q = prompted([res("L16-transport", [fg("nearest_train", 3200)], far)]);
    expect(q.map((x) => x.id)).toEqual(["transport-far"]);
    expect(q[0].trigger).toMatchObject({ layer_id: "L16-transport", figure_key: "nearest_train", source_ids: ["gtfs_vic"] });
    const near = { counts: { ...far.counts, tram: { within_400: 1, within_800: 3 } } };
    expect(prompted([res("L16-transport", [], near)])).toEqual([]);
  });

  it("the building year from the City of Melbourne record asks about works, of the owners corporation for a unit and an inspector for a house", () => {
    const sib = [res("L11-building", [fg("year_built", 2018, "Observed", "com_open_data")])];
    const unit = prompted(sib, "unit");
    expect(unit.map((x) => x.id)).toEqual(["building-age"]);
    expect(unit[0]).toMatchObject({ ask: "owners corporation" });
    expect(unit[0].trigger).toMatchObject({ layer_id: "L11-building", chip: "Observed", source_ids: ["com_open_data"] });
    expect(unit[0].trigger!.text).toContain("2018");
    expect(prompted(sib, "house")[0].ask).toBe("building inspector");
    // The chip and date come from the L11 figure it reads: a range-matched record is Estimated, so the trigger is too.
    const ranged = prompted([res("L11-building", [{ key: "year_built", label: "Year built", value: 1998, chip: "Estimated", source_ids: ["com_open_data"], as_of: "2026-11-14" }])]);
    expect(ranged[0].trigger).toMatchObject({ chip: "Estimated", as_of: "2026-11-14", figure_key: "year_built" });
    expect(prompted([res("L11-building", [], {}, "gap")])).toEqual([]);
  });

  it("projects under construction nearby ask about them; none under construction does not", () => {
    const yes = prompted([res("L08-supply", [fg("projects_under_construction", 5, "Estimated", "com_open_data"), fg("dwellings_under_construction", 1331, "Estimated", "com_open_data")])]);
    // Projects that add no dwellings (an office, a hotel) do not prompt an apartment question.
    expect(prompted([res("L08-supply", [fg("projects_under_construction", 3, "Estimated", "com_open_data"), fg("dwellings_under_construction", 0, "Estimated", "com_open_data")])])).toEqual([]);
    expect(yes.map((x) => x.id)).toEqual(["supply-under-construction"]);
    expect(yes[0].trigger!.text).toMatch(/1331 dwellings are under construction within 1 km/);
    expect(yes[0].trigger!.figure_key).toBe("dwellings_under_construction");
    expect(yes[0].why).toContain("1331 dwellings");
    expect(prompted([res("L08-supply", [fg("dwellings_under_construction", 0, "Estimated", "com_open_data")])])).toEqual([]);
    expect(prompted([res("L08-supply", [], {}, "gap")])).toEqual([]);
  });

  it("the Docklands report prompts the building and supply questions (and not the school or transport ones)", async () => {
    const l13 = (await report(db, DOCKLANDS_UNIT))["L13-questions"];
    const ids = (l13.payload.questions as { id: string; standard: boolean }[]).filter((q) => !q.standard).map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(["building-age", "supply-under-construction"]));
    expect(ids).not.toContain("schools-no-zone");
    expect(ids).not.toContain("transport-far");
  });

  it("a report with no zone and no stop close by prompts both, each naming its trigger; L13's sources include the new ones", async () => {
    const l13 = (await report(db, "5 Odd Court Fakeville"))["L13-questions"];
    const qs = (l13.payload.questions as { id: string; standard: boolean; trigger: { text: string } | null }[]).filter((q) => !q.standard);
    expect(qs.map((q) => q.id)).toEqual(["schools-no-zone", "transport-far"]);
    expect(qs.every((q) => q.trigger && q.trigger.text.length > 10)).toBe(true);
    expect(L13Questions.source_ids).toEqual(expect.arrayContaining(["gtfs_vic", "vic_school_zones_2026", "com_open_data"]));
  });
});

describe("L10 and L14 details", () => {
  it("L10 for an address with no suburb is a gap that says so; a suburb with no neighbours is a gap", async () => {
    const out = await runWith(L10Screener, { sal_code: null, sal_name: null });
    expect(out.status).toBe("gap");
    expect(out.message).toMatch(/Suburb not matched/);
  });

  it("L10 switches the rating column off when market_validation says not validated (AD-5)", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE market_validation SET status = 'not_validated' WHERE state = 'VIC' AND dwelling_type = 'unit'`);
      const l10 = (await report(t, DOCKLANDS_UNIT))["L10-screener"];
      expect((l10.payload.table as any).rating_column).toBeNull();
      expect(JSON.stringify(l10.payload)).not.toMatch(/"fifth"|Fourth fifth|Top fifth/);
    });
  });

  it("L14 with nothing cited is a gap that says so", async () => {
    const out = await L14Attribution.run({ db, address: await resolveQuery(db, DOCKLANDS_UNIT), request_id: "t", siblings: [] });
    expect(out.status).toBe("gap");
    expect(out.message).toMatch(/nothing to list/);
  });
});

describe("council coverage is judged by the data, not a box around every record", () => {
  it("a point inside the old bounding box of all records but with no council building within 400 m is not covered: L08 and L11 give the gap, never '0 projects'", async () => {
    const [ext] = await db.query<{ min_lat: number; min_lon: number }>(
      `SELECT min(b.lat)::float8 AS min_lat, min(b.lon)::float8 AS min_lon FROM ref_com_building b JOIN src_dataset_current c ON c.source_id = 'com_open_data' AND c.dataset_version_id = b.dataset_version_id`,
    );
    // Every building is at least min_lat and min_lon, so a point 0.0029 degrees below and left of both is at least ~410 m from all of them,
    // yet it is inside the old box (the box added 0.003 degrees all round).
    const lat = ext.min_lat - 0.0029;
    const lon = ext.min_lon - 0.0029;
    const all = await db.query<{ lat: number; lon: number }>(`SELECT b.lat::float8 AS lat, b.lon::float8 AS lon FROM ref_com_building b JOIN src_dataset_current c ON c.source_id = 'com_open_data' AND c.dataset_version_id = b.dataset_version_id`);
    expect(Math.min(...all.map((b) => haversineMetres(lat, lon, b.lat, b.lon)))).toBeGreaterThan(400);
    expect(await isComCovered(db, lat, lon)).toBe(false);
    expect(await isComCovered(db, -37.823, 144.949)).toBe(true);
    const supply = await runWith(L08Supply, { lat, lon });
    expect(supply).toMatchObject({ status: "gap", figures: [] });
    expect(supply.message).toMatch(/covers the City of Melbourne only/);
    const building = await runWith(L11Building, { lat, lon, building_id: "GAVIC100000030", is_multi_unit: false });
    expect(building).toMatchObject({ status: "gap", message: COM_ONLY_MESSAGE });
  });
});

describe("transport map stops", () => {
  it("each mode's nearest stop is always drawn, then the rest by distance up to the cap", () => {
    const stops = [
      ...Array.from({ length: 70 }, (_, i) => ({ mode: "bus", distance_m: 10 + i, name: `bus ${i}` })),
      { mode: "tram", distance_m: 700, name: "far tram" },
      { mode: "train", distance_m: 790, name: "far train" },
    ];
    const picked = pickMapStops(stops, 60);
    expect(picked).toHaveLength(60);
    expect(picked.map((s) => s.name)).toEqual(expect.arrayContaining(["far tram", "far train", "bus 0"]));
    expect(picked.map((s) => s.distance_m)).toEqual([...picked.map((s) => s.distance_m)].sort((a, b) => a - b));
    // Fewer stops than the cap: all of them.
    expect(pickMapStops(stops.slice(0, 5), 60)).toHaveLength(5);
  });
});

describe("school zone year and the not-in-zone wording come from the data", () => {
  it("the zone year is the boundary year of the loaded zones: change it and the figure and notice change; mixed years are all listed", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE ref_school_zone SET boundary_year = 2027`);
      const one = (await report(t, DOCKLANDS_UNIT))["L17-schools"];
      expect(figs(one).zone_year).toMatchObject({ value: 2027, unit: "year" });
      expect((one.payload.notices as string[])[0]).toBe("These are the 2027 school zones. Zones are set again each year.");
      expect(one.payload).toMatchObject({ zone_year: 2027, zone_years: [2027] });
      await t.query(`UPDATE ref_school_zone SET boundary_year = 2026 WHERE level = 'primary'`);
      const mixed = (await report(t, DOCKLANDS_UNIT))["L17-schools"];
      expect(figs(mixed).zone_year).toMatchObject({ value: "2026 and 2027", label: "School zone years" });
      expect(figs(mixed).zone_year.unit).toBeUndefined();
      expect((mixed.payload.notices as string[])[0]).toContain("2026 and 2027");
      expect(mixed.payload.zone_year).toBeNull();
    });
  });

  it("'not in this school's zone' is said only for a school that has a zone in the data; a school with none says no zone is listed", async () => {
    const l17 = (await report(db, DOCKLANDS_UNIT))["L17-schools"];
    const f = figs(l17);
    // South Melbourne Primary has a zone in the data; the Victorian College of the Arts Secondary School (selective) has none.
    expect(f.nearest_government_primary.note).toContain("The address is not in this school's zone.");
    expect(f.nearest_government_secondary.note).toContain("Victorian College Of The Arts");
    expect(f.nearest_government_secondary.note).toContain(NO_ZONE_LISTED);
    expect(f.nearest_government_secondary.note).not.toContain("not in this school's zone");
    const groups = l17.payload.nearest as { key: string; schools: { name: string; has_zone: boolean | null }[] }[];
    expect(groups[1].schools.find((s) => s.name.startsWith("Victorian College"))!.has_zone).toBe(false);
    expect(groups[0].schools.find((s) => s.name === "South Melbourne Primary School")!.has_zone).toBe(true);
    expect(groups[2].schools.every((s) => s.has_zone === null)).toBe(true);
  });
});

describe("L10 screener: ratings, thin samples and ordering", () => {
  it("a nearby suburb's fifth, position and total equal the rating repository's", async () => {
    const l10 = (await report(db, DOCKLANDS_UNIT))["L10-screener"];
    const rows = (l10.payload.table as { rows: { sal_code: string; conditions?: { fifth: number; label: string; position: number; of: number } | null; is_subject: boolean }[] }).rows;
    const rated = rows.filter((r) => !r.is_subject && r.conditions);
    expect(rated.length).toBeGreaterThanOrEqual(1);
    for (const r of rated) {
      expect(r.conditions!.fifth).toBeGreaterThanOrEqual(1);
      expect(r.conditions!.fifth).toBeLessThanOrEqual(5);
      const direct = await getRating(db, r.sal_code, "unit");
      expect(r.conditions).toMatchObject({ fifth: direct.rating!.fifth, position: direct.rating!.position, of: direct.rating!.of });
    }
  });

  it("a suburb resting on few sales is flagged on the cells it affects, and comes after the solid ones even with a higher yield", async () => {
    await withDb(async (t) => {
      // Southbank has a higher yield than St Kilda; make it thin, so solid-first ordering puts it last.
      await t.query(`UPDATE series_price SET sales_count = 4, low_count = true WHERE sal_code = '22315' AND dwelling_type = 'unit' AND period_type = 'quarter' AND period = '2026-03-31'`);
      const l10 = (await report(t, DOCKLANDS_UNIT))["L10-screener"];
      const rows = (l10.payload.table as { rows: { name: string; is_subject: boolean; thin: string[]; values: { gross_yield: number } }[] }).rows;
      const others = rows.filter((r) => !r.is_subject);
      const southbank = others.find((r) => r.name === "Southbank")!;
      expect(southbank.thin).toEqual(expect.arrayContaining(["price_cents", "gross_yield"]));
      expect(southbank.thin).not.toContain("rent_weekly_cents");
      expect(others.filter((r) => r.name !== "Southbank").every((r) => r.thin.length === 0)).toBe(true);
      expect(others.at(-1)!.name).toBe("Southbank");
      const solidYields = others.filter((r) => r.thin.length === 0).map((r) => r.values.gross_yield);
      expect(solidYields).toEqual([...solidYields].sort((a, b) => b - a));
      expect(southbank.values.gross_yield).toBeGreaterThan(Math.min(...solidYields));
      expect(l10.payload.note).toMatch(/few sales or lettings \(marked \*\) come after the others/);
    });
  });

  it("every suburb within two boundaries is screened, not a cut-down list", async () => {
    const l10 = (await report(db, DOCKLANDS_UNIT))["L10-screener"];
    expect(figs(l10).nearby_suburbs.note).not.toMatch(/Only the first/);
  });
});

describe("L11 dwelling count", () => {
  it("a building with no dwellings count from its own census year shows no dwelling figure at all", async () => {
    await withDb(async (t) => {
      await t.query(`UPDATE ref_com_building SET dwelling_count = NULL WHERE property_id = '${COM_TOWER}'`);
      const l11 = (await report(t, DOCKLANDS_UNIT))["L11-building"];
      expect(l11.status).toBe("ok");
      expect(figs(l11).council_dwelling_count).toBeUndefined();
      expect(figs(l11).year_built.value).toBe(2018);
    });
  });
});

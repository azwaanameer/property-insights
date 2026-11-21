// L18 Recorded crime (layer id L18-safety), run end to end on a real excerpt of the Crime Statistics Agency workbook loaded through the real
// extractor and loader into PGlite (fixtures/crime.mjs). One test per row of the spec's I/O matrix, plus the wording guard and the L14 credit.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { handleCoverage } from "../http/handlers";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, type SuburbDataset, type TestDb } from "../testing/db";
import { crimeFixtureDir } from "../../../pipeline/ingest/fixtures/crime.mjs";
import { readExtract } from "../../../pipeline/ingest/crime.mjs";
import { DIVISIONS, L18Safety, NOT_LOADED_MESSAGE, NO_POSTCODE_MESSAGE, SCOPE_NOTES, noLatestMessage, noSuburbMessage, pickNotices, titleCase } from "./L18-safety";
import { suburbKey } from "./shared/suburb-key";

const DOCKLANDS_UNIT = "310/628 Flinders St Docklands";
const TWO_COUNCILS = "100 St Kilda Road Melbourne"; // Melbourne 3004: the agency lists it under Melbourne and Port Phillip
const NOT_IN_FILE = "5 Odd Court Fakeville";

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
let extract: Awaited<ReturnType<typeof readExtract>>;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
  extract = await readExtract(await crimeFixtureDir());
});
afterAll(() => close());

async function runWith(over: Partial<ResolvedAddress>, t: TestDb = db, query = DOCKLANDS_UNIT) {
  const address = { ...(await resolveQuery(t, query)), ...over };
  return L18Safety.run({ db: t, address, request_id: "t" });
}
async function withDb<T>(fn: (t: TestDb) => Promise<T>, omit: SuburbDataset[] = []): Promise<T> {
  const t = await createSuburbDataTestDb({ omit });
  try {
    return await fn(t.db);
  } finally {
    await t.close();
  }
}

/** The agency's rows read straight from the extract, added up independently of the layer. */
const sumWhere = (pred: (r: (typeof extract.suburb)[number]) => boolean) => extract.suburb.filter(pred).reduce((n, r) => n + (r[6] as number), 0);

describe("a Docklands unit: one council area", () => {
  let l18: LayerResult;
  beforeAll(async () => {
    l18 = (await report(db, DOCKLANDS_UNIT))["L18-safety"];
  });

  it("is an ok free section and every figure has a chip, source ids and an as_of", () => {
    expect(l18.status, l18.message ?? "").toBe("ok");
    expect(l18.tier).toBe("free");
    for (const f of l18.figures) {
      expect(f.chip, f.key).toMatch(/^(Observed|Estimated|Unknown|Conflict)$/);
      expect(f.source_ids, f.key).toEqual(["csa_crime_incidents"]);
      expect(f.as_of, f.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the suburb total and one figure per division are the file's counts for Docklands 3008, year ending June 2026, and are Estimated because they are added up", () => {
    const f = figs(l18);
    const total = sumWhere((r) => r[0] === 2026 && r[2] === "3008" && r[3] === "Docklands");
    expect(total).toBe(3058);
    expect(f.suburb_total).toMatchObject({ value: 3058, unit: "count", chip: "Estimated", source_ids: ["csa_crime_incidents"] });
    expect(f.suburb_total.label).toContain("Docklands");
    expect(f.suburb_total.label).toContain("year ending June 2026");
    let divisionSum = 0;
    for (const letter of Object.keys(DIVISIONS)) {
      const want = sumWhere((r) => r[0] === 2026 && r[2] === "3008" && r[3] === "Docklands" && String(r[4]).startsWith(`${letter} `));
      expect(f[`division_${letter.toLowerCase()}`], letter).toMatchObject({ value: want, chip: "Estimated" });
      divisionSum += want;
    }
    expect(divisionSum).toBe(3058);
    expect(Object.keys(f).filter((k) => k.startsWith("division_"))).toHaveLength(6);
  });

  it("the change on the previous year is Estimated and equals (2026 - 2025) / 2025 from the file's counts", () => {
    const prev = sumWhere((r) => r[0] === 2025 && r[2] === "3008" && r[3] === "Docklands");
    const f = figs(l18).change_on_previous_year;
    expect(f).toMatchObject({ unit: "fraction", chip: "Estimated" });
    expect(f.value).toBeCloseTo((3058 - prev) / prev, 10);
    expect(f.note).toContain(`3058 recorded in the year ending June 2026, compared with ${prev} in the year ending June 2025`);
    expect(f.note).toMatch(/subject to movement between releases/);
  });

  it("the council area rate is Observed as published (City of Melbourne 16,944), and the Victorian rate is Estimated from the council rows with a matching top and bottom", () => {
    const f = figs(l18);
    expect(f.council_rate).toMatchObject({ value: 16944.407485256, unit: "per_100k", chip: "Observed" });
    expect(f.council_rate.label).toContain("Melbourne council area");
    expect(f.council_rate.note).toContain("33,128 incidents recorded in the whole Melbourne council area");
    expect(f.council_rate.note).toMatch(/not the suburb/);
    // Worked out here from the Table 01 rows of the four councils in the excerpt, independently of the SQL.
    const councils = extract.lga.filter((r) => r.year === 2026 && !r.is_total && r.rate_per_100k !== null);
    expect(councils).toHaveLength(4);
    const incidents = councils.reduce((n, r) => n + r.incidents, 0);
    const population = councils.reduce((n, r) => n + (r.incidents * 100000) / (r.rate_per_100k as number), 0);
    expect(f.victoria_rate).toMatchObject({ unit: "per_100k", chip: "Estimated" });
    expect(f.victoria_rate.value as number).toBeCloseTo((incidents / population) * 100000, 6);
    expect(f.victoria_rate.note).toContain("all 4 council areas combined, excluding incidents with unknown location");
    // The region Total rows (which carry a rate too) are not in the sum: with them the rate would be a different number.
    const withTotals = extract.lga.filter((r) => r.year === 2026 && r.rate_per_100k !== null);
    const wrong = withTotals.reduce((n, r) => n + r.incidents, 0) / withTotals.reduce((n, r) => n + (r.incidents * 100000) / (r.rate_per_100k as number), 0) / 1e-5;
    expect(Math.abs(wrong - (f.victoria_rate.value as number))).toBeGreaterThan(1);
    // No suburb rate is ever shown.
    expect(Object.keys(f).filter((k) => /suburb.*rate|rate.*suburb/.test(k))).toEqual([]);
  });

  it("the payload has the offence table, the five-year totals and the councils, with counts as in the file", () => {
    const p = l18.payload as any;
    expect(p.suburb).toEqual({ name: "Docklands", postcode: "3008" });
    expect(p.year_ending).toBe(2026);
    expect(p.previous_year).toBe(2025);
    expect(p.series.map((r: any) => r.year_ending)).toEqual([2022, 2023, 2024, 2025, 2026]);
    for (const r of p.series) expect(r.total, String(r.year_ending)).toBe(sumWhere((x) => x[0] === r.year_ending && x[2] === "3008" && x[3] === "Docklands"));
    const assault = p.table.find((r: any) => r.subdivision === "A20 Assault and related offences");
    expect(assault).toMatchObject({ division_key: "A", latest: sumWhere((r) => r[0] === 2026 && r[3] === "Docklands" && r[5] === "A20 Assault and related offences") });
    expect(assault.previous).toBe(sumWhere((r) => r[0] === 2025 && r[3] === "Docklands" && r[5] === "A20 Assault and related offences"));
    expect(p.table.reduce((n: number, r: any) => n + r.latest, 0)).toBe(3058);
    expect(p.councils).toEqual([{ lga: "Melbourne", police_region: "1 North West Metro", incidents: 33128, rate_per_100k: 16944.407485256 }]);
    expect(p.victoria).toMatchObject({ council_areas: 4 });
  });

  it("carries the agency's notices verbatim, including the small-count rule for homicide and sexual offences and the population estimate note", () => {
    const p = l18.payload as any;
    const texts = p.notices.map((n: any) => n.text);
    const published = new Set(extract.notes.map((n: any) => n.text));
    for (const t of texts) expect(published.has(t), t).toBe(true);
    expect(texts).toContain("In order to maintain confidentiality, sensitive offence counts for subdivisions 'A10 Homicide and related offences' and 'A30 Sexual offences' with a value of 3 or less are given a value of 2 to calculate totals.");
    expect(texts.some((t: string) => t.includes("Victoria in Futures"))).toBe(true);
    expect(texts.some((t: string) => t.includes("Other crimes against the person includes A10 Homicide"))).toBe(true);
    expect(texts.some((t: string) => t.includes("subject to movement between releases"))).toBe(true);
    // The licence line is credited in the sources, not repeated here; no notice is shown twice.
    expect(texts.some((t: string) => t.includes("Creative Commons"))).toBe(false);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("the payload names no score, rank, label or colour", () => {
    expect(keys(l18.payload).filter((k) => /score|rank|label_|verdict|colou?r|level|rating/i.test(k))).toEqual([]);
  });
});

describe("a suburb in two council areas", () => {
  it("adds the suburb counts together and gives one named council rate for each", async () => {
    const l18 = (await report(db, TWO_COUNCILS))["L18-safety"];
    expect(l18.status, l18.message ?? "").toBe("ok");
    const f = figs(l18);
    const total = sumWhere((r) => r[0] === 2026 && r[2] === "3004" && r[3] === "Melbourne");
    expect(sumWhere((r) => r[0] === 2026 && r[2] === "3004" && r[3] === "Melbourne" && r[1] === "Port Phillip")).toBeGreaterThan(0);
    expect(f.suburb_total.value).toBe(total);
    expect(f.suburb_total.note).toContain("The suburb lies in 2 council areas (Melbourne and Port Phillip); the counts are added together.");
    expect(f.council_rate_1).toMatchObject({ value: 16944.407485256, chip: "Observed" });
    expect(f.council_rate_1.label).toContain("Melbourne council area");
    expect(f.council_rate_2).toMatchObject({ value: 10984.331690204, chip: "Observed" });
    expect(f.council_rate_2.label).toContain("Port Phillip council area");
    expect(f.council_rate).toBeUndefined();
    expect((l18.payload as any).councils.map((c: any) => c.lga)).toEqual(["Melbourne", "Port Phillip"]);
  });
});

describe("gaps: honest, with no figure", () => {
  it("a suburb that is not in the file is a gap that names the agency's geography and shows nothing", async () => {
    const layers = await report(db, NOT_IN_FILE);
    const l18 = layers["L18-safety"];
    expect(l18.status).toBe("gap");
    expect(l18.message).toBe(noSuburbMessage("Fakeville", "3999"));
    expect(l18.message).toContain("Crime Statistics Agency");
    expect(l18.message).toContain("suburb or town");
    expect(l18.message).toContain("postcode 3999");
    expect(l18.figures).toEqual([]);
    expect(l18.payload).toEqual({});
  });

  it("matching needs the name AND the postcode: Docklands with another postcode, and another suburb with Docklands' postcode, are gaps, not guesses", async () => {
    expect((await runWith({ postcode: "3000" })).status).toBe("gap");
    expect((await runWith({ locality: "Fakeville", postcode: "3008" })).status).toBe("gap");
    // The key is the normalised name: case and punctuation do not matter.
    expect((await runWith({ locality: "DOCKLANDS" })).status).toBe("ok");
    expect((await runWith({ locality: "Dock.lands" })).status).toBe("ok");
    expect(suburbKey("St Kilda East")).toBe("st kilda east");
    expect(titleCase("ST KILDA EAST")).toBe("St Kilda East");
  });

  it("an address with no postcode is a gap that says a postcode is needed", async () => {
    const out = await runWith({ postcode: null });
    expect(out).toMatchObject({ status: "gap", figures: [], message: NO_POSTCODE_MESSAGE });
    expect(out.message).toMatch(/postcode is needed/);
  });

  it("a suburb listed in earlier years but not in the latest year shows no counts, and says which year", async () => {
    const out = await runWith({ locality: "WINDSOR", postcode: "3004" });
    expect(out.status).toBe("gap");
    expect(out.message).toBe(noLatestMessage("Windsor", "3004", 2026));
    expect(out.figures).toEqual([]);
  });

  it("no published dataset: the section is the gap 'Crime statistics are not loaded.' and the rest of the report still renders", async () => {
    await withDb(async (t) => {
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers["L18-safety"]).toMatchObject({ status: "gap", message: "Crime statistics are not loaded.", figures: [] });
      expect(NOT_LOADED_MESSAGE).toBe("Crime statistics are not loaded.");
      expect(layers["L01-property"].status).toBe("ok");
      expect(layers["L14-attribution"].status).toBe("ok");
      expect((layers["L14-attribution"].payload as any).sources.map((s: any) => s.source_id)).not.toContain("csa_crime_incidents");
    }, ["crime"]);
  });

  it("a year with no counts for the suburb is 'none listed', not zero, and a missing previous year gives a gap figure and no previous column", async () => {
    await withDb(async (t) => {
      await t.query("DELETE FROM fact_crime_suburb WHERE suburb_key = 'docklands' AND year_ending IN (2025, 2023)");
      const l18 = (await report(t, DOCKLANDS_UNIT))["L18-safety"];
      expect(l18.status).toBe("ok");
      const p = l18.payload as any;
      expect(p.previous_year).toBeNull();
      expect(p.series.find((r: any) => r.year_ending === 2025).total).toBeNull();
      expect(p.series.find((r: any) => r.year_ending === 2023).total).toBeNull();
      expect(p.series.find((r: any) => r.year_ending === 2026).total).toBe(3058);
      expect(p.table.every((r: any) => r.previous === null)).toBe(true);
      expect(figs(l18).change_on_previous_year).toMatchObject({ value: null, chip: "Unknown" });
      expect(figs(l18).change_on_previous_year.note).toMatch(/lists no incidents for this suburb in the year ending June 2025/);
    });
  });

  it("a council area with no rate row gives a gap figure for the rate, never an invented one", async () => {
    await withDb(async (t) => {
      await t.query("UPDATE fact_crime_lga SET rate_per_100k = NULL WHERE lga = 'Melbourne' AND year_ending = 2026");
      const f = figs((await report(t, DOCKLANDS_UNIT))["L18-safety"]);
      expect(f.council_rate).toMatchObject({ value: null, chip: "Unknown" });
      expect(f.victoria_rate.value).not.toBeNull();
    });
  });
});

describe("small counts", () => {
  it("are shown as published, with the agency's rule that homicide and sexual-offence counts of 3 or less are recorded as 2 in totals", async () => {
    const l18 = (await report(db, DOCKLANDS_UNIT))["L18-safety"];
    const texts = (l18.payload as any).notices.map((n: any) => n.text) as string[];
    expect(texts.some((t) => /counts for subdivisions 'A10 Homicide and related offences' and 'A30 Sexual offences' with a value of 3 or less are given a value of 2 to calculate totals/.test(t))).toBe(true);
    // A tiny suburb: the counts are not rounded or hidden.
    const small = await runWith({ locality: "Lysterfield South", postcode: "3156" }, db, DOCKLANDS_UNIT);
    expect(small.status).toBe("ok");
    expect(small.figures.find((f) => f.key === "suburb_total")!.value).toBe(sumWhere((r) => r[0] === 2026 && r[3] === "Lysterfield South"));
  });

  it("pickNotices drops the licence line and repeats nothing", () => {
    const n = (note_key: string, sheet: string, topic: string, seq: number, note_text: string) => ({ note_key, sheet, topic, seq, note_text });
    const picked = pickNotices([
      n("a", "Contents", "notes", 1, "Creative Commons Attribution 4.0 ..."),
      n("b", "Contents", "notes", 2, "same"),
      n("c", "Footnotes", "Table 03", 1, "same"),
      n("d", "Footnotes", "Table 04", 1, "not for this table"),
    ]);
    expect(picked.map((x) => x.key)).toEqual(["c"]);
  });
});

describe("rights and the credit (AD-4, L14)", () => {
  it("source pending: the section is not_covered with the public text only, and the layer code never runs", async () => {
    await withDb(async (t) => {
      await t.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'csa_crime_incidents'");
      const { LAYERS } = await import(".");
      const layer = LAYERS.find((l) => l.layer_id === "L18-safety")!;
      const spy = vi.spyOn(layer, "run");
      const layers = await report(t, DOCKLANDS_UNIT);
      expect(layers["L18-safety"].status).toBe("not_covered");
      expect(layers["L18-safety"].message).toBe("Not available yet");
      expect(JSON.stringify(layers["L18-safety"])).not.toMatch(/csa_|pending|cleared/i);
      expect(spy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });

  it("L14 credits the agency from the ok section: attribution text, licence link, 'Adapted by VicProp' and the dataset date", async () => {
    const l14 = (await report(db, DOCKLANDS_UNIT))["L14-attribution"];
    const s = (l14.payload as any).sources.find((x: any) => x.source_id === "csa_crime_incidents");
    expect(s).toMatchObject({
      licence: "CC BY 4.0",
      licence_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution_text: "Source: Crime Statistics Agency, Victoria. Adapted by VicProp.",
      adapted: true,
      as_of: "2026-11-21",
      used_by: ["L18-safety"],
    });
  });

  it("L14 credits nothing from a gap section", async () => {
    const l14 = (await report(db, NOT_IN_FILE))["L14-attribution"];
    expect((l14.payload as any).sources.map((s: any) => s.source_id)).not.toContain("csa_crime_incidents");
  });

  it("the coverage endpoint reports L18 live", async () => {
    const body = await (await handleCoverage(() => db)).json();
    expect(body.layers.find((l: { layer_id: string }) => l.layer_id === "L18-safety").status).toBe("live");
  });

  it("is the section after schools and before the building in the report", async () => {
    const address = await resolveQuery(db, DOCKLANDS_UNIT);
    const model = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "t" });
    const ids = model.layers.map((l) => l.layer_id);
    expect(ids.indexOf("L18-safety")).toBe(ids.indexOf("L17-schools") + 1);
    expect(ids.indexOf("L11-building")).toBe(ids.indexOf("L18-safety") + 1);
  });
});

describe("wording guard (AD-10, and the spec: no verdict, rank, score or forecast)", () => {
  const BANNED = /\b(safe|safer|safest|unsafe|safety|dangerous|danger|high[- ]crime|low[- ]crime|crime[- ]ridden|crime[- ]free|rank|ranks|ranked|ranking|score|scores|scored|rating|forecast|predict|predicts|predicted|prediction|worse|worst|better|best|risky|risk)\b/i;

  it.each([DOCKLANDS_UNIT, TWO_COUNCILS])("no text of the section for %s carries a verdict, a rank, a score or a forecast", async (query) => {
    const l18 = (await report(db, query))["L18-safety"];
    // The agency's own offence names are shown as published and are not our wording: A80 is "Dangerous and negligent acts endangering people".
    const offenceNames = new Set((l18.payload as any).table.flatMap((r: any) => [r.subdivision, r.division]));
    const ours = (s: string) => (offenceNames.has(s) ? "" : s);
    const text = [L18Safety.title, L18Safety.teaser, ...strings(l18.figures.map((f) => [f.label, f.note ?? "", String(f.value ?? "")])), ...strings(l18.payload).map(ours)].join("\n");
    expect(text.match(BANNED)?.[0] ?? null).toBeNull();
    expect(text.length).toBeGreaterThan(500);
  });

  it("the only 'dangerous' in the section is the agency's own offence name (A80), shown as published", async () => {
    const l18 = (await report(db, DOCKLANDS_UNIT))["L18-safety"];
    const hits = strings([l18.figures, l18.payload]).filter((t) => /dangerous/i.test(t));
    expect(hits).toEqual(["A80 Dangerous and negligent acts endangering people"]);
  });

  it("the scope notes and the gap messages are clean too, and the teaser has no digit (a locked response shows no figure)", () => {
    const all = [...SCOPE_NOTES, NOT_LOADED_MESSAGE, NO_POSTCODE_MESSAGE, noSuburbMessage("Fakeville", "3999"), noLatestMessage("Windsor", "3004", 2026), L18Safety.teaser].join("\n");
    expect(all.match(BANNED)?.[0] ?? null).toBeNull();
    expect(L18Safety.teaser).not.toMatch(/\d/);
  });
});

// The six new report sections rendered to HTML from a real assembled report (excerpts of the real files, through the real pipelines and
// layers): headings, formatted distances, the required school wording, the schematic map, the attribution list, and the gap states.
// Plus the pure pieces: the map, the school rings and the metres format.
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../../server/contracts/address";
import type { ReportModel } from "../../server/contracts/report";
import { assembleReport } from "../../server/services/assemble-report";
import { resolveQuery } from "../../server/services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../../server/testing/db";
import { formatValue } from "../format";
import { BuildingPanel, SchoolsPanel, SupplyPanel, TransportPanel, schoolRings } from "./LocationPanels";
import { AttributionList, ScreenerTable } from "./NearbyPanels";
import { ReportView } from "./ReportView";
import { SchematicMap } from "./SchematicMap";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
});
afterAll(() => close());

async function model(query: string): Promise<ReportModel> {
  const address = await resolveQuery(db, query);
  return assembleReport({ db, address, principal: ANONYMOUS, request_id: "t" });
}
const html = (m: ReportModel) => renderToStaticMarkup(<ReportView model={m} />);
const section = (out: string, id: string) => {
  const start = out.indexOf(`id="r-${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const end = out.indexOf("</section>", start);
  return out.slice(start, end);
};

describe("a Docklands unit", () => {
  let out: string;
  beforeAll(async () => {
    out = html(await model("310/628 Flinders St Docklands"));
  });

  it("shows the six new sections under the owner's headings, in report order", () => {
    const heads = ["How do you get around?", "Which schools is it zoned for?", "What do we know about the building?", "What new apartments are coming?", "Where else could you invest?", "Where did all this come from?"];
    const at = heads.map((h) => out.indexOf(`>${h}<`));
    for (const [i, a] of at.entries()) expect(a, heads[i]).toBeGreaterThan(-1);
    // Transport, schools, building, supply come in that order, then the suburb sections, then the screener; attribution is last.
    expect(at.slice(0, 4)).toEqual([...at.slice(0, 4)].sort((a, b) => a - b));
    expect(out.indexOf(">What could it return?<")).toBeGreaterThan(at[3]);
    expect(at[4]).toBeGreaterThan(out.indexOf(">How does the suburb compare with nearby ones?<"));
    expect(at[5]).toBe(Math.max(...at));
    expect(out.indexOf(">What should I ask next?<")).toBeLessThan(at[5]);
  });

  it("transport: a row for each kind with the nearest stop, the straight-line distance in metres, and the counts; the map says it is not a street map", () => {
    const s = section(out, "L16-transport");
    expect(s).toContain("Nearest stop of each kind");
    expect(s).toMatch(/<tr data-mode="tram"><th scope="row">Tram<\/th><td>Docklands Park\/Harbour Esp #D4<\/td>/);
    expect(s).toContain("192 m");
    expect(s).toMatch(/Within 400 m/);
    expect(s).toContain("Schematic map, not a street map");
    expect(s).toContain("The counts are numbers of stops, not services. How often vehicles run, and at what hours, is not shown.");
    expect(s).toMatch(/<svg[^>]*role="img"[^>]*data-points="\d+"/);
    expect(s).toContain("400 m</text>");
    expect(s).toContain("800 m</text>");
    expect(s).toMatch(/Straight-line distance from the address point, not a walking route/);
    expect(s).not.toMatch(/<img|openstreetmap|tile\./i);
    expect(s).not.toMatch(/walk(ing)? time|minutes? walk/i);
    expect(s).toContain("Public Transport Victoria");
    // A coach stop beyond 800 m is shown in kilometres.
    expect(s).toMatch(/0\.9 km|910 m/);
  });

  it("schools: the 2026 zone year, 'not a guarantee', 'confirm with the school or the Department' and the Department's do-not-rely line, and no quality score", () => {
    const s = section(out, "L17-schools");
    expect(s).toContain("These are the 2026 school zones");
    expect(s).toContain("not a guarantee of a place");
    expect(s).toContain("Confirm with the school or the Department of Education");
    expect(s).toContain("should not be relied on for property purchase decisions");
    expect(s).toContain("Docklands Primary School");
    expect(s).toContain("University High School");
    expect(s).toContain("Years 7 to 9");
    expect(s).toContain("Year 12");
    expect(s).toMatch(/Government school zones that contain this address/);
    expect(s).toContain("Nearest schools");
    expect(s).toContain("South Melbourne Primary School");
    // A nearby selective school has no zone in the data: the table says so rather than "No".
    expect(s).toContain("No zone listed");
    expect(s).not.toMatch(/ICSEA|NAPLAN|VCE|\bscore\b|\brating\b|\bbest\b/i);
    expect(s).toContain("Department of Education school zones 2026");
  });

  it("building: the unit count as an Estimated range, then the council's year built, floors and use with how the record was matched", () => {
    const s = section(out, "L11-building");
    expect(s).toContain("1 to 3");
    expect(s).toContain("2018");
    expect(s).not.toContain("2,018");
    expect(s).toContain("Residential Apartment");
    expect(s).toContain("Matched to the City of Melbourne record");
    expect(s).toMatch(/Same street and street number as the City of Melbourne record/);
    expect(s).toMatch(/chip est/);
  });

  it("supply: a table by stage, the nearest projects with straight-line distances, and the council-only note", () => {
    const s = section(out, "L08-supply");
    expect(s).toContain("New apartments within 1 km, by stage");
    for (const stage of ["Under construction", "Approved", "Applied for"]) expect(s).toContain(`<th scope="row">${stage}</th>`);
    expect(s).toContain("The nearest projects");
    expect(s).toContain("City of Melbourne data covers the City of Melbourne only");
  });

  it("screener: nearby suburbs side by side, ordered by yield before costs, with the rating column and its label", () => {
    const s = section(out, "L10-screener");
    expect(s).toContain("Nearby suburbs side by side, ordered by gross yield before costs");
    expect(s).toContain("Southbank");
    expect(s).toContain("Two boundaries away");
    expect(s).toContain("Conditions rating, fifth");
    expect(s).toContain("Conditions rating, not a price forecast");
    expect(s).toMatch(/before rates, fees, insurance, vacancy and every other cost/);
  });

  it("screener: a rated suburb's cell reads like the layer's label, position and total", async () => {
    const m = await model("310/628 Flinders St Docklands");
    const l10 = m.layers.find((l) => l.layer_id === "L10-screener")!;
    const rows = (l10.payload.table as { rows: { name: string; conditions?: { label: string; position: number; of: number } | null }[] }).rows;
    const rated = rows.find((r) => r.conditions)!;
    const s = section(html(m), "L10-screener");
    expect(s).toContain(`<td>${rated.conditions!.label}, ${rated.conditions!.position} of ${rated.conditions!.of}</td>`);
  });

  it("attribution: each source with its credit text, licence and data date; the footer credits the new sources too", () => {
    const s = section(out, "L14-attribution");
    expect(s).toContain("Public Transport Victoria, CC BY 4.0.");
    expect(s).toContain("State of Victoria (Department of Education)");
    expect(s).toContain("City of Melbourne, CC BY 4.0.");
    expect(s).toContain("Licence: CC BY 4.0");
    expect(s).toContain("Data as at: 6 Nov 2026");
    expect(s).toContain("Used in: Transport");
    // The licence link, and "Adapted by VicProp" for data VicProp changed (stops grouped, zones tested, council records matched).
    expect(s).toContain('<a href="https://creativecommons.org/licenses/by/4.0/"');
    const transport = s.slice(s.indexOf('data-source="gtfs_vic"'), s.indexOf("</li>", s.indexOf('data-source="gtfs_vic"')));
    expect(transport).toContain("Adapted by VicProp.");
    const rents = s.slice(s.indexOf('data-source="homes_victoria_rents"'), s.indexOf("</li>", s.indexOf('data-source="homes_victoria_rents"')));
    expect(rents).toContain("creativecommons.org/licenses/by/4.0");
    expect(s).toContain("Incorporates or developed using G-NAF");
  });
});

describe("gap states", () => {
  it("an address outside the council area: building and supply say the dataset covers the City of Melbourne only; schools say the address may have no zone", async () => {
    const out = html(await model("5 Odd Court Fakeville"));
    expect(section(out, "L11-building")).toContain("covers the City of Melbourne only");
    expect(section(out, "L08-supply")).toContain("covers the City of Melbourne only");
    const schools = section(out, "L17-schools");
    expect(schools).toContain("No zone found");
    expect(schools).toContain("Only government neighbourhood schools have zones");
    expect(schools).toContain("may have none");
    expect(schools).toContain("not a guarantee of a place");
    // No building fact is invented.
    expect(section(out, "L11-building")).not.toMatch(/Year built.{0,200}\d{4}/);
    // The screener has no suburb here and says so; the report still renders every other section.
    expect(section(out, "L10-screener")).toContain("Suburb not matched");
    expect(out).toContain(">Where did all this come from?<");
  });
});

describe("the screener marks a thin sample with * and leaves a solid row alone", () => {
  const cols = [
    { key: "price_cents", label: "Median unit price", unit: "AUD_cents", chip: "Observed", source_ids: ["vgv_medians"], as_of: "2026-03-31" },
    { key: "rent_weekly_cents", label: "Median weekly rent", unit: "AUD_cents_per_week", chip: "Observed", source_ids: ["homes_victoria_rents"], as_of: "2026-06-30" },
    { key: "gross_yield", label: "Gross yield, before costs", unit: "fraction", chip: "Estimated", source_ids: ["homes_victoria_rents", "vgv_medians"], as_of: "2026-03-31" },
  ];
  const row = (name: string, thin: string[], extra = {}) => ({ sal_code: name, name, is_subject: false, hops: 1, values: { price_cents: 50_000_000, rent_weekly_cents: 70_000, gross_yield: 0.0728 }, thin, ...extra });
  it("a * after the price and the yield of a thin row, none on a solid row, and the note explains it", () => {
    const out = renderToStaticMarkup(<ScreenerTable payload={{ note: "n", table: { columns: cols, rating_column: null, rows: [row("Solid", []), row("Thin", ["price_cents", "gross_yield"])] } }} />);
    const solid = out.slice(out.indexOf("Solid"), out.indexOf("Thin"));
    const thin = out.slice(out.indexOf("Thin<"));
    expect(solid).not.toContain(" *");
    expect(solid).toContain("<td class=\"num\">$500,000</td>");
    expect(thin).toContain("$500,000 *");
    expect(thin).toContain("7.3% *");
    expect(thin).toContain("<td class=\"num\">$700 a week</td>");
    expect(out).toContain("* rests on fewer than 10 sales or lettings");
  });
  it("a rated and an unrated row", () => {
    const out = renderToStaticMarkup(
      <ScreenerTable payload={{ table: { columns: cols, rating_column: { label: "Conditions rating, not a price forecast", chip: "Estimated", source_ids: ["conditions_rating"], as_of: "2021-08-10" }, rows: [row("Rated", [], { conditions: { fifth: 2, label: "Second fifth", position: 5, of: 441 } }), row("Unrated", [], { conditions: null })] } }} />,
    );
    expect(out).toContain("<td>Second fifth, 5 of 441</td>");
    expect(out).toContain("<td>Not rated</td>");
  });
});

describe("panels draw nothing for a payload that is not the shape the layer writes", () => {
  const empty = (el: ReactElement) => renderToStaticMarkup(el);
  it.each([{}, { nearest: 3, counts: [] }, { nearest: {}, counts: "x" }])("transport %j", (p) => {
    expect(empty(<TransportPanel payload={p as Record<string, unknown>} />)).toBe("");
  });
  it("supply, screener, attribution and building", () => {
    expect(empty(<SupplyPanel payload={{ stages: "x" }} />)).toBe("");
    expect(empty(<ScreenerTable payload={{ table: { columns: "x", rows: [] } }} />)).toBe("");
    expect(empty(<ScreenerTable payload={{}} />)).toBe("");
    expect(empty(<AttributionList payload={{ sources: [{ no: "name" }] }} />)).toBe("");
    expect(empty(<BuildingPanel payload={{ com: { street_address: 3 } }} />)).toBe("");
  });
  it("schools: malformed lists and a missing map draw no table and no svg", () => {
    const out = empty(<SchoolsPanel payload={{ notices: [1, "A notice"], zones: "x", nearest: [{ schools: "y" }], map_schools: [{ east: "1" }] }} />);
    expect(out).toContain("A notice");
    expect(out).not.toMatch(/<table|<svg/);
  });
  it("a transport row with a missing distance reads Not available and never NaN", () => {
    const out = empty(<TransportPanel payload={{ nearest: { train: { name: "Somewhere", distance_m: "far", routes: ["A"] } }, counts: { train: { within_400: 1 } }, rings_m: [400, 800], stops: [] }} />);
    expect(out).toContain("Somewhere");
    expect(out).toContain("Not available");
    expect(out).not.toMatch(/NaN/);
  });
});

describe("the schematic map", () => {
  const pts = [
    { kind: "tram" as const, name: "Near tram", east: 100, north: 50, label: true },
    { kind: "bus" as const, name: "Far bus", east: 900, north: 0 },
    { kind: "train" as const, name: "North train", east: 0, north: 700, label: true },
  ];
  it("draws the rings and the points inside the outer ring only, with the address at the centre and a key", () => {
    const out = renderToStaticMarkup(<SchematicMap rings={[400, 800]} points={pts} what="stops" />);
    expect(out).toContain('data-points="2"');
    expect(out).toContain("Near tram");
    expect(out).toContain("North train");
    expect(out).not.toContain("Far bus");
    expect(out.match(/class="ring"/g)).toHaveLength(2);
    expect(out).toContain("This address");
    expect(out).toContain("Not a street map");
  });
  it("with no rings it draws nothing, and a point is placed by its east and north", () => {
    expect(renderToStaticMarkup(<SchematicMap rings={[]} points={pts} what="stops" />)).toBe("");
    const out = renderToStaticMarkup(<SchematicMap rings={[800]} points={[{ kind: "tram", name: "T", east: 400, north: 400 }]} what="stops" />);
    // 340 px square, centre 170, outer ring 140 px for 800 m: 400 m is 70 px, east to the right, north up.
    expect(out).toMatch(/cx="240"[^>]*cy="100"/);
  });
  it("school rings are the smallest of 500 m to 40 km whose double covers the farthest school", () => {
    expect(schoolRings(900)).toEqual([500, 1000]);
    expect(schoolRings(2947)).toEqual([2000, 4000]);
    expect(schoolRings(100_000)).toEqual([40000, 80000]);
  });
});

describe("format", () => {
  it("metres under a kilometre are whole metres; longer is kilometres with one decimal; a year has no separator", () => {
    expect(formatValue(192, "metres")).toBe("192 m");
    expect(formatValue(999.4, "metres")).toBe("999 m");
    expect(formatValue(999.6, "metres")).toBe("1.0 km");
    expect(formatValue(1000, "metres")).toBe("1.0 km");
    expect(formatValue(1363, "metres")).toBe("1.4 km");
    expect(formatValue(7828, "metres")).toBe("7.8 km");
    expect(formatValue(2018, "year")).toBe("2018");
    expect(formatValue(null, "metres")).toBe("Not available");
  });
});

describe("narrow screen: the location sections", () => {
  const css = readFileSync(new URL("../pine.css", import.meta.url), "utf8");
  it("the map stacks under its caption on a phone, and the SVG never exceeds its column", () => {
    expect(css.slice(css.indexOf("@media (max-width: 860px)"))).toMatch(/\.smap \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.smap svg \{ width: 100%; height: auto; max-width: 340px;/);
  });
});

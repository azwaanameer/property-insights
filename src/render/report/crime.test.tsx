// The recorded crime section (L18) rendered to HTML from a real assembled report: a real excerpt of the Crime Statistics Agency workbook through
// the real extractor, loader and layer. Heading, counts, the council rate beside the Victorian rate, the agency's notices as published, the
// gap state, the credit in the sources section, and the wording guard on the rendered text.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../../server/contracts/address";
import type { ReportModel } from "../../server/contracts/report";
import { assembleReport } from "../../server/services/assemble-report";
import { resolveQuery } from "../../server/services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../../server/testing/db";
import { formatValue } from "../format";
import { ReportView } from "./ReportView";
import { SafetyPanel } from "./SafetyPanel";

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
  return out.slice(start, out.indexOf("</section>", start));
};
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("a Docklands unit", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model("310/628 Flinders St Docklands"));
    s = section(out, "L18-safety");
  });

  it("has the section 'What does recorded crime look like?' after the schools and before the building", () => {
    expect(s).toContain("What does recorded crime look like?");
    expect(s).toContain('data-status="ok"');
    const at = (h: string) => out.indexOf(`>${h}<`);
    expect(at("What does recorded crime look like?")).toBeGreaterThan(at("Which schools is it zoned for?"));
    expect(at("What does recorded crime look like?")).toBeLessThan(at("What do we know about the building?"));
  });

  it("shows the suburb's counts for the year ending June 2026 by division, with the Estimated chip on what is added up", () => {
    expect(s).toContain('data-figure="suburb_total"');
    expect(text(s)).toContain("Incidents recorded in Docklands, year ending June 2026");
    expect(s).toMatch(/data-figure="suburb_total"[^]*?<div class="val">3,058<\/div>/);
    for (const d of ["Crimes against the person", "Property and deception offences", "Drug offences", "Public order and security offences", "Justice procedures offences", "Other offences"]) {
      expect(text(s), d).toContain(d);
    }
    expect(s).toMatch(/data-figure="change_on_previous_year"[^]*?<div class="val">-5\.4%<\/div>/);
    expect(s).toContain('class="chip est"');
    expect(s).toContain('class="chip obs"');
  });

  it("shows the City of Melbourne rate beside the Victorian rate, as plain figures", () => {
    expect(text(s)).toContain("Rate for every 100,000 residents, Melbourne council area, year ending June 2026");
    expect(s).toMatch(/data-figure="council_rate"[^]*?<div class="val">16,944 per 100,000<\/div>/);
    expect(s).toMatch(/data-figure="victoria_rate"[^]*?<div class="val">9,286 per 100,000<\/div>/);
    // The rate table lists the council area and Victoria, each once.
    expect(s).toContain("Incidents for every 100,000 residents, year ending June 2026");
    expect(s).toContain("Melbourne council area</th>");
    expect(s).toContain("Victoria, all council areas combined</th>");
    expect(s).toContain("33,128");
  });

  it("draws the offence table with this year and the year before, and the five-year totals", () => {
    expect(text(s)).toContain("Incidents recorded in Docklands 3008 by offence type, year ending June 2026");
    expect(s).toContain("A20 Assault and related offences");
    expect(s).toContain("Year ending June 2025");
    expect(s).toContain("Year ending June 2026");
    expect(text(s)).toContain("Incidents recorded in Docklands, all offence types, by year");
    for (const y of [2022, 2023, 2024, 2025, 2026]) expect(s).toContain(`<th scope="row">${y}</th>`);
  });

  it("carries the agency's notices word for word, including the small-count rule and the population estimate note", () => {
    const t = text(s);
    expect(t).toContain("sensitive offence counts for subdivisions 'A10 Homicide and related offences' and 'A30 Sexual offences' with a value of 3 or less are given a value of 2 to calculate totals.");
    expect(t).toContain("The CSA uses estimates created by the Victorian State Government 'Victoria in Futures' report.");
    expect(t).toContain("Other crimes against the person includes A10 Homicide and related offences, A30 Sexual offences, A40 Abduction and related offences and A60 Blackmail and extortion.");
    expect(t).toContain("Excludes criminal incidents at Justice institutions and immigration facilities, Unincorporated Victoria and where the geographic location is unknown.");
    expect(t).toContain("are subject to movement between releases");
    expect(s).toContain("Read this first");
  });

  it("names the source and its date under the figures, and has no map, image, tile or colour verdict", () => {
    expect(text(s)).toContain("Crime Statistics Agency Victoria, as at 21 Nov 2026");
    expect(s).not.toMatch(/<img|<svg|openstreetmap|tile\./i);
    expect(s).not.toMatch(/class="[^"]*\b(good|bad|safe|danger|high|low|red|green)\b/);
  });

  it("the sources section credits the agency with the licence link and 'Adapted by VicProp' once", () => {
    const attrib = section(out, "L14-attribution");
    const li = attrib.slice(attrib.indexOf('data-source="csa_crime_incidents"'));
    const item = li.slice(0, li.indexOf("</li>"));
    expect(text(item)).toContain("Source: Crime Statistics Agency, Victoria. Adapted by VicProp.");
    expect(item.match(/Adapted by VicProp/g)).toHaveLength(1);
    expect(item).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(text(item)).toContain("Used in: Recorded crime");
    expect(text(item)).toContain("Data as at: 21 Nov 2026");
  });

  it("has no verdict, rank, score or forecast wording anywhere in the section (the agency's own offence names aside)", () => {
    const t = text(s).replace("A80 Dangerous and negligent acts endangering people", "");
    expect(t.match(/\b(safe|safer|safest|unsafe|dangerous|high crime|low crime|rank|ranked|ranking|score|forecast|predict\w*)\b/i)?.[0] ?? null).toBeNull();
  });
});

describe("two council areas, a gap and a malformed payload", () => {
  it("a suburb in two council areas shows each council's rate, named", async () => {
    const s = section(html(await model("100 St Kilda Road Melbourne")), "L18-safety");
    expect(s).toContain("Melbourne council area</th>");
    expect(s).toContain("Port Phillip council area</th>");
    expect(s).toContain("16,944 per 100,000");
    expect(s).toContain("10,984 per 100,000");
    expect(text(s)).toContain("The suburb lies in 2 council areas (Melbourne and Port Phillip); the counts are added together.");
  });

  it("a suburb not in the file is an honest gap: the message, no table, no figure", async () => {
    const out = html(await model("5 Odd Court Fakeville"));
    const s = section(out, "L18-safety");
    expect(s).toContain('data-status="gap"');
    expect(text(s)).toContain('The Crime Statistics Agency lists no incidents under the suburb or town "Fakeville" with postcode 3999');
    expect(s).not.toContain("<table");
    expect(s).not.toContain('class="tile"');
    // The rest of the report still renders, and the agency is not credited.
    expect(out).toContain("Where did all this come from?");
    expect(out).not.toContain('data-source="csa_crime_incidents"');
  });

  it("SafetyPanel draws nothing for a payload that does not fit, and never throws", () => {
    for (const payload of [{}, { suburb: 1 }, { suburb: { name: "X", postcode: "3000" }, year_ending: "2026" }, { suburb: { name: "X", postcode: "3000" }, year_ending: 2026, table: "no", series: 5, councils: [null, 3], notices: [{}] }]) {
      expect(() => renderToStaticMarkup(<SafetyPanel payload={payload as Record<string, unknown>} />)).not.toThrow();
    }
    expect(renderToStaticMarkup(<SafetyPanel payload={{}} />)).toBe("");
  });

  it("formats a rate for every 100,000 residents", () => {
    expect(formatValue(16944.407485256, "per_100k")).toBe("16,944 per 100,000");
    expect(formatValue(null, "per_100k")).toBe("Not available");
    expect(formatValue(0, "per_100k")).toBe("0 per 100,000");
  });
});

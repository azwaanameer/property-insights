// The reported recent sales (L21) and price drivers (L04) sections rendered to HTML from a real assembled report: the committed excerpt of the real
// sold listings through the real loader, the real model and the real layers. Headings, the compact sales table with a credit and a link on every
// sale, "association, not cause" beside the effects, the layout medians, the gaps, the credit in the sources section, and the wording guard.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../../server/contracts/address";
import type { ReportModel } from "../../server/contracts/report";
import { assembleReport } from "../../server/services/assemble-report";
import { resolveQuery } from "../../server/services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../../server/testing/db";
import { DriversPanel } from "./DriversPanel";
import { ReportView } from "./ReportView";
import { SalesPanel } from "./SalesPanel";

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

describe("a Docklands unit: What have nearby homes sold for?", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model("310/628 Flinders St Docklands"));
    s = section(out, "L21-sales");
  });

  it("has the section right after the price section and before the drivers", () => {
    expect(s).toContain("What have nearby homes sold for?");
    expect(s).toContain('data-status="ok"');
    const at = (h: string) => out.indexOf(`>${h}<`);
    expect(at("What have nearby homes sold for?")).toBeGreaterThan(at("What is it worth?"));
    expect(at("What have nearby homes sold for?")).toBeLessThan(at("What makes it worth more or less?"));
    expect(at("What makes it worth more or less?")).toBeLessThan(at("How do you get around?"));
  });

  it("is a compact table of 8 sales, each with its date, price, beds, baths, car spaces and address", () => {
    expect(s).toContain('data-panel="sales"');
    expect(s.match(/data-sale="/g)).toHaveLength(8);
    const first = s.slice(s.indexOf('data-sale="152088352"'));
    const row = text(first.slice(0, first.indexOf("</tr>")));
    expect(row).toContain("17 Sep 2026");
    expect(row).toContain("$760,000");
    expect(row).toContain("3203/628 Flinders Street");
    expect(text(s)).toContain("Showing the 8 most recent of 11.");
    for (const h of ["Sold", "Price", "Beds", "Baths", "Car", "Address", "Listing"]) expect(s).toContain(`>${h}</th>`);
  });

  it("puts a link to the realestate.com.au listing page, labelled as reported, on every sale", () => {
    const rows = s.split('data-sale="').slice(1);
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      const row = r.slice(0, r.indexOf("</tr>"));
      expect(row).toMatch(/href="https:\/\/www\.realestate\.com\.au\/property-apartment-vic-docklands-\d+"/);
      expect(text(row)).toContain("Reported on realestate.com.au");
      expect(row).toContain('rel="noopener noreferrer"');
    }
  });

  it("says the sales are as reported, not verified and not a Victorian title record, and carries the credit and the harvest date", () => {
    const t = text(s);
    expect(t).toContain("As reported by realestate.com.au, not verified, not a Victorian title record.");
    expect(t).toContain("Recent sales as reported on realestate.com.au listings, retrieved by VicProp.");
    expect(t).toContain("the listings were retrieved on 21 Nov 2026");
    expect(s).toContain('class="chip est"');
  });

  it("shows no valuation or estimated price for the property", () => {
    expect(text(s)).not.toMatch(/valuation|estimated price|we value|appraisal/i);
    expect(text(s)).not.toMatch(/\b(agent|agency|phone)\b/i);
  });

  it("the sources section credits the listing data, once, with its text, the harvest date and the sections that used it", () => {
    const attrib = section(out, "L14-attribution");
    const li = attrib.slice(attrib.indexOf('data-source="rp_sold_listings"'));
    const item = text(li.slice(0, li.indexOf("</li>")));
    expect(item).toContain("Recent sales as reported on realestate.com.au listings, retrieved by VicProp.");
    expect(item).toContain("Data as at: 21 Nov 2026");
    expect(item).toContain("Used in: Reported sales, Price drivers");
    expect(attrib.match(/data-source="rp_sold_listings"/g)).toHaveLength(1);
  });
});

describe("a Docklands unit: What makes it worth more or less?", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model("310/628 Flinders St Docklands"));
    s = section(out, "L04-drivers");
  });

  it("has the section heading and says the effects are associations, not causes, before the table", () => {
    expect(s).toContain("What makes it worth more or less?");
    expect(s).toContain('data-status="ok"');
    const t = text(s);
    expect(t).toContain("associations in past reported sales, not causes");
    expect(t).toContain("Association, not cause");
    expect(t.indexOf("not causes")).toBeLessThan(t.indexOf("Characteristic"));
  });

  it("shows each driver with its effect in percent (signed), its standard error and its sample size", () => {
    expect(s).toContain('data-panel="drivers"');
    for (const d of ["bed_2", "bed_3", "bath_2plus", "car_space", "floor_10_19", "floor_20_29", "floor_30plus", "suburb"]) expect(s, d).toContain(`data-driver="${d}"`);
    const bed2 = s.slice(s.indexOf('data-driver="bed_2"'));
    const row = text(bed2.slice(0, bed2.indexOf("</tr>")));
    expect(row).toContain("2 bedrooms compared with 1");
    expect(row).toMatch(/\+3\d\.\d% \d\.\d% 163/);
    expect(text(s)).toContain("Docklands compared with Melbourne CBD");
    for (const h of ["Characteristic", "Difference in sale price", "Standard error", "Sales with it"]) expect(s).toContain(`>${h}</th>`);
    // The figure tiles carry the same effects, signed, with the Estimated chip.
    expect(s).toMatch(/data-figure="effect_bed_2"[^]*?<div class="val">\+30\.\d%<\/div>/);
  });

  it("gives the window and the number of sales, and the layout medians with their sales", () => {
    const t = text(s);
    expect(t).toMatch(/Based on 274 of 339 apartment sales, sold \d+ \w+ 2025 to \d+ \w+ 2026\./);
    expect(t).toContain("Middle reported sale price by layout in Docklands");
    expect(t).toContain("2 bed, 2 or more bath, with a car space");
    expect(t).toContain("$698,000");
    expect(t).toContain("1 bed, 1 bath, no car space");
    expect(t).toContain("$370,000");
    expect(t).toContain("Recent sales as reported on realestate.com.au listings, retrieved by VicProp.");
  });

  it("uses no wording of a valuation, a forecast or a prediction", () => {
    const t = text(s).replace(/What makes it worth more or less\?/, "");
    expect(t).not.toMatch(/valuation|forecast|predict\w*|estimated price|\bworth\b/i);
    expect(s).not.toMatch(/\bbest\b/i);
  });
});

describe("gaps and malformed payloads", () => {
  it("a suburb outside the harvested ones is two honest gaps naming the coverage, with no table, and the rest of the report still renders", async () => {
    const out = html(await model("7 Smith Rd Carlton"));
    for (const id of ["L21-sales", "L04-drivers"]) {
      const s = section(out, id);
      expect(s).toContain('data-status="gap"');
      expect(text(s)).toContain("Reported sales are loaded for 4 suburbs only (Docklands, Melbourne CBD, South Melbourne, St Kilda)");
      expect(s).not.toContain("<table");
      expect(s).not.toContain('class="tile"');
    }
    expect(out).toContain("Where did all this come from?");
    expect(out).not.toContain('data-source="rp_sold_listings"');
  });

  it("the panels draw nothing for a payload that does not fit, and never throw", () => {
    const bad = [{}, { sales: "x" }, { sales: [null, 3, {}] }, { sales: [{ listing_id: "1", sold_on: "2026-01-01", price_cents: "no", address: "x" }] }, { drivers: 5 }, { drivers: [{ key: "a" }] }];
    for (const payload of bad) {
      for (const Panel of [SalesPanel, DriversPanel]) expect(() => renderToStaticMarkup(<Panel payload={payload as Record<string, unknown>} />)).not.toThrow();
    }
    expect(renderToStaticMarkup(<SalesPanel payload={{}} />)).toBe("");
    expect(renderToStaticMarkup(<DriversPanel payload={{}} />)).toBe("");
  });

  it("a link that is not on the listing site is not drawn as a link, and a count the listing did not give reads 'Not listed' (a zero stays a zero)", () => {
    const sale = (over: Record<string, unknown>) => ({ listing_id: "1", sold_on: "2026-09-17", price_cents: 50_000_000, address: "1/2 A Street", bed: 2, bath: null, park: 0, link: "https://www.realestate.com.au/property-apartment-vic-x-1", ...over });
    const out = renderToStaticMarkup(<SalesPanel payload={{ scope: "building", total: 2, sales: [sale({}), sale({ listing_id: "2", link: "javascript:alert(1)" })] }} />);
    expect(out.match(/href="/g)).toHaveLength(1);
    expect(out).not.toContain("javascript:");
    const row = text(out.slice(out.indexOf('data-sale="1"'), out.indexOf("</tr>", out.indexOf('data-sale="1"'))));
    expect(row).toContain("Not listed"); // baths
    expect(row).toMatch(/ 2 Not listed 0 /); // beds 2, baths not listed, car 0
  });

  it("the drivers panel says the suburb is the reference suburb, or too thin, instead of a number", () => {
    const base = { drivers: [{ key: "bed_2", label: "2 bedrooms compared with 1", effect_pct: 30, se_pct: 2, n_group: 10, n_used: 20 }], notes: [], layouts: [] };
    const ref = renderToStaticMarkup(<DriversPanel payload={{ ...base, suburb: { name: "Melbourne CBD", is_reference: true } }} />);
    expect(text(ref)).toContain("Melbourne CBD is the reference suburb");
    const thin = renderToStaticMarkup(<DriversPanel payload={{ ...base, suburb: { name: "St Kilda", is_reference: false, effect_pct: null, se_pct: null } }} />);
    expect(text(thin)).toContain("St Kilda has too few usable apartment sales");
  });
});

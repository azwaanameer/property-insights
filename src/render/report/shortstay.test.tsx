// The short-stay income section (L06, fake vendor adapter) rendered to HTML from a real assembled report: a card with tiles, the method line and the
// comparable-listings table when it clears the cutoff, and one quiet line (no card, no heading) when it does not.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "../../server/contracts/address";
import type { ReportModel } from "../../server/contracts/report";
import { BELOW_CUTOFF_MESSAGE, HOUSE_MESSAGE, UNAVAILABLE_MESSAGE } from "../../server/layers/L06-shortstay";
import { assembleReport } from "../../server/services/assemble-report";
import { resolveQuery } from "../../server/services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../../server/testing/db";
import { fakeVendors, ok, shortStayComp, shortStayEstimate, strongComps, UNAVAILABLE_VENDORS } from "../../server/testing/fake-vendors";
import type { ShortStayEstimate, VendorAdapters } from "../../server/vendors/types";
import { ShortStayPanel } from "./ShortStayPanel";
import { ReportView } from "./ReportView";

let db: TestDb;
let close: () => Promise<void>;
let annualRentDollars: number;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
  const base = await model(fakeVendors());
  const rent = base.layers.find((l) => l.layer_id === "L02-rent")!.figures.find((f) => f.key === "rent_2bed_flat")!;
  annualRentDollars = ((rent.value as number) * 52) / 100;
});
afterAll(() => close());

const model = async (vendors: VendorAdapters, query = "310/628 Flinders St Docklands"): Promise<ReportModel> =>
  assembleReport({ db, address: await resolveQuery(db, query), principal: ANONYMOUS, request_id: "t", vendors });
const html = (m: ReportModel) => renderToStaticMarkup(<ReportView model={m} />);
const section = (out: string, id: string) => {
  const start = out.indexOf(`id="r-${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return out.slice(start, out.indexOf("</section>", start));
};
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const est = (e: Partial<ShortStayEstimate> = {}) => fakeVendors({ shortStay: async () => ok(shortStayEstimate(e)) });
const above = () => Math.ceil(annualRentDollars * 1.4) + 5000;

describe("the short-stay section above the cutoff", () => {
  let out: string;
  let s: string;
  beforeAll(async () => {
    out = html(await model(est({ annual_revenue: above(), confidence_level: "High", comps: strongComps(5) })));
    s = section(out, "L06-shortstay");
  });

  it("is a card with the question as its heading, the income tiles with Estimated chips, and the method line", () => {
    expect(s).toContain("What could it earn as a short stay?");
    expect(s).toContain('data-status="ok"');
    expect(s).toContain('data-figure="shortstay_annual"');
    expect(s).toContain('data-figure="shortstay_monthly"');
    expect(s).toContain('data-figure="shortstay_occupancy"');
    expect(text(s)).toContain("How this was worked out: AirDNA estimate, high confidence.");
    // Every short-stay tile is Estimated; the one Observed tile is the long-term rent it is compared with, from Homes Victoria.
    expect(s.match(/chip obs/g)).toHaveLength(1);
    expect(s).toMatch(/data-figure="longterm_rent_annual">.*?chip obs/);
    expect(s.match(/chip est/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it("says the bedrooms and bathrooms are assumed, and that it is not a promise or forecast, and does not check whether short stays are allowed", () => {
    const t = text(s);
    expect(t).toContain("Worked for a 2-bedroom, 2-bathroom apartment.");
    expect(t).toContain("assumed");
    expect(t).toContain("not a promise or a forecast");
    expect(t).toContain("does not check whether short stays are allowed");
    expect(t).not.toMatch(/will earn|guarantee/i);
  });

  it("lists the nearest comparable listings with distance, beds, income, reviews and a link to Airbnb's own page", () => {
    expect(s).toContain('data-panel="shortstay"');
    expect(s.match(/data-comp=/g)).toHaveLength(5);
    expect(s).toContain('href="https://www.airbnb.com.au/rooms/c1"');
    expect(s).toContain('rel="noopener noreferrer"');
    expect(s).not.toContain("data-weak");
  });

  it("with few established listings it says so, includes the weaker ones in the table and marks them", async () => {
    const hi = above() + 20_000;
    const m = await model(est({ confidence_level: "Medium", comps: [...strongComps(3, () => hi), shortStayComp({ id: "w", distance_m: 900, revenue: hi - 1000, reviews: 2 })] }));
    const t = section(html(m), "L06-shortstay");
    expect(t).toMatch(/data-comp="w"[^>]*data-weak/);
    expect(text(t)).toContain("(few comparable listings)");
    expect(text(t)).toContain("Few comparable listings: fewer than 5 established listings");
    expect(text(t)).toContain("Made less than a full year of income or has few reviews");
  });

  it("credits AirDNA with the fixed attribution text, and the sources list at the end credits it too", () => {
    expect(s).toContain('data-credit="airdna_rentalizer"');
    expect(text(s)).toContain("Short-stay estimates use AirDNA market data (RapidAPI).");
    expect(text(section(out, "L14-attribution"))).toContain("Short-stay estimates use AirDNA market data (RapidAPI).");
  });

  it("our own estimate says why AirDNA's figure was not used", async () => {
    const m = await model(est({ confidence_level: "Medium", annual_revenue: 30_000, comps: strongComps(6, () => above() + 1000) }));
    const t = text(section(html(m), "L06-shortstay"));
    expect(t).toContain("Our estimate from 6 nearby comparable listings, because AirDNA's confidence is Medium.");
    expect(t).not.toContain("Share of nights booked");
  });
});

describe("the short-stay section as one quiet line", () => {
  const quiet = (out: string) => {
    const start = out.indexOf('id="r-L06-shortstay"');
    expect(start).toBeGreaterThan(-1);
    return out.slice(out.lastIndexOf("<", start), out.indexOf("</p>", start) + 4);
  };

  it("below the cutoff it is a single quiet line: no section card, no heading, no tiles", async () => {
    const out = html(await model(est({ annual_revenue: Math.floor(annualRentDollars * 1.4) - 100, confidence_level: "High" })));
    const q = quiet(out);
    expect(q).toMatch(/^<p class="rquiet"/);
    expect(text(q)).toContain(BELOW_CUTOFF_MESSAGE);
    expect(out).not.toContain("What could it earn as a short stay?");
    expect(out).not.toContain('data-layer="L06-shortstay" data-status="ok"');
    expect(out).not.toContain('data-figure="shortstay_annual"');
    expect(out).not.toMatch(/<section[^>]*id="r-L06-shortstay"/);
    // The line says nothing was found wanting about the rest of the report: every other section still renders as a card.
    expect(section(out, "L05-return")).toBeTruthy();
    expect(section(out, "L14-attribution")).toBeTruthy();
    expect(out).not.toContain('data-credit="airdna_rentalizer"');
  });

  it("with the vendor down it is the one line 'Short-stay estimates are not available right now.' and nothing else changes", async () => {
    const out = html(await model(UNAVAILABLE_VENDORS));
    expect(text(quiet(out))).toContain(UNAVAILABLE_MESSAGE);
    expect(out).not.toContain("What could it earn as a short stay?");
    expect(section(out, "L02-rent")).toContain('data-status="ok"');
  });

  it("a house gets the one line 'Short-stay estimates are for apartments.'", async () => {
    const a = await resolveQuery(db, "310/628 Flinders St Docklands");
    const house = { ...a, match: "building" as const, is_multi_unit: false, unit_number: null, flat_type: null, level_number: null };
    const out = html(await assembleReport({ db, address: house, principal: ANONYMOUS, request_id: "t", vendors: est({ annual_revenue: 500_000 }) }));
    expect(text(quiet(out))).toContain(HOUSE_MESSAGE);
    expect(out).not.toContain("What could it earn as a short stay?");
  });
});

describe("ShortStayPanel", () => {
  it("draws nothing it cannot check: a comparable listing with no id or income is left out, and a link that is not Airbnb's is not a link", () => {
    const out = renderToStaticMarkup(
      <ShortStayPanel
        payload={{
          method: "own",
          method_text: "Our estimate",
          comps: [
            { id: "a", distance_m: 100, bedrooms: 2, bathrooms: 1, revenue_cents: 5_000_000, reviews: 30, strong: true, link: "https://evil.example.com/rooms/1" },
            { id: "", revenue_cents: 100 },
            { id: "c", revenue_cents: "x" },
            "nonsense",
          ],
          notes: ["A note."],
        }}
      />,
    );
    expect(out.match(/data-comp=/g)).toHaveLength(1);
    expect(out).not.toContain("evil.example.com");
    expect(out).toContain("Not listed");
    expect(out).toContain("Short-stay estimates use AirDNA market data (RapidAPI).");
  });
});

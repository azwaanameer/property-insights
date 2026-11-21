// The report page rendered to HTML from a ReportModel: free layers, the locked layer (AD-3), gap / not_covered / error layers,
// the not-covered and not-found views, and the narrow-screen rules in the stylesheet.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Figure, LayerResult } from "../../server/contracts/layer";
import type { ReportModel } from "../../server/contracts/report";
import { NOT_COVERED, NOT_FOUND } from "../../site/copy";
import { formatFigure } from "../format";
import { provenanceText } from "./FigureTile";
import { GeneratingState } from "./Generating";
import { ReportMessage, ReportView } from "./ReportView";

const SECRET = 424242424;
const coverage = { market_tier: "A", match_type: "unit" } as const;
const fig = (key: string, label: string, value: Figure["value"], unit: string | undefined, chip: Figure["chip"], note?: string): Figure => ({
  key, label, value, unit, chip, source_ids: ["homes_victoria_rents"], as_of: "2026-06-30", ...(note ? { note } : {}),
});

const rent: LayerResult = {
  layer_id: "L02-rent", title: "Rent", tier: "free", status: "ok", coverage, payload: {},
  figures: [
    fig("rent_2bed_flat", "Median weekly rent, 2-bedroom flat", 80_000, "AUD_cents_per_week", "Observed"),
    fig("rent_change", "Change in median rent, one year", 0.0667, "fraction", "Estimated", "Derived: past change only."),
    fig("gross_yield", "Gross yield", null, "fraction", "Unknown", "No price for this kind of home."),
  ],
};
const history: LayerResult = {
  layer_id: "L07-history", title: "History", tier: "free", status: "ok", coverage, figures: [],
  payload: {
    price_series: { unit: [{ year: 2024, median_cents: 59_900_000, low_count: false }, { year: 2025, median_cents: 58_500_000, low_count: true }], house: [] },
    price_series_meta: { chip: "Observed", source_ids: ["vgv_medians"], as_of: "2026-03-31" },
  },
};
const locked: LayerResult = { layer_id: "L99-building", title: "Building", tier: "paid", status: "locked", coverage, figures: [], payload: {}, teaser: "How big the building is and who operates short stays in it." };
const gap: LayerResult = { layer_id: "L03-price", title: "Price", tier: "free", status: "gap", coverage, figures: [], payload: {}, message: "Suburb not matched: the locality could not be matched." };
const notCovered: LayerResult = { layer_id: "L09-suburb-compare", title: "Compare", tier: "free", status: "not_covered", coverage, figures: [], payload: {}, message: "Suburb adjacency is not published." };
const errored: LayerResult = { layer_id: "L98-flaky", title: "Flaky", tier: "free", status: "error", coverage, figures: [], payload: {}, message: "The source could not be reached." };

function model(layers: LayerResult[]): ReportModel {
  return {
    report_version: 1, request_id: "r", generated_at: "2026-11-20T01:00:00.000Z", reader_view: "investor",
    address: {
      gnaf_pid: "GAVIC100000002", building_id: "b", sal_code: "20786", sal_name: "Docklands", sal_match_type: "exact", state: "VIC", match: "unit",
      unit_requested: null, is_multi_unit: true, tier: "A", display_address: "310/628 Flinders Street, Docklands VIC 3008", unit_number: "310", flat_type: "UNIT",
      level_number: "3", building_name: "Tower One", street_number: "628", street: "Flinders Street", locality: "Docklands", postcode: "3008", lat: -37.8, lon: 144.9,
      gnaf_as_of: "2026-08-31", suburb_as_of: "2026-08-31",
    },
    header: { title: "310/628 Flinders Street, Docklands VIC 3008", subtitle: "DOCKLANDS VIC 3008", match_note: null },
    layers,
  };
}
const html = (m: ReportModel) => renderToStaticMarkup(<ReportView model={m} />);

describe("free layers", () => {
  const out = html(model([rent, history]));
  it("show the header, a section per layer, figures formatted by unit, and a chip on every figure", () => {
    expect(out).toContain("310/628 Flinders Street, Docklands VIC 3008");
    expect(out).toContain("What does it rent for?");
    expect(out).toContain("$800 a week");
    expect(out).toContain("+6.7%");
    expect(out.match(/data-figure=/g)).toHaveLength(3);
    // one chip per figure tile, plus the table chip and the page-level chips
    for (const chip of ["Observed", "Estimated", "Unknown"]) expect(out).toContain(`<i></i>${chip}</span>`);
    expect(out).toContain("Homes Victoria, as at 30 Jun 2026");
  });
  it("a missing figure reads Not available, never a zero, and keeps its note", () => {
    expect(out).toContain("Not available");
    expect(out).toContain("No price for this kind of home.");
  });
  it("the price history table is drawn from the payload with its chip and low-count mark", () => {
    expect(out).toContain("Annual median price");
    expect(out).toContain("$599,000");
    expect(out).toContain("$585,000 *");
  });
  it("no unlock bar when nothing is locked", () => {
    expect(out).not.toContain("unlockbar");
  });
});

describe("locked layer (AD-3)", () => {
  const withSecret: LayerResult = { ...locked, payload: {}, figures: [] };
  const out = html(model([rent, withSecret]));
  it("renders the teaser, a lock card and a link to checkout", () => {
    expect(out).toContain("How big the building is and who operates short stays in it.");
    expect(out).toContain("Included in the full report");
    expect(out).toContain('href="/checkout/GAVIC100000002"');
    expect(out).toContain("Unlock this address");
    expect(out).toContain("unlockbar");
  });
  it("holds no figure value for the locked layer: the section has no figure tile and the secret is nowhere in the HTML", () => {
    const start = out.indexOf('data-layer="L99-building"');
    expect(start).not.toBe(-1);
    expect(out.slice(start)).not.toContain("data-figure");
    const leakyFigure = fig("k", "Secret", SECRET, "count", "Observed");
    const forms = [String(SECRET), formatFigure(leakyFigure), "424,242,424"];
    for (const form of forms) expect(out).not.toContain(form);
    // even a (contract-violating) value on a locked layer would never be drawn, raw or formatted
    const leaky = { ...locked, figures: [leakyFigure], payload: { secret: SECRET } } as LayerResult;
    const leakyOut = html(model([leaky]));
    expect(leakyOut).toContain('data-layer="L99-building"');
    for (const form of forms) expect(leakyOut).not.toContain(form);
  });
});

describe("tier chip", () => {
  const paidOk: LayerResult = { ...rent, layer_id: "L50-paid-ok", tier: "paid" };
  const chipFor = (l: LayerResult) => {
    const out = html(model([l]));
    const start = out.indexOf('<div class="sh">');
    return out.slice(start, out.indexOf("</div>", start));
  };
  it("a paid layer shows Unlocked only when its status is ok", () => {
    expect(chipFor(paidOk)).toContain("Unlocked");
    for (const l of [gap, notCovered, errored]) {
      const chip = chipFor({ ...l, tier: "paid" });
      expect(chip, l.status).not.toContain("Unlocked");
      expect(chip, l.status).toContain("Full report");
    }
    expect(chipFor(locked)).toContain("Full report");
    expect(chipFor(rent)).toContain("Free");
  });
});

describe("provenance", () => {
  it("joins only the parts that exist: no leading comma without a source", () => {
    expect(provenanceText([], "2026-03-31")).toBe("as at 31 Mar 2026");
    expect(provenanceText(["vgv_medians"], null)).toBe("Valuer-General Victoria");
    expect(provenanceText(["vgv_medians"], "2026-03-31")).toBe("Valuer-General Victoria, as at 31 Mar 2026");
    expect(provenanceText([], null)).toBe("");
  });
});

describe("L09 side-by-side table", () => {
  const columns = [
    { key: "median_unit_price", label: "Median unit price", unit: "AUD_cents", chip: "Observed", source_ids: ["vgv_medians"], as_of: "2026-03-31", note: "Latest March-quarter median." },
    { key: "gross_yield", label: "Gross yield", unit: "fraction", chip: "Estimated", source_ids: ["homes_victoria_rents", "vgv_medians"], as_of: "2026-03-31", note: "Derived: weekly rent x 52 over the median price." },
  ];
  const rows = [
    { sal_code: "1", name: "Docklands", is_subject: true, values: { median_unit_price: 56_650_000, gross_yield: 0.073 }, thin: ["gross_yield"] },
    { sal_code: "2", name: "Melbourne", is_subject: false, values: { median_unit_price: 49_000_000, gross_yield: null }, thin: [] },
    { sal_code: "3", name: "Southbank", is_subject: false, values: { median_unit_price: "oops", gross_yield: { x: 1 } }, thin: [] },
  ];
  const l09: LayerResult = { layer_id: "L09-suburb-compare", title: "Compare", tier: "free", status: "ok", coverage, figures: [], payload: { table: { columns, rows } } };
  const out = html(model([l09]));
  it("draws each suburb row and marks the subject row", () => {
    expect(out).toContain("Docklands (this suburb)");
    expect(out).toContain("Melbourne");
    expect(out.match(/<tr class="me">/g)).toHaveLength(1);
  });
  it("formats numbers by the column unit and marks a thin cell", () => {
    expect(out).toContain("$566,500");
    expect(out).toContain("7.3% *");
    expect(out).not.toContain("$566,500 *");
  });
  it("a null, or any non-number, reads Not available", () => {
    expect(out.match(/Not available/g)).toHaveLength(3);
    expect(out).not.toContain("oops");
  });
  it("each column header carries its chip and the method note is listed under the table", () => {
    expect(out).toContain("<i></i>Observed</span>");
    expect(out).toContain("<i></i>Estimated</span>");
    expect(out).toContain("Derived: weekly rent x 52 over the median price.");
    expect(out).toContain("Latest March-quarter median.");
    expect(out).toContain("Homes Victoria, Valuer-General Victoria, as at 31 Mar 2026");
  });
  it("a malformed table draws nothing rather than guessing", () => {
    const bad = html(model([{ ...l09, payload: { table: { columns: [{ key: 1 }], rows } } }]));
    expect(bad).not.toContain("<table");
  });
});

describe("report header date", () => {
  it("shows the Melbourne date, not the UTC date", () => {
    const m = model([rent]);
    m.generated_at = "2026-11-20T14:00:00.000Z";
    expect(html(m)).toContain("Report generated 21 Nov 2026");
  });
});

describe("failed view", () => {
  it("offers a retry button only when a retry is wired", () => {
    const base = { kind: "failed" as const, title: "The report did not load.", message: "Something went wrong." };
    expect(renderToStaticMarkup(<ReportMessage {...base} onRetry={() => {}} />)).toContain("Try again");
    expect(renderToStaticMarkup(<ReportMessage {...base} />)).not.toContain("Try again");
  });
});

describe("gap, not_covered and error layers", () => {
  const out = html(model([rent, gap, notCovered, errored]));
  it("show their message in place", () => {
    expect(out).toContain("Suburb not matched: the locality could not be matched.");
    expect(out).toContain("Suburb adjacency is not published.");
    expect(out).toContain("The source could not be reached.");
  });
  it("leave the other sections rendering", () => {
    expect(out).toContain("$800 a week");
    expect(out.match(/<section /g)).toHaveLength(4);
    expect(out).toContain('data-status="ok"');
  });
});

describe("views without a report", () => {
  it("not covered: says only Victoria is covered, with the API's own words and a search box", () => {
    const out = renderToStaticMarkup(<ReportMessage kind="not_covered" title={NOT_COVERED.title} message="This address is outside the states VicProp covers. Only Victoria is loaded." />);
    expect(out).toContain("Only Victoria is covered for now.");
    expect(out).toContain("Only Victoria is loaded.");
    expect(out).toContain('role="combobox"');
  });
  it("unknown or missing pid: a not-found view with a search box", () => {
    const out = renderToStaticMarkup(<ReportMessage kind="not_found" title={NOT_FOUND.title} message={NOT_FOUND.text} />);
    expect(out).toContain(NOT_FOUND.title);
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-expanded="false"');
  });
  it("the generating state lists the steps and marks the finished ones", () => {
    const out = renderToStaticMarkup(<GeneratingState progress={2} />);
    expect(out.match(/class="on"/g)).toHaveLength(2);
    expect(out).toContain("Building the report");
  });
});

describe("narrow screen", () => {
  const css = readFileSync(new URL("../pine.css", import.meta.url), "utf8");
  const narrow = css.slice(css.indexOf("@media (max-width: 580px)"));
  it("collapses grids to one column at 580px and stacks the search", () => {
    expect(narrow).toMatch(/\.cards4, \.cat \{ grid-template-columns: 1fr; \}/);
    expect(narrow).toMatch(/\.af \.row \{ flex-direction: column; \}/);
  });
  it("tables scroll inside their own wrapper and the page clips overflow", () => {
    expect(css).toMatch(/\.tw \{ overflow-x: auto;/);
    expect(css).toMatch(/\.site \{[^}]*overflow-x: clip/);
  });
});

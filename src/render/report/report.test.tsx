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
import { Calculator, fromFieldText, readCalculator, toFieldText } from "./ReturnCalculator";

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

// ---------------------------------------------------------------- L05 calculator, L15 conditions, L13 questions

const calcInputs = [
  { key: "price", label: "Purchase price", unit: "AUD_cents", default: 56_650_000, basis: "Valuer-General median unit price for the March quarter 2026, for the suburb, not this home", placeholder: false },
  { key: "weekly_rent", label: "Weekly rent", unit: "AUD_cents_per_week", default: 80_000, basis: "Homes Victoria median", placeholder: false },
  { key: "vacancy_weeks", label: "Weeks vacant each year", unit: "weeks", default: 2, basis: "placeholder, set your own", placeholder: true },
  { key: "management_fee", label: "Property management fee, share of rent collected", unit: "fraction", default: 0.07, basis: "placeholder, set your own", placeholder: true },
  { key: "council_rates", label: "Council rates and water, a year", unit: "AUD_cents", default: 200_000, basis: "placeholder, set your own", placeholder: true },
  { key: "insurance", label: "Landlord insurance, a year", unit: "AUD_cents", default: 60_000, basis: "placeholder, set your own", placeholder: true },
  { key: "owners_corporation", label: "Owners corporation fees, a year", unit: "AUD_cents", default: 300_000, basis: "placeholder, set your own", placeholder: true },
  { key: "maintenance", label: "Repairs and maintenance, a year", unit: "AUD_cents", default: 100_000, basis: "placeholder, set your own", placeholder: true },
  { key: "deposit_share", label: "Deposit, share of the price", unit: "fraction", default: 0.2, basis: "placeholder, set your own", placeholder: true },
  { key: "interest_rate", label: "Loan interest rate, a year", unit: "fraction", default: 0.06, basis: "placeholder, set your own", placeholder: true },
  { key: "growth_rate", label: "Price growth, a year", unit: "fraction", default: 0, basis: "placeholder, set your own", placeholder: true },
  { key: "horizon_years", label: "Years to hold", unit: "years", default: 5, basis: "placeholder, set your own", placeholder: true },
];
const calcPayload = { calculator: { label: "x", sources: [{ key: "price", source_ids: ["vgv_medians"], as_of: "2026-03-31" }], inputs: calcInputs, history: { price_cagr_5y: -0.0152 } } };
const l05: LayerResult = { layer_id: "L05-return", title: "Return", tier: "free", status: "ok", coverage, figures: [], payload: calcPayload };

describe("L05 return calculator", () => {
  const out = html(model([l05]));
  it("shows the section under its question, the starting inputs as text fields, and where each sourced figure came from", () => {
    expect(out).toContain("What could it return?");
    expect(out).toContain('value="566500"');
    expect(out).toContain('value="800"');
    expect(out).toContain('value="7"'); // 0.07 shown as a percent
    expect(out).toContain("Valuer-General median unit price for the March quarter 2026, for the suburb, not this home (Valuer-General Victoria, as at 31 Mar 2026)");
  });
  it("labels every placeholder default and says it is an illustration", () => {
    expect(out.match(/placeholder, set your own/g)?.length).toBe(10);
    expect(out).toContain("An illustration with your own numbers, not a promise");
  });
  it("works the outputs out from the defaults with the shared function, with growth at 0%", () => {
    expect(out).toContain("7.3%"); // gross yield 80,000 x 52 / 56,650,000
    expect(out).toMatch(/data-calc="value_after"[^>]*>.*?\$566,500/);
  });
  it("shows the past growth as history only, not as an input", () => {
    expect(out).toContain("Past 5-year price growth, for history only: -1.5%");
    expect(out).not.toContain('name="price_cagr_5y"');
  });
  it("a blank rent, and bad text, give Not available outputs and never NaN", () => {
    const bad = renderToStaticMarkup(<Calculator inputs={readCalculator(calcPayload)!.inputs} history={null} typed={{ weekly_rent: "", price: "abc", owners_corporation: "-3", growth_rate: "oops" }} />);
    expect(bad).not.toMatch(/NaN|undefined|Infinity/);
    expect(bad).toContain('aria-invalid="true"');
    for (const k of ["gross_yield", "net_yield", "cash_flow", "value_after"]) {
      expect(bad, k).toMatch(new RegExp(`data-calc="${k}"[^>]*><div class="cap">[^<]*</div><div class="val na">Not available`));
    }
  });
  it("a negative growth rate is allowed, and only that one", () => {
    const o = renderToStaticMarkup(<Calculator inputs={readCalculator(calcPayload)!.inputs} history={null} typed={{ growth_rate: "-10", horizon_years: "1", council_rates: "-1" }} />);
    expect(o).toMatch(/data-calc="value_after"[^>]*>.*?\$509,850/);
    expect(o).toMatch(/data-calc="net_income"[^>]*><div class="cap">[^<]*<\/div><div class="val na">Not available/);
  });
  it("text to value and back, in dollars, percent and plain numbers", () => {
    expect(toFieldText("AUD_cents", 56_650_000)).toBe("566500");
    expect(toFieldText("AUD_cents_per_week", 80_050)).toBe("800.5");
    expect(toFieldText("fraction", 0.0733)).toBe("7.33");
    expect(toFieldText("weeks", null)).toBe("");
    expect(fromFieldText("AUD_cents", "$566,500")).toBe(56_650_000);
    expect(fromFieldText("fraction", "6.5%")).toBe(0.065);
    expect(fromFieldText("weeks", " ")).toBeNull();
    expect(fromFieldText("weeks", "two")).toBeNull();
  });
  it("fromFieldText takes plain numbers only: no decimal comma, exponent, inner space or lone symbol", () => {
    // read as typed
    expect(fromFieldText("weeks", "1,234")).toBe(1234);
    expect(fromFieldText("weeks", "1,234,567.5")).toBe(1_234_567.5);
    expect(fromFieldText("AUD_cents", "-$12.50")).toBe(-1250);
    expect(fromFieldText("weeks", "-3")).toBe(-3);
    expect(fromFieldText("weeks", "0.5")).toBe(0.5);
    expect(fromFieldText("fraction", " 7% ")).toBe(0.07);
    // not numbers: the field is flagged instead of being read as something else
    for (const bad of ["1,5", "1e3", "2 0", "$", "%", "$%", "-", ".", "1,23", "12,3456", "1,2345", "1.2.3", "1..2", "5.", ".5", "--1", "$-5", "0x10", "Infinity", "1,234,56"]) {
      expect(fromFieldText("weeks", bad), bad).toBeNull();
    }
  });
  it("a typed 1,5 or 1e3 flags the field and blanks the outputs that need it, rather than reading 15 or 1000", () => {
    const o = renderToStaticMarkup(<Calculator inputs={readCalculator(calcPayload)!.inputs} history={null} typed={{ vacancy_weeks: "1,5", horizon_years: "1e3" }} />);
    expect(o.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(o).toMatch(/data-calc="rent_collected"[^>]*><div class="cap">[^<]*<\/div><div class="val na">Not available/);
    expect(o).toMatch(/data-calc="value_after"[^>]*><div class="cap">[^<]*<\/div><div class="val na">Not available/);
  });
  it("says what the calculator leaves out", () => {
    expect(out).toContain("Not included: stamp duty, other buying and selling costs, land tax and the effect of tax");
  });
  it("a payload that is not the shape the layer writes draws nothing", () => {
    expect(readCalculator({})).toBeNull();
    expect(readCalculator({ calculator: { inputs: [{ key: "price" }] } })).toBeNull();
    expect(readCalculator({ calculator: { inputs: [{ key: "evil", label: "x", unit: "AUD_cents" }] } })).toBeNull();
    expect(html(model([{ ...l05, payload: { calculator: "no" } }]))).not.toContain("calc-grid");
  });
});

const ratingPayload = {
  mode: "rating",
  label: "Conditions rating, not a price forecast",
  rating: { fifth: 5, fifth_label: "Bottom fifth", position: 438, of: 441 },
  validation: { low: 0.74, high: 0.8, range: "74% to 80%", windows: "4 windows, 2016 to 2025", checked_on: "2026-11-14" },
  meta: { chip: "Estimated", source_ids: ["conditions_rating", "abs_census_2021", "vgv_medians"], as_of: "2021-08-10" },
};
const l15Rating: LayerResult = { layer_id: "L15-conditions", title: "Conditions", tier: "free", status: "ok", coverage, figures: [fig("flat_share", "Households in flats or apartments", 0.978, "fraction", "Observed")], payload: ratingPayload };
const l15Profile: LayerResult = {
  ...l15Rating,
  payload: { mode: "profile", profile_note: "Descriptive, not a rating. These are Census facts about the suburb. The conditions rating is shown only where it has passed a test." },
};

describe("L15 conditions", () => {
  it("rating mode: the conditions-rating heading, five fifths with the suburb's marked, the label and the test result from the payload", () => {
    const out = html(model([l15Rating]));
    expect(out).toContain("What are the suburb&#x27;s conditions?");
    expect(out).toContain("Conditions rating, not a price forecast");
    expect(out.match(/<li[^>]*aria-current="true"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="true"><span>Bottom<\/span>/);
    expect(out).toContain("Bottom fifth: position 438 of 441 rated suburbs.");
    expect(out).toContain("4 windows, 2016 to 2025");
    expect(out).toContain("74% to 80% of pairs");
    expect(out).toContain("Checked 14 Nov 2026.");
    expect(out).toContain("VicProp conditions rating, ABS Census 2021, Valuer-General Victoria, as at 10 Aug 2021");
  });
  it("profile mode: the profile heading, 'Descriptive, not a rating', and no fifths at all", () => {
    const out = html(model([l15Profile]));
    expect(out).toContain("What does the suburb profile look like?");
    expect(out).not.toContain("What are the suburb");
    expect(out).toContain("Descriptive, not a rating.");
    expect(out).not.toMatch(/fifths|aria-current|Bottom fifth|position \d/);
  });
  it("a rating-mode payload with a malformed rating draws no band", () => {
    const out = html(model([{ ...l15Rating, payload: { ...ratingPayload, rating: { fifth: 9, fifth_label: "x", position: 1, of: 2 } } }]));
    expect(out).not.toContain("fifths");
  });
});

const trig = { text: "24.3% of private dwellings in the suburb were unoccupied on Census night (2021 Census).", chip: "Observed", source_ids: ["abs_census_2021"], as_of: "2021-08-10" };
const l13: LayerResult = {
  layer_id: "L13-questions", title: "Questions", tier: "free", status: "ok", coverage, figures: [],
  payload: {
    questions: [
      { id: "unoccupied-high", question: "How many apartments in this building sit empty?", why: "It describes the suburb, not this building.", ask: "owners corporation", standard: false, trigger: trig },
      { id: "std-sales", question: "What have comparable homes sold for?", why: "A median cannot tell you.", ask: "agent", standard: true, trigger: null },
      { id: "orphan", question: "A question with no fact and not standard", why: "", ask: "agent", standard: false, trigger: null },
    ],
  },
};

describe("L13 questions", () => {
  const out = html(model([l13]));
  it("a prompted question carries the report fact, its chip and its source", () => {
    expect(out).toContain("What should I ask next?");
    expect(out).toContain("How many apartments in this building sit empty?");
    expect(out).toContain("Prompted by: 24.3% of private dwellings in the suburb were unoccupied");
    expect(out).toContain("<i></i>Observed</span>");
    expect(out).toContain("ABS Census 2021, as at 10 Aug 2021");
    expect(out).toContain("Ask the owners corporation");
  });
  it("a standard question is marked standard", () => {
    expect(out).toContain('data-question="std-sales" data-standard="true"');
    expect(out).toContain("Standard question");
  });
  it("a question that is neither prompted by a fact nor standard is not drawn", () => {
    expect(out).not.toContain("A question with no fact");
  });
});

describe("narrow screen: new sections", () => {
  const css = readFileSync(new URL("../pine.css", import.meta.url), "utf8");
  it("the calculator stacks and the fifths stack on a phone", () => {
    expect(css.slice(css.indexOf("@media (max-width: 860px)"))).toMatch(/\.calc-grid \{ grid-template-columns: 1fr; \}/);
    expect(css.slice(css.indexOf("@media (max-width: 580px)"))).toMatch(/\.fifths \{ grid-template-columns: 1fr; \}/);
  });
});

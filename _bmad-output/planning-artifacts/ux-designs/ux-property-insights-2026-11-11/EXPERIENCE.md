---
name: VicProp Property Insight Report
status: draft
updated: 2026-11-11
sources:
  - BENCHMARK-1.md
  - _bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/DESIGN.md
  - _bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/research.md
---

# VicProp Property Insight Report: Experience Spine

> Draft. Items tagged `[ASSUMPTION]` were chosen by the facilitator and need Azwaan's confirmation. Mocks: `mockups/property-report.html` (interactive web) and `mockups/VicProp-Insight-Report-310-628-Flinders-St-midnight-investor.pdf` (A4 PDF). Both are built by `scripts/28-build-report.mjs`. The spine wins on conflict.

## Foundation

**The report is the product.** The primary deliverable is a dated A4 PDF for one property. The same content also renders as an interactive web page (reader switch, style switch, live scenario calculator) for use inside the app. `DESIGN.md` is the visual identity reference; Midnight is the chosen skin and four others stay swappable (decision 2026-11-11).

**Not a Domain wrapper.** The report's value is joining sources that no single free page joins: official suburb price history and rents, short-stay income, supply pipeline, planning, a price-driver model and building-level evidence. Domain and realestate.com.au are benchmarks and, for sales and listings, inputs of uncertain licence. Nothing in the report may depend on displaying "powered by" another provider (decision 2026-11-11, see research addendum).

**One layout, three readers.** The section order is fixed. A reader switch (investor, renter, buyer to live) changes only the opening snapshot, the section relevance tags, and the questions to ask. It never hides evidence.

| Reader | Core question | Sections that matter most |
|---|---|---|
| Investor | Is the income worth the price, and where else could I invest? | 2, 3, 4, 5, 6, 7, 8, 10, 11 |
| Renter | Is this fair, and what should I ask before I sign? | 1, 2, 8, 9, 11, 13 |
| Buyer to live | Am I paying the right price and what will it cost to own? | 3, 4, 7, 8, 11, 12 |

Teams that use it: City Retreats acquisition callers (call or skip), buyer's agents and investors (what to offer), mortgage brokers (briefing a client), property managers and renters (rent comparison).

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Property report (PDF) | Export from the property page, or generated on request | The whole report as a dated, shareable document |
| Property page (web) | Search by address, map pin, CRM list row | The same report, interactive |
| Building page | Link from the property page | All units, sales, rents, short-stay activity and building findings for one building |
| List / map | App open | Filter and prioritise properties (existing CRM flow) |
| Suburb screener | Section 10 link | Rank suburbs on growth, yield, supply |
| Settings | Avatar menu | Thresholds, data sources, scraper criteria |

Report order, fixed, each numbered section framed as a question and grouped into five lettered parts:

- **Cover and snapshot:** address, facts, six key figures, reader snapshot, how to read the evidence labels.
- **A The property:** 1 What is this property? 2 What does it rent for? 3 What is it worth?
- **B The investment case:** 4 What makes it worth more or less? 5 What would the return be, and what if prices move? 6 Could it work as an Airbnb?
- **C The market:** 7 How have prices moved? 8 What new apartments are coming? 9 How does the suburb compare with nearby ones? 10 Where else could you invest?
- **D The building and the rules:** 11 What do we know about the building? 12 What does the planning say?
- **E Decide:** 13 What should you ask next? 14 Where did all this come from?

The web page adds a sticky contents list at 1024px and above. **The PDF has no navigation**, only the part banners and page numbers. [ASSUMPTION] Building page and the suburb screener are specified here as destinations only.

## Voice and Tone

Plain, specific, unhedged where the evidence is solid and honest where it is not. No mannered devices, no scare quotes, no forecasts.

| Do | Don't |
|---|---|
| "Docklands unit prices moved -0.6% a year over five years." | "Prices are set to rebound." |
| "Unknown. No record of building short-stay rules. Ask the owners corporation." | "Short stays may be allowed." |
| "AirDNA estimate, low confidence (40/100)." | "Estimated income: $59,714" with no qualifier |
| "Two sources disagree: furnished, yes (CRM) / no (listing)." | Silently choosing one |
| "A newer, lower sale on Domain is not in our set. Our middle price may be too high." | Quietly dropping the conflicting sale |
| "At 0% growth the return comes almost entirely from rent." | "A safe investment." |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Answer-first section | Every numbered section | Question heading, one-sentence **Short answer** with the key number, evidence, **How sure are we?** (High / Medium / Low plus the reason), **In plain English**, then **Sources** with dates. |
| Key-figure strip | Cover | Exactly six figures that answer "is this worth a closer look": rent, middle sale price, gross yield, suburb growth, short-stay estimate, same-layout competition. Each carries one evidence chip. |
| Reader snapshot | Cover | One lead sentence, then four chip-led points. Written per reader. Switchable on web; fixed per PDF. |
| Reader tag | Section header (web) | "Key for investors", "Background" or none. Hidden in the PDF. |
| Evidence chip | Beside every figure | Observed, Estimated (includes Derived), Unknown, Conflict. Web: click opens a popover with source, date, match type, confidence. |
| Comparison chart | Rent, sales, drivers, history, supply, screener | Places the subject against a benchmark. Every mark is labelled in words; a chart never carries the only copy of a number. |
| Gap placeholder | Anywhere evidence is missing | States the question, why it matters, one next step. |
| Scenario calculator | Section 5 | Web: purchase price, deposit, interest rate, rent, vacancy, running costs, growth rate (slider, with "use Docklands history" and "use 0%") and hold period; live outputs (value, equity, net yearly cash, gain on cash, yearly return) and a value-over-time chart. PDF: a static assumptions table and the same outputs at the history rate. Example inputs are labelled as examples; the result is an illustration, never a forecast. |
| Price-driver chart | Section 4 | Effect of each feature on price with error whiskers; effects that are not statistically clear are drawn grey and labelled "not clear". |
| Site plan | Section 8 | Subject at the centre, 200 m rings to 800 m, projects sized by dwellings and coloured by stage; the five largest are numbered and keyed. |
| Suburb screener | Section 10 | Scatter of 5-year price growth against gross yield for suburbs with enough sales, plus a ranked table. Ranking is a simple equal-weight rank, labelled as such, never a recommendation. |
| Evidence table | Sales, rents | Like-for-like rows marked; weaker rows muted with a reason. Web: sortable, with a toggle to show all rows. |
| Questions to ask | Section 13 | Three lists (investor, renter, buyer) generated from the report's gaps. Answers, once recorded, flow back as dated findings that later units in the building inherit. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Loading | Web | Skeleton cards in section order; each fills as its source returns. |
| Source failed | Any card | Card renders with an Unknown chip and "Could not reach {source}. Retry." Others are unaffected. |
| Unit not found in official address data | Cover | Banner: "Matched to building only, not this unit." Unit-level claims are suppressed. |
| No like-for-like sales | Section 3 | Gap placeholder plus the nearest alternatives, labelled weaker. |
| Sources disagree | Any figure | Conflict chip; both values shown with their sources (for example, a newer Domain sale missing from our set). |
| Stale | Any card | Caption turns amber past the source's refresh window; "Refresh" action. |
| Thin suburb data | Section 10 | Suburbs below the sales threshold are not ranked and are drawn faint. |
| Export | PDF | Every chip, source and date preserved; scenario inputs listed as assumptions; page footer carries the report reference and page count. |

## Interaction Primitives

Web: `j` `k` move between sections; `e` exports the PDF; `c` opens the call outcome. Hover on a chip previews its source; click pins it. The reader switch and the style switch persist per user. PDF: static; page breaks never split a chart, tile or table row, and headings stay with their first lines.

## Accessibility Floor

WCAG 2.2 AA in every skin. Evidence status is conveyed by word as well as colour. Tables have captions and header cells; every chart has a text label and an accessible name that states its main reading. The web contents list is a navigation landmark. Hatched gap placeholders carry visible text. The PDF is tagged with real headings so it can be navigated in a reader. [ASSUMPTION] PDF tagging depends on the render path and is not yet verified.

## Responsive & Platform

| Surface | Behavior |
|---|---|
| PDF | A4 portrait. Single column. Tiles and tables reflow to the narrower page; the cover band keeps two columns. |
| Web ≥ 1024px | Contents list left, reading column right, sticky toolbar. |
| Web 640 to 1023px | Single column; contents list hidden. |
| Web < 640px | Single column; tables scroll inside their own container. [ASSUMPTION] Phone use is for read-only checks on inspection day. |

## Inspiration & Anti-patterns

- **Lifted from financial statements:** footnoted sources, ranges beside point values, a plain-language summary before the detail.
- **Rejected: a single "score" or "grade" for the property.** It would hide the separation between observed, estimated and unknown.
- **Rejected: auto-filling blanks with estimates.** A missing fact stays missing.
- **Rejected: forecasts.** History and reader-set scenarios only; an own forecast raises a financial-advice licensing question that is unresolved.
- **Rejected: a Domain-attributed report.** The value must come from the joined view, not from relaying one provider.
- **Rejected: treating a nearby Airbnb comp as proof that short stays are allowed in this building.**

## Key Flows

### Flow 1: Call or skip (Tom, City Retreats acquisition caller, Tuesday morning)

1. Tom opens his prioritised list and clicks `310/628 Flinders Street, Docklands`.
2. The cover shows asking rent $675/wk, a 6.9% gross yield, a $61k short-stay estimate (estimated, strong), and the snapshot line "Rules in the building are unknown".
3. He jumps to section 6: 53 active Airbnb listings in the building, 40 run by professional operators, 12 of ours already there.
4. Section 11 shows no owners corporation record. Section 13 says "Ask the agent whether the owners corporation restricts short stays".
5. Climax: he taps Call, asks the question, and records the outcome "Building allows, agent friendly". The unknown becomes a dated finding that every later unit in the building inherits.

### Flow 2: Is the price right? (Mei, buyer's agent, client wants 2-beds in Docklands)

1. Mei reads the investor snapshot: 6.9% yield at the middle sale price, 7.9% at the latest Domain sale, and prices flat for ten years.
2. Section 3 shows the sales in this building. A conflict note says the newest same-layout sale, $445,000, is lower than all five we hold.
3. Section 4 shows that seven of 21 homes for sale are the same layout, with asking ranges from $370,000.
4. She sets the purchase price to $480,000 in the calculator and sees the return at 0% and at the Docklands history rate, marked as her inputs.
5. Climax: net yield cannot be shown; a gap says "Owners corporation fees unknown" with the action to request the certificate. She exports the PDF so her client sees what is known and what is not.

### Flow 3: Where else? (Rahul, investor, comparing Docklands with other suburbs)

1. Rahul reads section 7: Docklands unit prices have not grown in ten years while rents rose.
2. Section 10 plots 26 suburbs by growth and yield. Frankston and Dandenong sit lower on yield and higher on growth.
3. Climax: he reads "which is better depends on whether you need income now or growth later" and chooses a suburb to open next, with the limits (all-unit prices, history only) stated beside the chart.

### Flow 4: Is this rent fair? (Priya, renter, the renter view)

1. Priya switches the reader to Renter. The snapshot says the unit is second-lowest of 12 similar units and has been advertised 65 days.
2. Section 2 compares against the building and the official suburb median; section 8 shows supply that may soften rents.
3. Climax: section 13 gives her five questions to put to the agent, including who is allowed to run short stays in the building.

## Open Items

- [ASSUMPTION] Product name "VicProp" is a placeholder.
- [ASSUMPTION] Window for "recent" sales (6 months) and the like-for-like rule (same beds, baths, parking).
- Building page and the suburb screener page are not designed.
- Renter and buyer PDFs are produced by the same build but have not been reviewed page by page.
- Decide whether scenario inputs persist per property and per user, and whether the PDF should embed the reader's own inputs.
- Image rights for listing photographs are unresolved; the cover uses an illustration.
- Licensing and terms for realestate.com.au (via a third-party API) and for Domain content are unresolved.
- Whether a suburb forecast can be shown, and under what licence, is unresolved.

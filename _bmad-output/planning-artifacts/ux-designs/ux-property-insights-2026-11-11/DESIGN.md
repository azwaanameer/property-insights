---
name: VicProp Property Insight Report
status: draft
updated: 2026-11-11
sources:
  - BENCHMARK-1.md
  - _bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/research.md
description: Premium, evidence-led report for one Melbourne apartment, delivered as an A4 PDF and an interactive web page. Dark slate and gold by default (Midnight), with four swappable skins. Every number carries its source and its certainty.
skin-default: midnight
colors:
  # Midnight is the chosen default (Azwaan, 2026-11-11). Values are the shipped tokens in scripts/28-build-report.mjs.
  canvas: '#0A101C'
  surface: '#111A2B'
  surface-2: '#16213A'
  ink: '#E8EDF6'
  ink-muted: '#9BA9C2'
  line: '#243350'
  accent: '#E2B65C'
  accent-foreground: '#1A1405'
  accent-2: '#6FB4FF'
  wash: '#1B2944'
  cover: '#0E1729'
  cover-ink: '#EAF0FA'
  # Evidence certainty: the load-bearing semantic set. Each pairs a text colour with a fill.
  observed: '#6DD3A0'
  observed-wash: '#12302A'
  estimated: '#F0BE5A'
  estimated-wash: '#33290E'
  unknown: '#B9A9F0'
  unknown-wash: '#272047'
  conflict: '#FF8F85'
  conflict-wash: '#3B1C1A'
typography:
  # Google Fonts. Tabular numerals on every figure.
  display:
    fontFamily: 'Space Grotesk, system-ui, sans-serif'
    fontSize: 54px
    fontWeight: '600'
    lineHeight: '1.04'
  heading:
    fontFamily: 'Space Grotesk, system-ui, sans-serif'
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.25'
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  figure:
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace'
    fontSize: 23px
    fontWeight: '600'
    lineHeight: '1.15'
    fontVariantNumeric: tabular-nums
  caption:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.35'
rounded:
  sm: 6px
  md: 10px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '6': 24px
  '8': 32px
components:
  evidence-chip:
    radius: '{rounded.full}'
    type: '{typography.caption}'
  key-figure-strip:
    background: '{colors.surface}'
    border: '1px solid {colors.line}'
    radius: '{rounded.md}'
  part-banner:
    background: '{colors.cover}'
    foreground: '{colors.cover-ink}'
    radius: '{rounded.md}'
  section-card:
    background: '{colors.surface}'
    border: '1px solid {colors.line}'
    radius: '{rounded.md}'
    padding: '{spacing.6}'
  figure-tile:
    background: '{colors.surface-2}'
    border: '1px solid {colors.line}'
    radius: '{rounded.sm}'
    padding: '{spacing.4}'
---

## Brand & Style

**VicProp** is the working product name (a guess from a dictated message; one variable in the build script). The report is a premium due-diligence document, not a marketing page. The reader is about to commit money or a phone call, so the document is calm, dense and plain-spoken. Its organising idea is that **every figure says where it came from and how sure we are**. A settled sale, an advertised rent, a model estimate and a gap in our knowledge are four different things, and the layout never lets one pass for another.

The primary deliverable is an **A4 PDF**. The same components also drive an interactive web page with a reader switch and a style switch. Style decisions below describe Midnight; the other skins change tokens only.

## Colors

- **Canvas, surface, wash** build a dark slate ground with slightly lighter cards. Depth comes from tone and a hairline border, not from heavy shadow.
- **Accent gold** (`{colors.accent}`) marks the active control, headings of sub-blocks, the reader tag and table row highlights. **Accent blue** (`{colors.accent-2}`) marks "this property" on every chart (dashed rule and dot) and chart error bars. Neither carries evidence meaning.
- **Cover** (`{colors.cover}`) is a slightly lighter slate used for the cover band and the lettered part banners.
- **Evidence colours are the semantic core and are never decorative:**
  - **Observed** (green): a recorded fact with a source and a date.
  - **Estimated** (amber): a model or provider estimate, or a derived figure.
  - **Unknown** (violet): something the reader needs and we do not have. Drawn as a hatched placeholder, never a blank or a zero.
  - **Conflict** (red): two of our sources disagree. Both values are shown.
- Colour is never the only carrier of meaning: every chip also carries a word.

### Skins

Five complete token sets share one layout. Midnight is the default; the others stay available and are produced by one build flag.

| Skin | Character | Display / body | Corners | Best for |
|---|---|---|---|---|
| **Midnight** (default) | Dark slate, gold accent, blue "this property" | Space Grotesk / Inter | 10px | Screens, premium feel |
| Ledger | Navy and brass, formal | Newsreader / Inter | 6px | Investors, lenders, printing |
| Atlas | Bright white and teal | Manrope / Inter | 16px | Renters, first-home buyers |
| Eucalypt | Deep green and ochre | Fraunces / Inter | 10px | Long-term owners |
| Monolith | Black, white, cobalt, hard rules, uppercase headings | IBM Plex Sans / Plex Mono | 0 | Data-terminal feel |

Every skin must keep the four evidence colours legible on its own surfaces and must pass AA contrast for body text.

## Typography

Space Grotesk for the address, part names and section questions; Inter for running text; IBM Plex Mono for figures and table numbers so columns align. Type scale (web): 54 cover address, 25 part name, 22 section question, 15 body, 12 caption. In the PDF the scale drops to 33, 21, 19, 13.5, 10. Body line length stays near 70 characters. Uppercase labels carry letter-spacing.

## Layout & Spacing

- **PDF:** A4 portrait, 10 to 11 mm margins. Page 1 is the cover (address, facts, illustration, six key figures) plus the reader snapshot. A footer on pages 2 onward carries the product name, report reference and "Page X of Y". The dark ground fills the whole page including margins. No navigation.
- **Web:** content max 1260px. At 1024px and above, a 210px sticky contents list sits left of the reading column; below that it hides. A sticky toolbar holds the reader switch and the style dots.
- **Structure:** five lettered parts (A The property, B The investment case, C The market, D The building and the rules, E Decide), each opened by a part banner, containing 14 numbered question cards.
- Spacing follows the 4-based scale. Cards never split a chart, tile, gap box or table row across a page; a section heading always stays with its first lines.

## Elevation & Depth

Flat in print. On the web, Midnight uses an inset highlight and a soft large shadow on cards; Ledger, Atlas and Eucalypt use a light shadow; Monolith uses none and relies on 2px borders.

## Shapes

`{rounded.md}` for cards and the key-figure strip, `{rounded.sm}` for tiles, tables and callouts, `{rounded.full}` for chips and pills. Monolith sets all radii to zero.

## Imagery

- **Cover illustration:** a generated skyline with the subject tower highlighted in the accent colour and labelled. Skins recolour it through tokens.
- **Site plan:** a plan of the 800 m radius with rings, a north arrow, the subject at the centre, and nearby development projects as circles sized by dwellings and coloured by stage. The five largest are numbered and keyed in a table beside it.
- **Listing photographs are not used** until image rights are cleared. The cover says so.
- **Logo:** a rounded square in the accent colour holding a roofline over three rising bars.

## Components

| Component | Visual spec |
|---|---|
| Evidence chip | Pill with a leading dot, caption type. Four variants. Always sits beside the figure it qualifies. |
| Key-figure strip | Six cells in a bordered panel with a 4px accent top edge, overlapping the cover band. Each cell: small caps label, mono figure, one-line explanation, one chip. 6 across on web, 3 by 2 in print. |
| Part banner | Full-width cover-colour band with a square letter badge in the accent, part name and one line. |
| Section card | Number badge (outlined square), reader tag, question heading, **Short answer** line, evidence, **How sure are we?** strip, **In plain English** callout with a 4px accent left edge, and a **Sources** footer. |
| Reader snapshot | Large lead sentence in the display face, then four chip-led points. One variant per reader (investor, renter, buyer). |
| Figure tile | Caption, figure (mono for numbers, body face for words), sub-line, chip, source. |
| Evidence table | Dense rows, tabular numerals, right-aligned numbers. Like-for-like rows carry a left bar; weaker rows are muted with a reason; "this unit" rows are washed in the accent. |
| Gap placeholder | Hatched violet block with the question we could not answer and the next step. |
| Comparison charts | Inline SVG using only tokens. Rent ruler, sale-price strip, driver bars with error whiskers, price-history lines with direct end labels, growth-versus-yield scatter, site plan, scenario value lines. Labels carry a surface-coloured halo; no legend is needed where direct labels fit. |
| Scenario calculator | Web: editable inputs and sliders, live outputs and chart. PDF: a static assumptions table, outputs at the first growth rate, a scenario table and a chart. Inputs are marked as examples. |

## Do's and Don'ts

- **Do** put a source and a date next to every figure.
- **Do** show ranges and counts with point estimates ("$510,000 middle of 5 sales, range $496k to $532k").
- **Do** show a gap as a gap, with the next step.
- **Do** label scenario results as illustrations from inputs the reader chose.
- **Don't** blend an estimate, an advertised price and a settled sale into one number.
- **Don't** use green, amber, violet or red for anything except evidence status.
- **Don't** show a zero or an empty cell where the truth is "unknown".
- **Don't** present a forecast. History and user-set scenarios only.
- **Don't** treat observed short-stay activity in a building as permission to operate there.

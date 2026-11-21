---
title: 'Reported details and sales from a web lookup, plus house and apartment report types (build order step 2d)'
type: 'feature'
created: '2026-11-15'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vic-suburb-layers-data.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/house-mockup.artifact.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Open data gives suburb figures and a measured block size, but not the bedrooms, floor area, build year or what this house and its street sold for. Individual Victorian sales are not open data, and the owner has chosen not to wait for a licensed feed.

**Approach:** A vendor adapter searches the web for one address when a report is opened, extracts a small fixed set of facts with their page URLs, and fills three things: a reported-details tile set in L01, a paid `sales` layer, and a reported rent history line in L02. The report type (house or apartment) is chosen from the G-NAF address (a unit number or a building with many units is an apartment) and decides which sections appear. AD-11 binds.

## Boundaries & Constraints

**Always:** Each fact carries `url`, `found_on` and the chip **Reported**. Reported facts never overwrite open data; on conflict show both and say which is which. Cache in `vendor_cache` for 30 days at most, keyed by address pid, and show only to the requesting user. Extract into a zod schema; a page that does not parse is dropped, not guessed. Short-stay appears only when estimated income is at least 1.4 times long-term rent, otherwise one line says why. The adapter fails alone: a failure returns `gap` for the reported tiles and never blocks another layer (AD-9). Log every lookup in the lookup log with the URLs fetched.

**Never:** No bulk crawl, no suburb-wide or street-wide harvest, no pagination, no scheduled refresh of many addresses, no sharing of cached facts between users, no storing of page text or photos (links only). The layer text must not depend on naming the other site; the link label is the site name as shown on the page, and the layer still reads correctly without it (AD-4). No claim that a reported fact is verified.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| House with pages found | Address with a public sale and listing history | Tiles for bed, bath, car, floor area, build year; sales table with the last sale and prior sale; each with link and date | N/A |
| Same-street sales | Lookup finds neighbours | Up to 5 same-street sales in the table, flagged "not like for like" when block or beds differ by more than 20% | Drop rows missing price or date |
| Two sources disagree | Sale date 9, 24 and 25 Aug | Show the range in one cell with "sources differ" | Never pick one silently |
| No page found | New or unlisted address | `gap`: "No public property page found for this address" | `gap`, not `error` |
| Search unreachable | Provider times out | `error` for the reported tiles only; rest of the report renders | AD-9 |
| Apartment | Unit address | Reported tiles for the unit; sales table of the same building if found; Docklands layout | As above |
| Short-stay below cutoff | Income under 1.4 times rent, or no short-stay data | Section hidden; one line in the calculator note says why | N/A |
| Open and reported disagree | Measured 447 m² against reported 448 m² | Show measured as the figure and the reported value in the sub-line | Open data wins |
| Licensed feed later | `src_source` for the feed turns `cleared` | Same layer reads the feed first and the lookup second | No layer change |

</frozen-after-approval>

## Code Map

- `src/server/vendors/web-lookup.ts` — adapter: search, fetch listed pages one at a time, extract to the zod schema, write `vendor_cache`.
- `src/server/layers/l01-property.ts` — add the reported tiles when present.
- `src/server/layers/l-sales.ts` — new paid layer id `L16-sales`, read from the cache only.
- `src/server/layers/l02-rent.ts` — add the reported listing line.
- `src/server/report/report-type.ts` — house or apartment from G-NAF, and the section list for each.
- `src/server/layers/l-short-stay.ts` — apply the 1.4 times cutoff.
- `migrations/0008_reported_source.sql` — seed `src_source` row for the lookup with `rights_status: pending`.

## Tasks & Acceptance

- [ ] Adapter returns the schema for 14 Lucinda Lane, Cranbourne North: 3 bed, 2 bath, 2 car, 138 m², built 2016, sales $800,000 (22 Dec 2025) and $630,000 (6 May 2018), with URLs.
- [ ] Lookup for a made-up address returns `gap`, and the rest of the report still renders.
- [ ] The cache expires at 30 days, is keyed by address pid, and a second user does not see the first user's cached facts.
- [ ] `sales` is locked server-side for an unentitled user: the response holds no figures (AD-3).
- [ ] Report type is `house` for 14 Lucinda Lane and `apartment` for the Docklands unit, with the section lists from the two mockups.
- [ ] Short-stay is hidden for the house and shown for the Docklands unit.

## Open Questions

1. The terms of use of each site read are unconfirmed, and the owner chose to run the lookup anyway. Re-read the terms before launch to paying customers, and record the answer.
2. Which search provider runs inside the app (a search API or the Claude API web search tool), and the cost and delay per lookup. Decide on a spike with 20 real addresses and measure the hit rate.
3. Whether a sales table that depends on listing pages holds for older homes with no recent listing. Measure on the spike.

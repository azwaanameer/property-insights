---
title: 'Report batch: Return calculator, Conditions rating, What to ask next'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'fac7c205158c1e8a8da4b439aab9972e5a0ce770'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/backtest-multistate-2026-11-14.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The live report shows only five sections. The owner expected the richer report from the mockups (return, rating, questions). The mockup numbers were illustrative and must not be reused.

**Approach:** Add three real sections from data already in Neon: L05 Return (calculator with editable, labelled assumptions), L15 Conditions rating (VIC apartment suburbs only, gated by `market_validation`, AD-5), and L13 Questions (generated from what the report actually found). Same layer contract, same Pine report page. Decided by the builder: all three are `free` for now (OVERVIEW lists L15 as paid; paid cannot be sold until Stripe, the Pro cancel path and an address-specific `payableLayers` are done; moving L15 to paid is then a config change).

## Boundaries & Constraints

**Always:** Layer contract (AD-1), evidence chips, AD-4 sources cleared, AD-7 dataset pointer, AD-9 honest gaps. Rating returned only when `market_validation` for state and dwelling type is `validated` (today VIC unit); its test result, windows and date come from that row, never hard-coded. Label it a conditions rating, not a price forecast. Elsewhere (VIC house, other states): descriptive profile (owner, flat, unoccupied shares), "descriptive, not a rating", no score. Rating method is exactly the backtest's a-priori composite: z(owner share) minus z(flat share) minus z(unoccupied share), z-scored across eligible VIC suburbs (at least 300 dwellings, all three markers, unit price history), reported as a fifth and a position ("212 of 640"); stored by a pipeline in `derived_rating` (AD-8). The calculator is an illustration (AD-10): user-editable inputs, every default shown with its source or labelled "placeholder, set your own"; growth default 0%, the past 5-year rate shown only as history. Questions each name the report fact that triggered them or are marked "standard"; no invented facts. Never print `DATABASE_URL`.

**Never:** Mockup numbers or invented market facts. A score or band outside validated scope. Any predicted price or growth figure. A paid layer, Stripe or entitlement changes. Reading another layer by calling it (AD-1): L13 reads sibling results only after they ran. Touching Domain, Microburbs, short-stay or schools data.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unit, rent and price known | 310/628 Flinders St Docklands | L05 ok: gross yield = rent x 52 / price (Estimated, method in note), calculator defaults from suburb medians. L15 ok: fifth, position, three Census shares, test result row. L13 ok | N/A |
| House, price but no rent | 14 Lucinda Lane, Cranbourne North | L05 ok with rent Unknown and `needs_input: rent`; L15 profile only, no band; L13 asks about rent | N/A |
| Suburb not matched | address without SAL | L05, L15 gap with message; L13 ok with standard questions only | gap, never throw |
| Unrated suburb | fewer than 300 dwellings or a marker missing | L15 gap "not rated: reason", still shows available shares | gap |
| Validation switched off | `market_validation` VIC unit set `not_validated` | L15 shows profile, no band | N/A |
| Calculator bad input | negative, blank or non-numeric | outputs show "Not available", no NaN, no throw | N/A |
| Rating regression | published rating vs loaded VGV series | derive refuses to publish if 2021-origin pairwise falls below 70% | publish check fails, old data stays live |

</frozen-after-approval>

## Code Map

- `src/server/layers/{index.ts,types.ts}` -- registry; order L01, L02, L03, L05, L07, L09, L15, L13. Add `synthesis?: true` and `LayerContext.siblings` so L13 runs after the others.
- `src/server/services/layer-runner.ts`, `assemble-report.ts` -- two-pass run (normal layers, then synthesis with `siblings`); gate and entitlement unchanged.
- `src/server/layers/shared/{derive,figures,suburb-data}.ts` -- reuse `snapshot`, `grossYield`, `cagr`, `dwellingFamily`, `figure`, `gapFigure`, `UNIT`.
- `src/server/repos/{series,suburb,source}.ts` -- reuse `listPrices`, `listRents`, `listMarkers`; `market_validation` is read in `source.ts`. Add a rating repo reading `derived_rating` through the dataset pointer.
- `src/calc/return.ts` (new, pure) -- `calcReturn(inputs)` shared by the layer defaults and the React component.
- `src/server/layers/{L05-return,L15-conditions,L13-questions}/index.ts` (new).
- `pipeline/derive/rating.mjs` (new), `pipeline/lib/dataset.mjs` (`derived_rating` into LOADED_TABLES), `package.json` script `pipeline:rating`.
- `db/migrations/0006_return_rating_questions.sql` (new): `src_source` row `conditions_rating` (cleared, derived from cleared CC BY sources, attribution), `layer_config` rows for the three layers. Existing `derived_rating` and `market_validation` tables are reused. `spec-reported-web-lookup.md` moves to 0007.
- `src/render/report/{ReportSection,tables}.tsx`, new `ReturnCalculator.tsx`, `RatingPanel.tsx`, `QuestionsList.tsx`; `src/site/copy.ts` (`SECTION_QUESTIONS`, labels); `src/render/pine.css`.
- Tests: layer fixture tests (extend `suburb-layers.test.ts` and `testing/db.ts`), `src/calc/return.test.ts`, a pipeline test, render tests in `report.test.tsx`. Keep every existing test green.

## Tasks & Acceptance

**Execution:**
- [ ] Migration 0006, source row, layer rows; update the reported-lookup spec number.
- [ ] `pipeline/derive/rating.mjs` with checks (row count, fifths, regression floor 70%) and PGlite dry run.
- [ ] `src/calc/return.ts` with tests.
- [ ] Layers L05, L15, L13 and the synthesis pass.
- [ ] Render components and styles, headings from `SECTION_QUESTIONS`; profile heading "What does the suburb profile look like?".
- [ ] Tests per the matrix, plus a guard that no layer text contains forecast or predict wording.
- [ ] Orchestrator only, after review (the implementer must NOT touch Neon, the network or Cloudflare): run migration and `pipeline:rating` on Neon, check Docklands and Cranbourne North through the report API, build, deploy `vicprop`, smoke test. The implementer verifies with PGlite and unit tests only.

**Acceptance Criteria:**
- Given a Docklands unit, when the report loads, then L05, L15 and L13 appear with real values from Neon and no mockup number.
- Given any address outside validated scope, when the report loads, then no rating band is present anywhere in the response.
- Given the existing 358 tests, `tsc` and `npm run build`, when the batch lands, then all pass.

## Implementation Notes

**Built.** Migration `0006_return_rating_questions.sql` (source `conditions_rating`, layer rows for L05, L15, L13, all free; L15 lists `vgv_medians` too). `pipeline/derive/rating.mjs` (`npm run pipeline:rating`, also the last step of `pipeline:suburb-data`) writes `derived_rating` and refuses to publish if the 2021-origin back-test no longer reproduces at 70% or more. `src/calc/return.ts` is the pure calculator shared by the L05 defaults and the React component. Layers `L05-return`, `L15-conditions`, `L13-questions`; L13 is a synthesis layer that runs after the others and reads their results (`LayerDef.synthesis`, `LayerContext.siblings`). Components `ReturnCalculator`, `RatingPanel`, `QuestionsList`.

**Run on Neon 2026-11-21.** Migration applied; rating published as dataset version 10: 441 Victorian suburbs rated (2,141 left out under 300 dwellings, 362 without a full unit price history), fifths 89/88/88/88/88. Regression 74.8% (2021 to 2024) and 80.4% (2021 to 2025), against 74.8% and 80.5% in the original back-test. Docklands unit: bottom fifth, 438 of 441. Cranbourne North house: descriptive profile only, no band.

**Deployed and viewed in a real browser** (`vicprop`): all eight sections render, editing the rent changes the calculator output, no horizontal scroll at 390 px. A CSS bug found there (class `ph` collided with the photo-placeholder rule, stretching each note to 257 px) was fixed by renaming it `assumed`; results box made sticky on desktop.

**Decisions made without asking.** All three layers are free (OVERVIEW lists L15 as paid). Calculator placeholders are round numbers labelled as such: 2 weeks vacant, 7% management, $2,000 rates, $600 insurance, $3,000 owners corporation (units only), $1,000 maintenance, 20% deposit, 6% interest only, 5-year hold, 0% growth. Spec was over the token guideline and kept whole.

## Spec Change Log

## Review Triage Log

| # | Finding (reviewer) | Verdict | Route | Evidence |
|---|--------------------|---------|-------|----------|
| 1 | `fromFieldText` reads "1,5" as 15, accepts "1e3", lone "$" as 0 (blind, edge, gap) | medium | patch | Verified in `ReturnCalculator.tsx`: commas and `$` are stripped before `Number()`. Strict parse and field-level tests. |
| 2 | House pre-filled with a $3,000 owners corporation cost (blind) | medium | patch | Verified: `owners_corporation: 300_000` is used for every family in L05. House default 0. |
| 3 | L15 omits `vgv_medians` from source ids: attribution missing, pending VGV would not switch L15 off (blind, gap) | medium | patch | Verified in L15 `source_ids`. Added to layer list, migration and figures. |
| 4 | Validated market with null test range serves a fifth with no test result (edge) | low | patch | One-line guard, protects the AD-5 "test result beside it" rule. |
| 5 | L13 asks no rent or price question when L05 is a gap; match-unit text wrong when no unit was requested (edge) | medium | patch | Verified in L13 `needs_input` read and trigger text. |
| 6 | Most L13 triggers have no positive test, `conditions-weak` boundary untested (blind, gap) | medium | patch | Verified by the gap reviewer's search. Tests added. |
| 7 | L05 price-missing, both-missing and thin paths untested (gap) | medium | patch | Tests added. |
| 8 | Calculator does not say it excludes stamp duty, other costs, land tax and tax (blind) | medium | patch | Verified: no mention in copy or calc. One sentence added. |
| 9 | Regression check passes with zero windows; rating not in the refresh chain; siblings comment wrong (edge, blind) | low | patch | Direct corrections. |
| 10 | Rating reads dataset pointer in separate queries; a pointer move mid-run records the wrong inputs (edge) | low | defer | Needs a concurrent publish during a manual run; unlikely. |
| 11 | No serve-time freshness check that the rating matches current Census and VGV versions (blind) | medium | defer | Rating is rebuilt in `pipeline:suburb-data`; a staleness check is a follow-up. |
| 12 | Second pass gets a fresh timeout, worst case two timeouts (edge, blind) | low | defer | Layers answer in well under a second in practice. |
| 13 | L05 and L13 not state-aware (blind) | low | defer | Only Victoria is loaded, so no other address resolves today. Needed before another state. |
| 14 | Calculator has no stamp duty, land tax, loan costs or equity return inputs (blind) | medium | defer | A scope decision; the section now says what it leaves out. |
| 15 | Publish checks (fifths, ordering, shrink) have no negative tests (gap) | medium | defer | Regression check is tested; add negatives with the synthetic dataset. |
| 16 | Calculator edit and Reset wiring never executed in a test (gap) | medium | defer | No DOM test tooling in the repo; needs a browser check. |
| 17 | `getRating` unrated reason is hard-coded for units (blind, edge) | low | defer | No validated house market exists. |
| 18 | Gate checks two 2021 windows while the copy says four windows (blind) | false | reject | The 2016-origin windows need the 2016 Census, which is not loaded. The copy quotes the full backtest from `market_validation`, as AD-5 requires; the gate only checks the 2021 windows reproduce. |
| 19 | Displayed test result is not the pipeline's run (blind) | false | reject | By design: AD-5 makes `market_validation` the single source of the test result. |
| 20 | Win rate beside "says nothing about what prices will do" is mixed messaging (blind) | false | reject | AD-5 requires the test result beside the rating, with the not-a-forecast label. |
| 21 | Whole L13 or L15 section goes not_covered when one listed source is pending (edge) | false | reject | Intended: AD-4 fails closed. |
| 22 | aria-live on all result tiles; unused copy keys; duplicated constants; no print option for questions; CLI throws if backtest file missing; wrong message when dwellings marker missing (blind, edge) | low | reject | Cosmetic or unlikely, and fixes add code. |
| 23 | Calculator may be inert if the page is not hydrated (blind) | maybe-false | reject | The report is a hydrated TanStack Start route; to be confirmed in a browser check after deploy. |

## Verification

**Commands:**
- `npm test` -- expected: all tests pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: builds
- `node pipeline/derive/rating.mjs --pglite` -- expected: dry run prints fifths and the regression result

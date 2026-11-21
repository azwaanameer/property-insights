---
title: 'Pine marketing site and report page (build order step 2b)'
type: 'feature'
created: '2026-11-20'
status: 'done'
route: 'dispatch'
baseline_commit: 'a80d468ccd288ad7fe838b56a8c5c68baef41eb3'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vic-suburb-layers-data.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has one bare search page. The owner approved the Pine marketing site (mockup `_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/pine-site.artifact.html`, live at https://claude.ai/artifact/F1DMczaz2hk7o1PjKeAZwg) with new copy, but none of it exists in the app.

**Approach:** Build the home page and the report page as TanStack Start routes in the Pine style with the approved copy, wired to the real suggest, resolve and report endpoints. The report page renders the `ReportModel` layer by layer, including locked layers. Checkout and confirmation are step 2c.

## Boundaries & Constraints

**Always:** Copy, section order and Pine tokens from the mockup bind; all site copy lives in `src/site/copy.ts`. Pages never compute data: the report page renders only what `ReportModel` returns, via `src/render/format.ts`, and every figure shows its chip. A locked layer renders its teaser and a lock card and never any value (AD-3), proven by a test on rendered HTML. Gap, not_covered and error layers show their message while other layers render. The hero preview card is static marketing sample content, labelled "Example", never fetched. Sample buttons resolve the sample address text through the resolve endpoint and show a plain message if it is not found. The "What is in the report" grid is one merged list with Houses and Flats tags (18 shared, 2 houses, 5 flats). Photos are static files in `public/img/` with the author and licence in the footer credits. Layout works at 400px with no horizontal scroll; the search is an accessible combobox. The page must be run for real: start the app (vite dev, else build plus preview or wrangler dev), fix route-wiring problems, and capture a headless-browser screenshot of home and of a report if a local database can serve it.

**Never:** No checkout, payment or login UI beyond a link to `/checkout/{pid}` (step 2c). The report page lists only layers the API returns; it never lists catalogue sections that are not built. No "where the data comes from" or transparency section on the marketing pages (owner decision). No new data layers, analytics or cookies. Do not edit migrations or `scripts/`. No commits. Never print `DATABASE_URL`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick a suggestion | Type 3+ characters, choose a row | Navigates to `/report/{pid}` (unit kept in the query) | N/A |
| Submit free text | Text with no selection | Calls resolve; unique match opens the report | Ambiguous: candidate list. Not found: plain message |
| Free layers ok | Report for a loaded address | Sections with figures, chips, headline sentence | N/A |
| Locked layer | A layer with status `locked` | Lock card with teaser and "Unlock this address" linking to `/checkout/{pid}`; no figure value in the HTML | N/A |
| Layer gap, not_covered or error | Any such layer | Its message in place; other sections unaffected | N/A |
| Not covered address | Non-VIC pid | Clear message that only Victoria is covered | 404 body shown, not a blank page |
| Unknown pid | Bad or missing pid | Not-found view with a search box | N/A |
| Narrow screen | 400px viewport | Single column, no horizontal scroll | N/A |

</frozen-after-approval>

## Code Map

- `pine-site.artifact.html` (path above) -- the approved design: CSS tokens, copy, markup and behaviour to port. Pine tokens are bare `:root`; fonts Space Grotesk and JetBrains Mono.
- `src/routes/__root.tsx`, `src/routes/index.tsx` -- current Midnight-token root and bare search page; replace both. Keep `getJson` and `typedUnit` logic from `index.tsx` for suggest.
- `src/routes/api/v1/**` -- existing endpoints to call; do not change their contracts.
- `src/server/contracts/{layer,report}.ts` -- `LayerResult`, `Figure`, chips (Observed, Estimated, Unknown, Conflict only; do not add Reported here).
- `src/render/format.ts` (created in step 2a) -- reuse for money, percent, count.
- `src/routeTree.gen.ts` -- generated; let the Vite plugin regenerate it.
- Hero, report-preview and sample copy numbers (447 m2, 733 flats, 74 to 80%, 40% short-stay rule) come from the mockup; keep them exact.

## Tasks & Acceptance

**Execution:**
- [x] `public/img/*.jpg`, `src/site/credits.ts` -- extract the seven mockup photos to files, wire the footer credits
- [x] `src/render/pine.css`, `src/routes/__root.tsx` -- Pine tokens and components as a stylesheet, fonts, nav and footer
- [x] `src/site/copy.ts`, `src/site/*.tsx` -- hero, who it is for, merged sections grid, samples, pricing, FAQ, closing call to action
- [x] `src/routes/index.tsx` -- home page with the combobox search
- [x] `src/routes/report.$gnafPid.tsx`, `src/render/report/*.tsx` -- report page, section, figure tile, lock card, unlock bar, generating state
- [x] `src/**/*.test.tsx` -- one test per matrix row; locked-layer HTML contains no figure value
- [x] Run the app, screenshot home and report (400px and desktop) if a local database can serve it; otherwise record what could not be verified

**Acceptance Criteria:**
- Given `npm test`, `npx tsc --noEmit` and `npm run build`, then all pass.
- Given a report whose layers include a locked one, when the page renders, then the HTML holds the teaser and no figure value.
- Given the home page, then the copy matches the mockup and there is no data-sources section.

## Implementation Notes

### Build notes (2026-11-21, subagent run)

**Built.** `src/render/pine.css`; `src/site/{copy,credits,address-api,report-api}.ts` and components (`Hero`, `WhoFor`, `SectionsGrid`, `Samples`, `Pricing`, `Faq`, `ClosingCta`, `SiteNav`, `SiteFooter`, `AddressSearch`, `HomePage`); `src/render/report/*` (`ReportView`, `ReportSection`, `FigureTile`, `LockCard`, `UnlockBar`, `Generating`, `tables`); routes `index.tsx`, `report.$gnafPid.tsx`, root with not-found view; `src/router.tsx` plain-text search params; `format.ts` gained `formatDate`; `vitest.config.ts` includes `*.test.tsx`; six photos in `public/img/`.

**Deviations and decisions.**
- The mockup holds six photos (house, flat, agent, investor, short, home), not seven; all six are extracted and credited.
- The report page has no street photo (the mockup's was a placeholder) and no header fact tiles (picking figures is data logic). The "headline sentence" is the report header (title, subtitle, match note); an ok layer carries no teaser, so each section shows its figures and the question from the catalogue (`SECTION_QUESTIONS`).
- "Start Pro" and "Get the report" in pricing link to `#top` (checkout needs an address first; step 2c decides). The unlock bar links to `/checkout/{pid}` and `/checkout/{pid}?plan=pro`.
- Default TanStack search serialisation wrote `?unit=%22310%22` and dropped a hand-typed `?unit=310`; `router.tsx` now keeps query values as plain text.
- Nav uses plain anchors; the report is fetched in the browser (entitlement is per visitor, AD-3).
- Fonts load from Google Fonts as in the mockup (no cookies; third-party request).

**Gap for the runbook.** The copy promises 20 and 23 sections; the report page shows only the layers the API returns (L01, L02, L03, L07, L09 today), so a report is 5 sections until more layers land.

**Verification.** `npx tsc --noEmit` clean; `npm test` 219 pass (20 files); `npm run build` passes. `vite dev` and `wrangler` crash here (workerd access violation, as noted in deferred-work), so the app was run on a temporary Node-hosted Vite config (deleted afterwards) with all `/api` calls answered in headless Chrome from report models produced by the real layers on PGlite, plus a locked and an error layer. 46 browser checks passed at 1280px and 400px: no horizontal scroll, combobox keyboard flow, pick keeps unit, free text, ambiguous list, not-found, sample hit and miss, unknown, bad and non-VIC pid views, `/report` with no pid, generating state, locked secret absent from the DOM. Screenshots were reviewed by the builder only. Not verified: the real Neon database through the page, and the Worker bundle running in workerd.

## Spec Change Log

## Review Triage Log

| # | Finding (reviewer) | Verdict | Route | Evidence |
|---|--------------------|---------|-------|----------|
| 1 | Diff deletes the step 2a files and the spec itself (blind) | false | reject | The first diff compared a snapshot to the working tree, and git shows snapshot files that are untracked in the index as deleted. Rebuilt as snapshot-to-snapshot: 37 files, 0 deletions. |
| 2 | AD-3 leak test checks raw digits only; a formatted value would pass (edge, gap) | high | patch | Verified in `report.test.tsx:92-95`: SECRET 424242424 is drawn as 424,242,424. Test now checks formatted forms and the slice index. |
| 3 | Null or non-JSON 2xx body: resolveText throws, search stays disabled (blind, edge) | medium | patch | Verified at `address-api.ts` resolveText. Guarded, finally added, test added. |
| 4 | skipSuggest stuck; stale sample message; arrows after Escape (blind, edge) | medium | patch | Verified in AddressSearch. Fixed. |
| 5 | Report load `.catch` swallows every error; failed view has no retry (blind, edge) | medium | patch | Verified in the route. Only aborts ignored, Retry added. |
| 6 | Unmatched paths say "could not find that address" (blind, edge) | medium | patch | Verified in `__root.tsx`. Generic not-found added. |
| 7 | Paid layer gap or error shows an Unlocked chip (gap) | medium | patch | Verified in `TierChip`. Fixed with a test. |
| 8 | PRICES unused; prices duplicated as literals (blind, edge, gap) | medium | patch | Verified. Strings now built from PRICES, tested. |
| 9 | L09 table never rendered in a test; per-column notes dropped; non-number cells drawn (blind, edge, gap) | medium | patch | Verified. Render test, notes list and number guard added. |
| 10 | formatDate accepts impossible dates; Report generated uses the UTC day; provenance leading comma (edge) | low | patch | Verified. Direct fixes with tests. |
| 11 | Router plain-text search parse and typedUnit length untested (gap, edge) | medium | patch | `?unit=1E3` would parse to a number under the default JSON round trip. Tests added; typedUnit capped at 8. |
| 12 | "No data-sources section" test regex cannot match the catalogue wording (blind, edge) | low | patch | The catalogue item stays (owner-approved list); the test now asserts the real thing. |
| 13 | Internal TODO shown as public Pro copy; footer lists sources no layer uses; sample photos lack an Example tag; no noindex (blind) | low | patch | Fair-use sentence removed, footer limited to built sources, tags and noindex added. Pro fair-use terms remain an open launch item. |
| 14 | Site promises 20 and 23 sections while 5 layers exist; Unlock leads to a missing route (blind, edge) | high | defer | Known and recorded in the spec Design Notes; the checkout route is step 2c, built next in this run. The 20 and 23 gap is a launch blocker in the runbook. |
| 15 | Fonts from Google Fonts; no privacy or terms links; tiny type sizes; no mobile menu; no focus or title update; fake progress steps; no favicon or Open Graph (blind) | low | defer | Launch polish; none affects correctness. |
| 16 | AddressSearch interactions and keyboard tests absent (gap) | medium | defer | The repo has no DOM test environment; the pure decision layer is tested. Needs new test infrastructure. |
| 17 | Copy literals remain in components; zod Chip imported into the client bundle; dead exports; nav uses full-page anchors (blind, edge) | low | defer | Maintainability only. |


## Design Notes

The mockup's report view used old layer data; the real page shows whatever layers the API returns (L01, L02, L03, L07, L09 after step 2a). The marketing copy promises 20 and 23 sections; the built report has fewer until more layers land. Record that gap in these notes for the runbook.

## Verification

**Commands:**
- `npm test` -- expected: all pass
- `npx tsc --noEmit` -- expected: clean
- `npm run build` -- expected: Worker bundle builds

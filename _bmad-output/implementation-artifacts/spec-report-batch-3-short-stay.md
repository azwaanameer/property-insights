---
title: 'Report batch 3, section 5: short-stay income (L06) with the City Retreats CRM method'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0019158'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-reported-web-lookup.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report has no short-stay (Airbnb) income view for an apartment, though the City Retreats CRM already estimates it. The owner ruled on 2026-11-21 that there is no licence issue for short stay, and asked for the same method the CRM uses: take AirDNA's estimate when its confidence is High, otherwise calculate our own estimate from the comparable listings (comp set) that the same AirDNA response returns.

**Approach:** Add a live vendor adapter for the AirDNA "rentalizer" (RapidAPI host airdna1, key `RAPIDAPI_KEY`, cached 30 days at most in `vendor_cache`) and a free layer L06-shortstay "What could it earn as a short stay?" that applies the CRM rule and the product cutoff (shown only when the income is at least 1.4 times the same home's long-term rent, otherwise a single quiet line says why).

## Boundaries & Constraints

**Always:** Real data only; AD-1..AD-11. Follow the CRM's code as the specification of the method (read-only references, do not copy secrets): `c:\Users\azwaa\Documents\github\cityretreatscrm\src\lib\airdna.parse.ts` (request URL `https://airdna1.p.rapidapi.com/rentalizer?address=FULL ADDRESS&currency=native&bedrooms=N&bathrooms=N`, headers `x-rapidapi-key`, `x-rapidapi-host: airdna1.p.rapidapi.com`; parse `property_statistics.revenue.ltm`, `occupancy.ltm`, `adr.ltm`, `confidence_score.{level,score}`, `total_comps`, `comps`, `comps_revenues`; AirDNA assumes 2 bed 2 bath when told nothing, so always pass the bedrooms and bathrooms the report uses, and say when they are assumed), `src/lib/airdna.comps.ts` (strong comp = revenue at least 20,000 and at least 20 reviews; comps sorted by distance; use the strong comps if there are at least 5, else all comps with revenue; take the nearest 15; own estimate = median of their annual revenue, with the 25th and 75th percentiles, `percentile` as in the file) and `src/lib/income.ts` (High confidence uses AirDNA's own revenue; Low, Medium or missing uses our estimate from the comps; if no usable comps, fall back to AirDNA's figure labelled as a fallback with its confidence). Each figure states which method produced it ("AirDNA estimate, high confidence" or "Our estimate from N nearby comparable listings, because AirDNA's confidence is Medium"), the comp count, and the p25 to p75 range; chip Estimated (a vendor or our own estimate, never Observed). Amounts are Australian dollars (`currency=native`); show annual and monthly. The section is shown only when estimated annual income is at least 1.4 times the home's long-term rent for a year (weekly rent times 52, the rent figure of L02 for the same bedroom count, read through `ctx.siblings`, which makes L06 a synthesis layer); below the cutoff, no data, a house, or no rent figure, L06 is a gap whose message is one plain line (for example "Short-stay income is not at least 40% above long-term rent here, so this section is not shown.") and the render shows it as that single quiet line, not a section card. Cache the vendor response in `vendor_cache` for 30 days at most keyed by address pid and bedrooms and bathrooms; a vendor failure or missing key is a gap, never a failure of another layer (AD-9). The key is read from `process.env.RAPIDAPI_KEY`, never printed, logged or committed. Source row `airdna_rentalizer` is added with rights_status cleared (owner ruling 2026-11-21), attribution "Short-stay estimates use AirDNA market data (RapidAPI).", before its layer_config row.

**Never:** No guarantee or forecast language ("will earn"); no ranking; no income shown from comps flagged weak without saying so; do not store comp photos or listing text, only comp id, distance, bedrooms, revenue and reviews counts (links as the CRM builds them may be shown for the comps listed); no suburb-wide harvest; no push; no real network, Neon or Cloudflare use by the implementer (tests use fakes and the existing no-network guard).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| High confidence, above cutoff | AirDNA confidence High, income at least 1.4 times rent | Section with AirDNA's annual and monthly income, occupancy, average nightly rate, confidence, comp count | N/A |
| Medium or Low confidence | confidence Medium/Low, at least 5 strong comps | Our estimate (median of nearest 15 strong comps) with the range and the reason, above cutoff | N/A |
| Few comps | fewer than 5 strong comps | Uses all comps with revenue; labelled "few comparable listings" | N/A |
| No usable comps and AirDNA income present | no revenue comps | AirDNA's figure labelled fallback with its confidence | N/A |
| Below cutoff | income under 1.4 times rent | gap with the one-line reason; quiet line, no card | N/A |
| House | house address | gap "Short-stay estimates are for apartments." quiet line | N/A |
| No rent figure | L02 gap | gap "No long-term rent figure to compare with." | N/A |
| Vendor failure, missing key | non-200, timeout, no key | gap "Short-stay estimates are not available right now." | AD-9 |
| Cached | same address and beds within 30 days | no outside call | N/A |

</frozen-after-approval>

## Code Map

- Vendors framework from batch 3 section 2: `src/server/vendors/` (`cache.ts` is the only writer of `vendor_cache`, 30 day clamp, 8 s timeout, User-Agent; `mapillary.ts`, `wikimedia.ts` as the pattern; `index.ts` `createVendors`; `types.ts`), `LayerContext.vendors`, `src/server/testing/fake-vendors.ts`, `vitest.config.ts` no-network setup, `LayerDef.timeout_ms`. Add `src/server/vendors/airdna.ts` and extend the types, `createVendors`, fakes.
- Layer: `src/server/layers/L06-shortstay/index.ts` as a synthesis layer (see `L13-questions` and `L14-attribution` for `ctx.siblings` use and second-pass registry order), place after L05-return in the registry `src/server/layers/index.ts`; the rent figure comes from the L02-rent result in `ctx.siblings` (read its figures and payload; find how L02 picks its bedroom count and how L05 does, and reuse that exactly; if the report has no bedroom choice for an apartment, use the same default L02 and L05 use and mark the bedrooms assumed). A synthesis layer may be required to run only after others; the vendor call stays inside L06 through `ctx.vendors`.
- Migration `db/migrations/0012_shortstay.sql` (next after the sales dataset migration; use the next free number and say so): source `airdna_rentalizer`, layer_config `L06-shortstay` (free, enabled, source_ids `airdna_rentalizer`, `gnaf`) after the source row. Renumber the migration reference in `_bmad-output/implementation-artifacts/spec-reported-web-lookup.md` to the next free number. Update pinned lists (`db/migrations.test.mjs`, `src/server/testing/db.ts`, `src/site/home.test.tsx`, `src/server/layers/return-rating-questions.test.ts`, layer-count and order tests).
- L14 `src/server/layers/L14-attribution/index.ts`: credit AirDNA only when L06 returned data. L13 questions: add one question only if a fact naturally yields it (for example "the short-stay estimate is our own because AirDNA's confidence is not High") without inventing facts; otherwise leave L13 unchanged.
- Render: `src/render/report/` new `ShortStayPanel.tsx` (income tiles, method line, comp table of the nearest comps with distance, bedrooms, annual revenue, reviews; Pine style), the quiet-line render for the gap (in `ReportSection.tsx`), `pine.css`, `src/site/copy.ts`.
- Tests: adapter (fake fetch: success with the real response shape from `data/raw` or the CRM's stored responses if a sample exists locally, non-200, timeout, bad JSON, cache hit, no key, key never in an error), layer (every matrix row, ratio exactly at 1.4 shows, just under hides), render, L14, pinned lists; keep all existing tests passing. For a realistic AirDNA response fixture, build a small one that follows the field names above; do not copy private data.
- Do not change: rights-gate semantics, L02 and L05 output.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/vendors/airdna.ts` + wiring + fakes + adapter tests
- [x] `db/migrations/...shortstay.sql`, pinned lists, web-lookup spec renumber
- [x] `src/server/layers/L06-shortstay`, registry, L14 credit
- [x] Render panel and quiet line, `pine.css`, `copy.ts`, render tests
- [x] Layer tests for every matrix row; `RUNBOOK.md` section 14 (secret `RAPIDAPI_KEY` is read from the Worker secrets, run order), `deferred-work.md`, Implementation Notes; do NOT call real APIs, Neon or Cloudflare; do not commit

**Acceptance Criteria:**
- Given an apartment where AirDNA reports High confidence and income at least 1.4 times annual rent, when the report loads, then L06 shows AirDNA's figures labelled as such with Estimated chips.
- Given Medium or Low confidence with enough comps, when the report loads, then L06 shows our estimate from the nearest 15 strong comps and says why AirDNA's figure was not used.
- Given income below 1.4 times rent, a house, or a vendor failure, when the report loads, then L06 is a single quiet line and every other section is unaffected.
- Given the key and any response, when logs and errors are searched, then the key never appears.
- Given `npm test` (PowerShell), `npx tsc --noEmit` and `npm run build`, then all pass.

## Implementation Notes

**Built.** Adapter `src/server/vendors/airdna.ts` (`fetchShortStay`, `parseRentalizer`, `buildRentalizerUrl`), wired into `createVendors` as `shortStay(query)` (key from `RAPIDAPI_KEY`), `UNAVAILABLE_VENDORS` and the fakes (`shortStayEstimate`, `strongComps` in `src/server/testing/fake-vendors.ts`). Method in `src/server/layers/shared/shortstay.ts` (strong comp, nearest 15, percentile, High versus own versus fallback, integer cutoff test) and layer `src/server/layers/L06-shortstay/index.ts` (synthesis, `timeout_ms: 10000`, registered right after L05-return). Migration `db/migrations/0012_shortstay.sql` (next free number after 0011): source `airdna_rentalizer` (cleared, the credit text, 30 days), then layer_config `L06-shortstay` (free, enabled, `airdna_rentalizer` and `gnaf`); the web-lookup spec's migration reference is renumbered to 0013. Render: `ShortStayPanel.tsx`, the quiet line in `ReportSection.tsx` (`.rquiet`), `pine.css`, `copy.ts` (heading, layer name, source name, panel wording, footer data line). Docs: RUNBOOK section 14 and `deferred-work.md`.

**Decisions made without asking.**
- Retry and budget (orchestrator note, 2026-11-21): one retry after 1.5 s on a 429 or a 5xx only (not a timeout, not a 4xx), only if at least a second of a 9 second budget is left, then a gap; a failure is never cached; the `x-ratelimit-requests-remaining` and `-limit` headers are logged as `airdna_quota` (never the key). `fetchJson` got an optional `onResponse` callback and `VendorError` an optional `status` for this; other adapters are unaffected.
- L14 must credit AirDNA only when L06 returned data, but a synthesis layer could not see another synthesis layer's result. Added `LayerDef.after_synthesis` and a third runner pass; only L14 sets it. L13 is unchanged and does not see L06 (the spec allowed no new question).
- Bedrooms and bathrooms: the report has no choice, so 2 bedrooms (`FAMILY.unit.primary_bedrooms`, the size L02 and L05 use; the rent compared with is L02's `rent_2bed_flat`) and 2 bathrooms (AirDNA's own default; nothing in the report gives a bathroom count). Always sent, and the figure, the panel and the notes say they are assumed.
- The comparison rent is shown as its own tile ("Long-term rent for the same home, a year") with L02's own chip and source (Observed or Estimated as L02 gave it), so the ratio can be checked; every figure that comes from AirDNA is Estimated.
- Occupancy and nightly rate are AirDNA's own statistics, so they are shown only beside AirDNA's figure (High, or the fallback), not beside our comp-based one.
- The range (25th to 75th percentile) is worked from the comparable listings used, also when AirDNA's figure is used; with no comparable listings it is omitted. A comp with zero revenue is not a comp "with revenue". Any one comp with revenue is enough for our own estimate (the spec sets no minimum); fewer than 5 strong ones is labelled "few comparable listings".
- A comp's link is kept only if it is on airbnb.com or airbnb.com.au (the CRM reads `airbnb_listing_url` then `listing_url`), and the panel checks again before drawing it as a link.
- Money is whole Australian dollars from AirDNA (`currency=native`), stored as integer cents in figures. `occupancy.ltm` is read as a fraction as the CRM does (unconfirmed against a real answer).
- The existing AD-4 migration test used `L06-shortstay` as a throwaway layer id; it now uses `L98-test`. The coverage endpoint test's "no vendor names" pattern now forbids `shortstay_vendor|airdna` instead of the bare word `shortstay`, which is now a real layer id.

**Not done / for the orchestrator.** Run migration 0012 on Neon, `wrangler secret put RAPIDAPI_KEY`, deploy, and a real-API smoke test (the adapter has only run against fakes built from the CRM's field names; AirDNA answered 503 on the 2026-11-21 probe, so the real response shape is unconfirmed). Browser check GAVIC720519114 at 1200 px and 390 px: the card or the quiet line. Nothing was committed and no network, Neon or Cloudflare was used.

## Spec Change Log

## Review Triage Log

## Design Notes

The cutoff and method come from the owner (memory: short-stay shown only when income is at least 1.4 times long-term rent; CRM rule: High confidence uses AirDNA, otherwise our comp-based estimate). The Docklands unit previously passed the cutoff only barely (about A$60.8k estimate against A$41.6k rent), so the exact comparison and the quiet-line path matter.

## Verification

**Commands:**
- `npm test` in PowerShell -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: success

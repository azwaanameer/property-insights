---
title: 'Report batch 3, section 4: reported recent sales (L21) and price drivers (L04) from the sold-listings dataset'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0019158'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/imports/domain-api-and-price-drivers-2026-11-11.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report shows suburb medians but no recent sales of homes in the same building or street, and no view of what makes one apartment worth more than another. The user ruled on 2026-11-21 that sale history has no licence issue and that the RapidAPI realty-in-au sold listings may be used for the price-driver model.

**Approach:** Load the sold listings already harvested (26 suburbs, about 3,300 sales) into a versioned table by a pipeline, compute a price-driver model and layout medians in a derive step, and add two free layers: L21 "What have nearby homes sold for?" (recent sales in the same building or street, as reported) and L04 "What makes it worth more or less?" (the effect of bedrooms, bathrooms, car space and floor, as association not cause).

## Boundaries & Constraints

**Always:** Real data only; AD-1..AD-11 including AD-11 (reported facts) and AD-10 (no forecast). Every individual sale shows its sale date, price, bedrooms, bathrooms, car spaces, address and a link to its listing page (https://www.realestate.com.au/ plus the listing's stored `url`), labelled as reported by that site, never as verified; if the stored data lacks a field, show it as not listed. Sales are shown only for the same building (apartment) or the same street (house), most recent first, up to 8, none older than the dataset holds; each is labelled as a listing-site record, not a Victorian title record. The dataset date shown is the harvest date. Price drivers: ordinary least squares on log sale price with suburb fixed effects, apartments only, using the method of `scripts/23-price-drivers.mjs` (read it; reuse its unit and floor parsing) over all harvested suburbs pooled; each driver shows its effect in percent, its standard error and the sample size; the section says it is association not cause and gives the window and the number of sales; layout medians (beds, baths, car) are shown only where a suburb has at least 20 sales of that layout; the section is a gap for an address outside the harvested suburbs or a house, saying so. The source row `rp_sold_listings` is added with rights_status cleared (user ruling) before its layer_config rows. No agent, agency or phone data anywhere. Evidence chip for individual sales follows the existing chip set in `src/server/contracts/layer.ts` (add a "Reported" chip only if AD-11 and that contract call for it, updating every place the chip set is enumerated); model outputs are Estimated.

**Never:** No raw listing text or photos stored; no valuation or "estimated price" for the subject property; no forecast; no ranking of suburbs; no live call to the listing site or RapidAPI from the app; no push; no Neon, Cloudflare or network access by the implementer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Apartment with building sales | Docklands unit, building in dataset | Up to 8 same-building sales with date, price, beds, baths, car, link; counts and dataset date | N/A |
| House with street sales | Cranbourne North house | Same-street sales if any, else gap | Gap says the dataset covers 26 suburbs only |
| Suburb not harvested | address outside the 26 suburbs | L21 and L04 are honest gaps naming the coverage | N/A |
| Drivers for a harvested apartment suburb | Docklands unit | Pooled driver table (2 bed vs 1 bed, 3 bed vs 1 bed, 2+ baths, car space, floor bands) with effect, standard error, n; suburb effect for this suburb; layout medians with n at least 20 | N/A |
| Thin layout cell | fewer than 20 sales of the layout in the suburb | that median is omitted, not shown | N/A |
| Unparseable price or no unit number | listing without a numeric price or unit number | excluded from the model, counted in the notes ("used X of Y sales") | N/A |
| Dataset not loaded | no current dataset | gap "Reported sales are not loaded." | N/A |

</frozen-after-approval>

## Code Map

- Data in `data/` (gitignored, local only): `data/rp_harvest.json` (keys `rent`, `sold`; `sold` has 900 rows for Melbourne, Southbank, Docklands, St Kilda, South Yarra, Port Melbourne with fields crm_suburb, listingId, address, suburb, postcode, lat, lon, price like "$560,000", type, bed, bath, park, dateSold like "10 Nov 2026", url) and `data/rp_sold_harvest.json` (`{retrieved, suburbs: {Name: {sal_code, rows:[...]}}}` for 20 more suburbs with the same fields and `url`). `rp_harvest.json` rows also hold agent, agency and phone fields: the loader must read only the listed property fields and never copy those. Read the existing derivation `scripts/23-price-drivers.mjs` and its output `data/price_drivers.json` for the model and expected magnitudes (about 599 of 900 sales usable; 2 bed vs 1 bed about +30%).
- Pipeline: `pipeline/ingest/rp-sold.mjs` (+ `package.json` script `pipeline:sold`) loading `fact_reported_sale (dataset_version_id, listing_id, address_text, street_key, unit_no, street_no, suburb, postcode, sal_code null, lat, lon, price_aud int, bed, bath, park, property_type, sold_on date, url)`; match each sale to a G-NAF building where the address allows it (same normalised street number and street name in the same suburb, using the normalisation already used by `pipeline/ingest/com-buildings.mjs` and `src/server/layers/shared/suburb-key.ts`) and store `building_id` and `match_type`; no match leaves building_id null. Derive step `pipeline/derive/price-drivers.mjs` writing `derived_price_driver (dataset_version_id, driver, effect_pct, se_pct, n_used, n_total, window_from, window_to)` and `derived_layout_median (dataset_version_id, sal_code or suburb, beds, baths, has_car, median_price, n)`; both published through `pipeline/lib/dataset.mjs` like the rating derive (`pipeline/derive/rating.mjs`) with publish checks (price range 50,000 to 20,000,000, dates within 2 years of the harvest date, no duplicate listing_id, model effects plausible: 2 bed vs 1 bed between +5% and +60%), `--pglite` dry run, fixtures under `pipeline/ingest/fixtures/sold`, a real-file test skipped when the data files are absent.
- Migration `db/migrations/0011_sold_dataset.sql`: next after 0010 (the places dataset migration being built now; if it is not present yet use the next free number and say so); source `rp_sold_listings` (licence "Third-party listing data (realestate.com.au via RapidAPI realty-in-au); reuse ruled acceptable by the owner 2026-11-21", rights cleared, attribution "Recent sales as reported on realestate.com.au listings, retrieved by VicProp."), tables, `layer_config` rows for L21-sales and L04-drivers (free, enabled) after the source row. Renumber the migration reference in `_bmad-output/implementation-artifacts/spec-reported-web-lookup.md` to the next free number again. Update pinned lists (`db/migrations.test.mjs`, `src/server/testing/db.ts`, `src/site/home.test.tsx`, `src/server/layers/return-rating-questions.test.ts`, layer-count tests).
- Layers: `src/server/layers/L21-sales/index.ts`, `src/server/layers/L04-drivers/index.ts`, repos `src/server/repos/sale.ts`, `drivers.ts`; registry `src/server/layers/index.ts`: L21 right after L03-price, L04 right after L21. Follow `L18-safety` and `L17-schools` for dataset handling, gaps, figures and notes; `L14-attribution` must credit the source only when a section returned data. Render in `src/render/report/` (a `SalesPanel.tsx` with a compact table, a `DriversPanel.tsx` with the driver table, both with the Pine style, `ReportSection.tsx`, `pine.css`, `src/site/copy.ts`). Do not use words like "valuation", "worth" in figure labels beyond the section title the user already uses ("What makes it worth more or less?").
- Do not change: existing layers' output, rights-gate semantics, the harvest script or data files.

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/ingest/rp-sold.mjs`, `pipeline/derive/price-drivers.mjs`, fixtures, tests (loader, derive model against a hand-checked fixture with a known OLS answer), real-file test skipped when absent, `package.json` scripts
- [ ] `db/migrations/...sold_dataset.sql`, pinned lists, web-lookup spec renumber
- [ ] `src/server/repos/sale.ts`, `drivers.ts`, `L21-sales`, `L04-drivers`, registry, L14 credit
- [ ] Render panels, `pine.css`, `copy.ts`, render tests (credit and link on every sale, "association not cause" present, no valuation wording)
- [ ] Run the loader and derive on the real local files with `--pglite` (no Neon) and report: rows loaded, rows used by the model, the driver table, the layout medians for Docklands; check that 14 Lucinda Lane (house, Cranbourne North) and the Docklands unit give the expected gap or table
- [ ] Layer tests for every matrix row; keep all existing tests passing; `RUNBOOK.md` section 13, `deferred-work.md`, Implementation Notes; do NOT touch Neon, Cloudflare or the network; do not commit

**Acceptance Criteria:**
- Given the Docklands unit and a loaded dataset, when the report loads, then L21 lists recent sales from the same building each with date, price, link and the "as reported" label, and L04 shows effects with standard errors, n and the association-not-cause note.
- Given an address outside the 26 harvested suburbs, when the report loads, then both sections are honest gaps naming the coverage.
- Given the stored data, when searched, then no agent, agency or phone value is present in any table or output.
- Given `npm test` (PowerShell), `npx tsc --noEmit` and `npm run build`, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

The model is the one computed on 2026-11-11 over 599 usable sales, now over about 3,300 sold listings across 26 suburbs, so the 2 bed, 3 bed, bath, car-space and floor effects should be better determined than before. Outer suburbs are mostly houses, so apartment sample sizes there are small; the layout-median rule (at least 20) and the gap rule keep thin cells out.

## Verification

**Commands:**
- `npm test` in PowerShell -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: success

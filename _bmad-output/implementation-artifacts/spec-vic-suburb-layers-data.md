---
title: 'Victorian suburb data and layers L02 Rent, L03 Price, L07 History, L09 Suburb compare (build order step 2a)'
type: 'feature'
created: '2026-11-14'
status: 'ready-for-dev'
route: 'dispatch'
baseline_commit: '723b6a6cea148b4edc9353f8e9907fd1ed6fdaef'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-foundation-address-lookup.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report can resolve an address to a building and a suburb, but L01 is the only section. There is no price, rent, history or neighbour comparison, and the official Victorian files sit in `data/raw/` and one-off scripts.

**Approach:** Load Victorian Valuer-General medians, Homes Victoria rents, Census and SEIFA markers as versioned datasets keyed by SAL code, and add free layers L02 Rent, L03 Price, L07 History and L09 Suburb compare. The report endpoint returns them next to L01.

## Boundaries & Constraints

**Always:** Spine ADs 1 to 10 and the step 1 spec bind. Figures carry a chip, `source_ids` and `as_of` from their dataset version. Medians and rents are `Observed`; growth rates, gross yield and ranks are `Estimated` and say how they were derived. Join on SAL code; names are matched in the pipeline only and the match type is stored; unmatched rows are counted and listed, not guessed. Pipelines load through the existing versioned publish. Layers stay read-only. Use `node --env-file=.env` for real runs against the user's Neon database; never print, log or write `DATABASE_URL`.

**Never:** No composite score, ranking called "best", rating, forecast or prediction (AD-5, AD-10). L09 compares side by side only. No paid layers, no vendor adapters, no new states. Do not edit `scripts/` or `data/raw/`. Do not edit migrations 0001 to 0003; add 0004. No commits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full suburb | Docklands unit address | L02 shows median weekly rent with count and year-ago change; L03 median unit price with sales count; L07 annual series 2015 to 2025 with 5- and 10-year CAGR; L09 compares with neighbours | N/A |
| No house prices | Suburb with units only | L03 shows units; house figure absent with a gap note | Layer `ok` with `gap` figure, not an error |
| Thin data | Fewer than 10 sales or lettings | Figure kept, chip `Estimated`, note "few sales" | N/A |
| No neighbours | Suburb with no neighbour rows | L09 returns `gap` with message | `gap` |
| Suburb unmatched | Address with no `sal_code` | L02, L03, L07, L09 return `gap` ("suburb not matched") | `gap` |
| Dataset missing | No published dataset for a layer | `not_covered`, never run | AD-4 |
| Source not cleared | Source `pending` | `not_covered` with the public text only | AD-4 |
| Re-run load | Same files again | New dataset version; pointer flips; old rows stay readable until retention | Failed checks keep the pointer |

</frozen-after-approval>

## Code Map

- `scripts/25-vgv-growth.mjs`, `33-vgv-house-growth.mjs` -- parse `data/raw/vic/sales-valuer-general/{units,houses}-by-suburb-2015-2025.xlsx` (sheet `Sheet1`, header row `Locality`, year columns) and `median-{unit,house}-march-quarter-2026.xls` (five quarters, sales count, YoY). Port the parsing into `pipeline/ingest/`; do not import from `scripts/`.
- `scripts/30-census-names.mjs`, `27-rent-check.mjs`, `17-research-imports.mjs` -- parse `data/raw/vic/rents-homes-victoria/moving_annual_rent_jun2026.xlsx` (one sheet per dwelling type; header row with `Dec/Mar/Jun/Sep YYYY`, `Count` row, then median columns).
- `scripts/36-backtest-multistate.py`, `31-backtest.py` -- how Census GCP tables (SAL 2021, `data/raw/national/census-2021/2021_GCP_SAL_VIC.zip`) give owner share, flat share, unoccupied share, median income, age, rent and mortgage; reuse the table and column choices.
- `data/seifa_scores.json` and `data/raw/national/abs-api/ABS_SEIFA2021_SAL.csv` -- SEIFA IRSAD and IRSD by SAL code.
- `data/raw/national/gnaf/...zip` table `VIC_LOCALITY_NEIGHBOUR_psv.psv` -- locality adjacency for L09; map locality pids to SAL through `ref_address`/`ref_suburb` match, store the match type.
- `db/migrations/0001_core.sql` -- `series_price`, `series_rent`, `ref_suburb`, `src_source`, `layer_config`; read the columns first and add only what is missing in 0004.
- `src/server/layers/L01-property/index.ts`, `layers/index.ts`, `services/assemble-report.ts` -- the layer pattern and registry to follow.
- `src/routes/index.tsx` -- `FigureRow` prints raw values; the deferred item "format money by `Figure.unit`" is needed now.

## Tasks & Acceptance

**Execution:**
- [ ] `db/migrations/0004_vic_suburb_layers.sql` -- add missing tables or columns (`series_*` for dwelling type and period, Census marker table, `ref_suburb_neighbour`), seed sources `vgv_medians`, `homes_victoria_rents`, `abs_census_2021`, `abs_seifa_2021` as `cleared` (all CC BY 4.0, with attribution text), and `layer_config` rows for L02, L03, L07, L09 enabled -- AD-4, AD-7
- [ ] `pipeline/ingest/{vgv-medians,homes-vic-rents,census-sal,seifa-sal,locality-neighbours}.mjs`, `pipeline/lib/*` -- parse, map to SAL with a stored match type, report unmatched counts, publish a dataset version each; row-count and range checks -- AD-6, AD-7
- [ ] `src/server/repos/{series,suburb}.ts` -- current-pointer reads for medians, rents, markers, neighbours
- [ ] `src/server/layers/{L02-rent,L03-price,L07-history,L09-suburb-compare}/index.ts`, `layers/index.ts` -- layers per the matrix; shared derive helpers (CAGR, gross yield) with their method named in the figure `note`
- [ ] `src/routes/index.tsx` and a small `src/render/format.ts` -- format figures by `unit` (AUD, percent, count, weeks); show all layers
- [ ] `src/**/*.test.ts`, `pipeline/**/*.test.mjs` -- one test per matrix row on fixtures; parser tests on small real excerpts; test that no layer output contains a score or forecast field
- [ ] Real run: migrate and load into the user's Neon DB with `--env-file=.env`; spot-check Docklands against `data/suburb_context.json` ($800 two-bed flat, Jun 2026) and `data/vgv_unit_growth.json`; record counts and unmatched names in Implementation Notes

**Acceptance Criteria:**
- Given the loaded Neon database, when the report for a Docklands unit is requested, then L01, L02, L03, L07 and L09 are `ok`, every figure has a chip, source ids and an `as_of`.
- Given a suburb with no neighbour rows, when L09 runs, then it returns `gap`, not an error.
- Given `npm test`, `npx tsc --noEmit`, `npm run build`, then all pass.
- Given the real load, then unmatched suburb counts per source are written in Implementation Notes.

## Implementation Notes

Heads-up before you start: a G-NAF address load (4.19M rows, `pipeline/ingest/gnaf-load.mjs`) was running in the background against the same Neon database when this spec was approved. Do not touch `ref_address`, `ref_building` or the `gnaf` dataset. Check that `src_dataset_current` has a `gnaf` row before the real run (the load may still be going or may have failed on a storage limit); if it is missing, build and test with PGlite, run the real loads for your own datasets only, and say so in your report. The Neon plan may have a small storage cap: check `pg_database_size` before and after.

## Design Notes

L09 uses the G-NAF neighbour table so the comparison set is real adjacency, not a distance guess. Gross yield is `median weekly rent x 52 / median price` for units and is `Estimated` because the rent and price geographies differ. Ranks are shown as "n of m among these suburbs" and never summed.

## Verification

**Commands:**
- `npm test` -- expected: all pass (run from PowerShell, proper-case path)
- `npx tsc --noEmit` -- expected: clean
- `npm run build` -- expected: Worker bundle builds

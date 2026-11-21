---
title: 'Report batch 3, section 1: recorded crime (L18-safety)'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '64190e5c7cd383b85ed180c545360213859aa15a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md'
  - '{project-root}/RUNBOOK.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report says nothing about recorded crime around the address, a question buyers and renters always ask. The Crime Statistics Agency (CSA) publishes open data we can use with attribution, but not yet in VicProp.

**Approach:** Load the CSA "LGA Criminal Incidents, year ending June 2026" workbook (CC BY 4.0, stated in the workbook's own Notes sheet) into versioned tables, and add a free layer L18-safety and a Pine section "What does recorded crime look like?" that shows the address's suburb counts and its council area's rate per 100,000 against Victoria, as plain figures with the CSA caveats. No safety score, label or ranking, no forecast (AD-10).

## Boundaries & Constraints

**Always:** Real data only. Follow AD-1..AD-11 and the batch 2 pattern (versioned dataset, publish checks, PGlite dry run, committed fixtures, real-file test skipped when `data/raw` is absent, rights gate before layer_config, evidence chips, L14 attribution with licence URL and "Adapted by VicProp"). Match the address to the CSA suburb by normalised name AND postcode; no match is a gap, never a guess. Show the CSA notices verbatim. Counts are Observed; anything we sum or subtract is Estimated. Never print `DATABASE_URL`.

**Never:** No "safe", "dangerous", score, rank or colour verdict; no forecast; no suburb rate per 100,000 (CSA publishes suburb counts only; joining to ABS populations is deferred); no victim, offender or family-incident tables; no push; no other batch-3 sections.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suburb found, one council | Docklands 3008 (Melbourne) | Latest year suburb total and by division; council rate vs Victoria; last 5 years of totals | N/A |
| Suburb in two councils | suburb/postcode with rows in 2 LGAs | Suburb counts summed; one council rate figure per council, each named | N/A |
| Suburb not in file | name or postcode not found | status gap with message naming the CSA geography | No figure invented |
| No postcode on address | postcode null | status gap | Message says postcode is needed |
| Small counts | suburb has few incidents | Counts shown as published; the notice that homicide and sexual-offence counts of 3 or less are recorded as 2 in totals is carried verbatim | N/A |
| Dataset not loaded | no current dataset | gap "Crime statistics are not loaded." | N/A |
| Rights pending | source not cleared | not_covered from the rights gate (AD-4) | N/A |

</frozen-after-approval>

## Code Map

- Data: `data/raw/vic/crime/Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx` (gitignored; already downloaded; source page https://www.crimestatistics.vic.gov.au/crime-statistics/latest-victorian-crime-data/download-data, files need a browser User-Agent). Sheets: `Table 01` (Year, Year ending, Police Region, Local Government Area with a leading space, Incidents Recorded, Rate per 100,000 population; 87 rows a year, years 2017 to 2026, year ending June), `Table 03` (Year, Year ending, LGA, Postcode, Suburb/Town Name, Offence Division, Offence Subdivision, Offence Subgroup, Incidents Recorded; about 34,000 rows a year; 2,906 suburb-postcode pairs, 265 sit in more than one LGA; 6 divisions A to F; 25 subdivisions). Table 01 excludes unknown location; Tables 02 to 05 also exclude justice institutions, immigration facilities and unincorporated Victoria. `Contents` sheet holds the verbatim notes (small counts of 3 or less recorded as 2 for A10 and A30 totals; rates use ABS populations and, for the newest year, Victoria in Future estimates; data extracted on day 18 after the period and subject to movement) and the licence line "This work is licenced under a Creative Commons Attribution 4.0 International License. When reporting this data you must attribute the Crime Statistics Agency (or CSA) as the source." Read the real Notes sheet text in the loader and store it; do not retype it.
- Reader: `openpyxl` read-only via a `python -I` extractor like `pipeline/ingest/gtfs-extract.py` (3.1.5 present), or the existing `xlsx` npm package (0.18.5, see package.json) if memory allows the 17 MB file; pick one and record why.
- Pattern to copy: `pipeline/ingest/school-zones.mjs`, `com-buildings.mjs`, `pipeline/lib/dataset.mjs` (`createDatasetVersion`, `LOADED_TABLES`, `makeBatchInserter`), `pipeline/lib/point-run.mjs`, `pipeline/lib/schemas.mjs`, tests `school-zones.test.mjs`, `com.real.test.mjs`, fixtures `pipeline/ingest/fixtures/{schools,com}`.
- Migration: `db/migrations/0008_crime.sql` (next after 0007_batch2_layers.sql): source row `csa_crime_incidents` (CC BY 4.0, rights_status cleared only because the file's Notes confirm reuse with attribution, attribution_text "Source: Crime Statistics Agency, Victoria. Adapted by VicProp.", licence URL https://creativecommons.org/licenses/by/4.0/), tables `fact_crime_suburb` (dataset_version_id, year_ending int, lga text, postcode text, suburb text, suburb_key text normalised lower-case name, subdivision text, division text, incidents int) at subdivision level (about 175,000 rows) and `fact_crime_lga` (dataset_version_id, year_ending, police_region, lga, incidents, rate_per_100k), `layer_config` row for L18-safety (free, enabled, source_ids `csa_crime_incidents`, `gnaf`) inserted after the source row, and L13 left unchanged. Also renumber the reference in `_bmad-output/implementation-artifacts/spec-reported-web-lookup.md` from 0008 to 0009 and any later references. Update pinned lists that enumerate migrations or layers (`migrations.test.mjs`, `src/server/testing/db.ts`, `home.test.tsx`, `return-rating-questions.test.ts`, `layers.test.ts`) as batch 2 did.
- Layer: `src/server/layers/L18-safety/index.ts`, repo `src/server/repos/crime.ts`, registry `src/server/layers/index.ts` (place after L17 schools, before L11), `shared/figures.ts` (reuse). State rate is computed from `fact_crime_lga`: population_i = incidents_i * 100000 / rate_i, state rate = sum(incidents) / sum(population) * 100000 over all rows with a rate, labelled Estimated, "all council areas combined, excluding incidents with unknown location".
- Render: `src/render/report/NearbyPanels.tsx` or a new `SafetyPanel.tsx`, `ReportSection.tsx`, `src/render/pine.css`, `src/site/copy.ts`, tests like `batch2.test.tsx`. L14 `src/server/layers/L14-attribution/index.ts` credits sources only from ok sections with a non-null figure; make sure CSA is credited.
- Do not change: rights gate semantics, L13 questions, existing section order except inserting L18 after L17.

## Tasks & Acceptance

**Execution:**
- [x] `db/migrations/0008_crime.sql` -- source, two tables, layer_config -- AD-4 source before layer_config
- [x] `pipeline/ingest/crime.mjs` + extractor + `package.json` script `pipeline:crime` -- versioned load, checks (87 LGA rows a year for 10 years; every Table 03 LGA found in Table 01; incident totals per year within 1% of a recomputed total; no negative counts), `--pglite` dry run -- AD-7, AD-8
- [x] `pipeline/ingest/fixtures/crime/` + `crime.test.mjs` + `crime.real.test.mjs` -- fixtures and real-file test skipped when absent
- [x] `src/server/repos/crime.ts`, `src/server/layers/L18-safety/index.ts`, registry -- figures: suburb total latest year, one figure per division latest year, previous year change (Estimated), five-year totals series, council rate and rank-free comparison with the Victorian rate, notices; payload for the table
- [x] `src/render/report/*`, `pine.css`, `copy.ts` -- section "What does recorded crime look like?", compact table, notices, no verdict wording
- [x] Tests: layer (found, two councils, gap, no postcode, not loaded), render, L14 credit, pinned lists; keep all 605 existing tests
- [ ] Implementer stops after tests, `tsc`, `npm run build` and the PGlite dry run: do NOT touch Neon, Cloudflare or the network (the files are already in `data/raw/vic/crime`), do not commit; the orchestrator then runs the Neon load, `npx wrangler deploy` and the browser check on GAVIC720519114 and GAVIC425618586 at 1200 px and 390 px
- [x] `RUNBOOK.md` new section 11 "Report batch 3" (crime), `deferred-work.md` entries, this spec's Implementation Notes

**Acceptance Criteria:**
- Given the Docklands unit, when the report loads, then the crime section shows Docklands 3008 counts for year ending June 2026 by division, the City of Melbourne rate against the Victorian rate, the CSA notices, and the CSA credit in the sources section.
- Given an address whose suburb is not in the file, when the report loads, then the section is an honest gap and no figure is shown.
- Given the section text, when searched, then it contains no "safe", "dangerous", "high crime", "low crime", rank, score or forecast wording.
- Given `npm test` (PowerShell), `npx tsc --noEmit` and `npm run build`, then all pass.

## Implementation Notes

**Built.** Migration `0008_crime.sql` (source `csa_crime_incidents`, tables `fact_crime_suburb`, `fact_crime_lga` and a third small table `fact_crime_note`, layer switch `L18-safety`; L13 untouched; `spec-reported-web-lookup.md` renumbered to 0009). `pipeline/ingest/crime-extract.py` (openpyxl read-only under `python -I`, about 17 s) and `crime.mjs` (zod, versioned load, publish checks, `--pglite`), script `pipeline:crime`. Repo `crime.ts`, layer `L18-safety` (placed after L17), `SafetyPanel.tsx`, copy, Pine styles, `per_100k` unit. Fixtures `fixtures/crime.mjs` and `fixtures/crime/crime-excerpt.xlsx` (real rows). Tests `crime.test.mjs`, `crime.real.test.mjs`, `crime-layer.test.ts`, `crime.test.tsx`, plus the pinned lists. 674 tests (605 before), `tsc` and `npm run build` pass; the real-workbook test and the `--pglite` dry run on the real extract pass every default check.

**Decisions made without asking.**
- Reader: openpyxl, not the `xlsx` package, because the 17 MB workbook has 341,870 rows in Table 03 and openpyxl streams it in constant memory (the npm package builds the whole workbook in memory).
- Table 01 has 87 source rows a year, but six are police-region "Total" rows that carry a rate. They are checked against the rows they add up (a mismatch fails the load) and then NOT stored: the spec's state rate sums "all rows with a rate", and with the Totals in it every incident would count twice. 810 council rows are stored (81 a year: 79 council areas and two non-council rows with no rate). The spec's "87 LGA rows a year for 10 years" is checked on the source rows in the loader; the SQL publish check checks 10 years, equal rows each year and the stored count.
- "Incident totals per year within 1% of a recomputed total" is two checks: the loaded suburb counts against the extractor's control total of the raw Table 03 rows, and against the council rows' total (in the real file both are exact: 465,100 for 2026).
- The CSA notices are stored in `fact_crime_note`, a third table the spec did not name, read from the Contents and Footnotes sheets by heading (not row number). The load fails if the licence sentence is missing. The section shows the Table 03 and Table 01 footnotes and the general Notes verbatim, not the licence line (credited in the sources).
- Chips: the council rate as published is Observed. Suburb total, division counts, the year change, the five-year totals, the offence table and the Victorian rate are Estimated, because each is added up or divided from published rows (literal reading of "anything we sum or subtract is Estimated").
- No `dataset_ids` on the layer, so a missing dataset gives the spec's gap "Crime statistics are not loaded." rather than the rights gate's not_covered (batch 2 layers use not_covered there). Rights pending still gives not_covered.
- A division with no row in the file shows 0 (the agency lists only offences that occurred) and a year with no row shows "None listed", not 0.
- The layer id says "safety" (spec) but its title is "Recorded crime" and no reader-facing text says safe, dangerous, high or low crime, rank, score or forecast. The one literal hit for "dangerous" is the agency's own offence name "A80 Dangerous and negligent acts endangering people", shown as published; logged in deferred work.
- Suburb key: the loader's `normName` lower-cased, mirrored in `layers/shared/suburb-key.ts` (layers do not import services) with a parity test. `point-run.mjs` now takes the prerequisite table and migration, so the crime loader can require 0008.
- The attribution list no longer appends "Adapted by VicProp." when the source's own attribution text already says it.
- The test fixture is a real excerpt; its Table 01 region Totals are recomputed for the four councils kept, so the fixture runs with the council comparison switched off (`councilTolerance: 1`) and the control total check on. The comparison is tested on its own.

**Not done / for the orchestrator.** Migration 0008 and the load on Neon, build, `npx wrangler deploy` and the browser check on GAVIC720519114 and GAVIC425618586 at 1200 px and 390 px. Nothing was committed, and nothing touched Neon, Cloudflare or the network. Deferred items are in `deferred-work.md`.

## Spec Change Log

## Review Triage Log

## Design Notes

Decisions made without asking (recorded): suburb counts at subdivision level so a buyer can see burglary and theft apart from assault; council rate rather than a suburb rate because CSA publishes suburb counts only and its suburb and ABS suburb boundaries differ; the state rate is derived from the council rows so numerator and denominator match; the newest year's rates use Victoria in Future population estimates (CSA note), shown as a notice.

## Verification

**Commands:**
- `npm test` in PowerShell -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: success

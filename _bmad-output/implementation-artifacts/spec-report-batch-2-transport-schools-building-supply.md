---
title: 'Report batch 2: Transport, Schools, Building, Supply, Screener, Sources'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'db98d6904a60f5a03206d0e9984b7e3a84d17b20'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/digests/I1-schools-family-data-2026-11-14.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-return-rating-questions.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The live report has eight sections. The owner's mockups also show transport, school zones, the building, new supply, where else to invest and a sources list. All of the data for these sits in local files (`data/raw`) or in Neon already, and all of it is CC BY. The owner said to continue with all remaining sections and will review once everything is in.

**Approach:** Add six layers on the existing contract, from real data only: L16 Transport (GTFS stops), L17 Schools (2026 school zones plus nearest schools, no quality scores), L11 Building (G-NAF unit count plus City of Melbourne building facts), L08 Supply (City of Melbourne development monitor), L10 Screener (nearby suburbs from data already in Neon) and L14 Sources (attribution list). Four small pipelines load the files into versioned tables. All six are `free` (same decision as batch 1: nothing paid can be sold yet). Decided by the builder, recorded here: planning, flood, bushfire, heritage, nearby amenities, crime, short-stay, sale history, price drivers, maps with base tiles and photos are NOT in this batch (see Boundaries).

## Boundaries & Constraints

**Always:** Layer contract (AD-1), evidence chips, AD-4 (every listed source `cleared` before the layer is enabled, attribution shown), AD-7 (loaders publish a new dataset version; layers read through `src_dataset_current`), AD-8 (layers read-only, pipelines write `ref_*`/`fact_*`), AD-9 (honest `gap` or `not_covered`, never a guess), AD-6 (the address pid and building pid are the keys; matching to outside records happens inside pipelines and stores the match type). Distances are straight-line and say so; no walk time, no isochrone. Coordinates come from the address or building row; with none, the layer is a `gap`. Every figure carries its dataset as-of date. Schools: the 2026 zone year, "not a guarantee of a place, confirm with the school or the Department", and the Department's note that zones should not be relied on for property purchase decisions are shown in the section. When no zone contains the point, say that only government neighbourhood schools have zones and that this address may have none. Building and Supply: City of Melbourne coverage only. A layer cannot return `not_covered` itself (only the rights gate does), so outside the municipality the layer returns `gap` with a message saying the dataset covers the City of Melbourne only (Building still shows the G-NAF unit count as a range labelled `Estimated`, per AD-6, as an `ok` section with the facts it has). Screener: gross yield is before costs; rent areas may group several suburbs; the conditions-rating band appears only where `market_validation` says validated (AD-5). Never print `DATABASE_URL`.

**Never:** Quality scores of any kind for schools or childcare (ICSEA, NAPLAN, VCE, NQS: My School and ACECQA terms bar commercial use). Predicted prices, growth or yield forecasts (AD-10). Mockup numbers or invented facts. A match between a City of Melbourne record and a G-NAF building that is a guess: no match means no data. OpenStreetMap tiles or any base-map tile fetch. Photos or placeholder photos. Planning, flood, bushfire or heritage data (the Vicmap server returned 504 on every call on 2026-11-21 and is not testable; next batch). Short-stay or AirDNA or Microburbs data. CRM sync. Stripe, entitlement or payment changes. Layers calling each other (L14 reads the other layers' results as a synthesis layer, the way L13 does).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Docklands unit | GAVIC720519114 (310/628 Flinders St) | L16 ok: nearest stop per mode with straight-line metres, counts within 400 m and 800 m. L17: zoned primary/secondary if a zone contains the point, otherwise the "may have none" text; nearest government and non-government schools. L11: unit count range plus matched City of Melbourne facts (year built, floors, use) with match type. L08: projects within 1 km by status. L10: nearby suburbs table. L14: every used source with licence and as-of | N/A |
| House outside the City of Melbourne | 14 Lucinda Lane, Cranbourne North | L16, L17, L10, L14 ok. L08 `gap` (City of Melbourne only); L11 `ok` with the G-NAF unit count only if the address has a building, otherwise `gap` | `gap`, never throw |
| No coordinates | address with null lat/lon | L16, L17, L08 `gap` "address has no coordinates" | gap |
| Point inside two zones | overlapping polygons | list each with its year level, never pick one | N/A |
| Ambiguous building match | two City of Melbourne buildings within the radius, or street name differs | no match, section says the building facts are not available | `gap` message for the CoM part |
| Source switched off | any listed source set `pending` | the rights gate returns `not_covered` for that layer | AD-4 fails closed |
| Loader check fails | row count outside bounds, zero stops for a mode, polygon not closing | loader exits non-zero, old dataset stays live | publish refused |
| Quality wording guard | any layer text | contains no ICSEA, NAPLAN, rating-of-school, forecast or predict wording | test fails |

</frozen-after-approval>

## Code Map

- `pipeline/lib/dataset.mjs` -- `createDatasetVersion` throws unless the `src_source` row exists (migration first). `LOADED_TABLES` (l.15-25) is a hard-coded cleanup list: add every new table. `makeBatchInserter(db, table, columns, dvId)` for bulk load (batches of 5000).
- `pipeline/lib/suburb-run.mjs`, `pipeline/publish/publish.mjs` -- `loadAndPublish`, `runCli`, `suburbChecks({salColumns: []})`; point datasets build checks from `rowCountMatchesDeclared`, `minRows`, `notMuchSmallerThanPrevious`, `sqlCheck`. Loader shape to copy: `pipeline/ingest/vgv-medians.mjs` (`parseX`, `loadX`, `xChecks`, `runX`, CLI guard, `markFailed` on error). `pipeline/lib/db.mjs` `--pglite` has pg_trgm only: NO PostGIS, so all spatial work is lat/lon bounding boxes plus haversine and ray casting in code.
- `pipeline/ingest/census-sal.mjs`, `locality-neighbours.mjs`, `gnaf-extract.py` -- examples of a Python helper plus Node loader (`python -I`, output into gitignored `data/out/`).
- Tests and fixtures: `pipeline/ingest/suburb-data.test.mjs`, `fixtures/suburb-data.mjs` (real excerpts), `src/server/testing/db.ts` (`createSuburbDataTestDb` runs real `runX` loaders with `minimum: 10`; add new loaders and keys to `SuburbDataset`), `db/migrations.test.mjs` (l.17 pins the migration list, l.22 the table list: add 0007 and the new tables; l.96-106 use ids `L06-shortstay` and `L99`: do not reuse), `src/server/layers/return-rating-questions.test.ts` l.379 pins the exact `LAYERS` order, `suburb-layers.test.ts` l.18, l.217-225 and l.376 pin layer lists. Fixture G-NAF ids differ from live: tests resolve "310/628 Flinders St Docklands" through `resolveQuery`, not `GAVIC720519114`.
- Layers: `src/server/layers/{types.ts,index.ts}`; a layer returns `{status: ok|gap, figures, payload, message?}`, a gap needs a non-empty message; locked layers return empty figures. Pattern: `L09-suburb-compare` and `L07-history`. Registry order is report order: L01, L02, L03, L16, L17, L11, L08, L05, L07, L09, L10, L15, then synthesis L13 and L14 last. `shared/figures.ts` (`figure`, `gapFigure`, `UNIT`: add `metres` and any new unit, and `src/render/format.ts`), `shared/derive.ts` (`dwellingFamily`, `percentText`).
- Repos pattern: `src/server/repos/{series,suburb,rating,datasets}.ts` join `src_dataset_current` and return `Versioned<T>` or null. Add `transit.ts`, `school.ts`, `building.ts`, `supply.ts` and a statewide yield query for L10.
- Runner: `src/server/services/layer-runner.ts` `rightsGate` needs a `layer_config` row, matching tier, non-empty `source_ids`, every source cleared, every `dataset_ids` entry published; timeout 8 s. L14 needs a non-empty `source_ids`: add an own-data source `vicprop_registry` (cleared). L13 and L14 are synthesis layers (second pass, `ctx.siblings`).
- Contract: `ResolvedAddress` has `lat`, `lon`, `building_id`, `building_name`, `street_number`, `street`, `is_multi_unit`, `sal_code`; `ref_building` has `unit_count`, `lat`, `lon`. `Figure.source_ids` needs at least one entry.
- Render: `src/render/report/ReportSection.tsx` l.24-31 `Extras` chain by `layer_id`; `tables.tsx` guards (`isObj`, `asRows`, ...) and `<div className="tw"><table>` markup; `src/site/copy.ts` `SECTION_QUESTIONS` (l.318), `SOURCE_NAMES`, `FOOTER.data`, `REPORT` captions; `src/render/pine.css` (append under the batch-1 block, tokens `--c-*`, `--accent`). Mockup for visual match: `_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/app-mockup.html` sections `#schools`, `#transport`, `#s9`.
- Data on disk (`data/raw`, gitignored). GTFS `vic/gtfs/vic_gtfs.zip` holds nested `N/google_transit.zip`: 1 regional train (route_type 2), 2 metro train (400), 3 metro tram (0), 4 metro bus (3 and 701), 5 regional coach (204), 6 regional bus (701), 10 interstate (102), 11 SkyBus (3). Tram and bus `stop_times.txt` are 400 to 500 MB: stream in Python, never load `trips.txt` whole (16 M rows). Representative-trip approach: keep one trip per (route_id, shape_id or headsign, direction), then read `stop_times` only for those trips to learn which routes serve each stop. Collapse platforms with the same `parent_station` into one station row. Schools: `vic/schools/zones2026.zip` holds `Primary_Integrated_2026.geojson` and `Secondary_Integrated_Year7..12_2026.geojson` in CRS84 lon/lat (`School_Name`, `Campus_Name`, `ENTITY_CODE`, `Year_Level`, `Boundary_Year`); `locations2026.csv` is cp1252 (not UTF-8), has `School_No`, `School_Name`, `Education_Sector`, `School_Type`, `School_Status`, address, `X` (lon), `Y` (lat). City of Melbourne: `buildings-with-name-age-size-accessibility-and-bicycle-facilities.csv` (one row per building per `census_year` 2002 to 2024: use the latest year each `property_id` appears; `construction_year`, `refurbished_year`, `number_of_floors_above_ground`, `predominant_space_use`, `building_name`, `street_address`, lat/lon), `residential-dwellings.csv` (one row per dwelling per year, `building_address`, `dwelling_type`), `development-activity-monitor.csv` (1451 projects: `status` COMPLETED, APPROVED, UNDER CONSTRUCTION, APPLIED; `year_completed`, `resi_dwellings`, bedroom splits, `floors_above`, `street_address`, `latitude`, `longitude`), all UTF-8 with BOM.

## Tasks & Acceptance

**Execution:**
- [x] `db/migrations/0007_batch2_layers.sql` -- sources `vic_school_zones_2026`, `vic_school_locations_2026`, `vicprop_registry` (all cleared, CC BY 4.0 attribution text; own data for the registry); tables `ref_transit_stop`, `ref_school_zone` (bbox columns plus rings as jsonb), `ref_school`, `ref_com_building`, `fact_supply_project`, each keyed by `dataset_version_id` with lookup indexes on lat/lon or bbox; `layer_config` rows for L16, L17, L11, L08, L10, L14 (free, enabled, every source cleared and listed). Update `spec-reported-web-lookup.md` to 0008. Update `migrations.test.mjs`.
- [x] `pipeline/lib/dataset.mjs` -- add the new tables to `LOADED_TABLES`.
- [x] `pipeline/ingest/gtfs-extract.py` and `gtfs-stops.mjs` -- stops with mode and routes served; checks: stops per mode within bounds, coordinates inside Victoria, no empty names, every mode present; `--pglite` dry run on a small committed fixture feed; script `pipeline:gtfs`.
- [x] `pipeline/ingest/school-zones.mjs` -- zones plus locations (two sources, two dataset versions), cp1252 CSV, join zone school to location by school number where the key matches, else keep the zone school name only; checks: rings closed, bbox sane, every zone has a name; `--pglite` dry run; script `pipeline:schools`.
- [x] `pipeline/ingest/com-buildings.mjs` -- buildings (latest year per property), dwelling counts per building, G-NAF building match with `match_type` (`exact_street_number` or `nearest_within_30m_same_street`, otherwise none, never a guess) and the development monitor into `fact_supply_project`; checks and dry run; script `pipeline:com`.
- [x] Repos and layers L16, L17, L11, L08, L10, L14 (+ registry, `UNIT` and format for metres) with figures, chips, as-of and the required copy; L10 uses only data in Neon; L14 is a synthesis layer built from the siblings' `source_ids` plus `src_source` and `src_dataset_current`.
- [x] Render: `ReportSection` Extras for the six layers; a dependency-free `SchematicMap.tsx` SVG (address at centre, 400 m and 800 m rings, stops and zoned schools by relative position, labelled straight-line and not a street map, no tiles) fed by L16 and L17 payload points; tables; `SECTION_QUESTIONS`; attribution in `FOOTER.data` and `SOURCE_NAMES`; Pine styles. Headings: "Which schools is it zoned for?", "How do you get around?", "What do we know about the building?", "What new apartments are coming?", "Where else could you invest?", "Where did all this come from?".
- [x] L13 questions: only where a new fact gives one without inventing (no zoned school found, no stop within 800 m, building age from the City of Melbourne record, under-construction supply nearby); each names its trigger.
- [x] Tests: loader tests per pipeline (success, failed check keeps old data), layer tests per matrix row with fixture addresses, the quality-wording guard, render tests, updated pinned lists. All 471 existing tests, `tsc` and `npm run build` stay green.
- [x] `RUNBOOK.md` section 10 (commands, order, what is real, what is not built).
- [x] Orchestrator only, after review (the implementer must NOT touch Neon, the network or Cloudflare): run migration 0007 and the four pipelines on Neon, verify Docklands and Cranbourne North through the report API, build, deploy `vicprop`, browser check, commit locally.

**Acceptance Criteria:**
- Given the Docklands unit, when the report loads, then L16, L17, L11, L08, L10 and L14 show real values from Neon with straight-line labels, as-of dates and no mockup number.
- Given an address outside the City of Melbourne, when the report loads, then L11 and L08 say the dataset covers the City of Melbourne only and no building fact is invented.
- Given any school section, when it renders, then it carries the 2026 zone-year and confirm-with-the-school wording and no quality score.
- Given the existing tests, `tsc` and the build, when the batch lands, then all pass.

## Implementation Notes

**Built.** Migration `0007_batch2_layers.sql` (sources `vic_school_zones_2026`, `vic_school_locations_2026`, `vicprop_registry`; tables `ref_transit_stop`, `ref_school_zone`, `ref_school`, `ref_com_building`, `ref_com_building_match`, `fact_supply_project`; six free layers). Pipelines `gtfs-extract.py` + `gtfs-stops.mjs`, `school-zones.mjs`, `com-buildings.mjs` on a shared `lib/point-run.mjs`. Layers L16, L17, L11, L08, L10 and L14 (`L14-attribution`; the coverage test forbids the word "source" in layer ids). `SchematicMap` SVG with no tiles. 605 tests, `tsc` and the build pass.

**Decisions made without asking.** Council to G-NAF match is driven from the G-NAF side in its own table (several street numbers share one council record); exact match needs same street, number and range within 250 m, range match needs exactly one candidate within 30 m, otherwise no match. School keys are `G` or `N` plus the number because government and non-government numbers overlap. The three Standalone zone files are loaded too. As-of dates: files saved to `data/raw` on 2026-11-14, GTFS feed built 2026-11-06. Council coverage is data-driven (a council building within 400 m). All six layers are free. Spec kept whole over the token guideline.

**Not built, with reasons.** See Design Notes.

**Run on Neon 2026-11-21.** Migration 0007 applied. Loaded and published: school locations (dataset 11, 2,318 schools) and zones (12, 2,372 zones, 2,361 joined to a school, 11 keep the name only), City of Melbourne (13: 14,093 buildings, 18,600 G-NAF buildings matched, 1,451 developments), GTFS (14: 28,777 stops: 324 train, 1,624 tram, 25,992 bus, 837 coach). Docklands unit: train 297 m (Southern Cross), tram 25 m, 52 tram stops within 800 m; zoned for Docklands Primary and University High; building 2018, 45 floors, G-NAF 732 units (range 658 to 806), council 719 dwellings; 5 projects (671 dwellings) under construction within 1 km. House at 12 Lucinda Lane: L11 and L08 say City of Melbourne only. Deployed as `vicprop` version 545bae45; browser check on desktop and 390 px, no horizontal scroll.

**Fixed after the live-data check.** The zoned secondary school appeared once per year level: now one figure per school with the year levels joined. The nearest-stop search stopped at 40 km, which gave a "nearest tram 28 km" for a house: now 15 km.

## Spec Change Log

## Review Triage Log

| # | Finding (reviewer) | Verdict | Route | Evidence |
|---|--------------------|---------|-------|----------|
| 1 | Council coverage judged by bounding box of all records: addresses in Yarra, Port Phillip and others get "0 projects" (blind, edge) | medium | patch | Verified in `getSupplyExtent` and `getComExtent`. Replaced by `isComCovered`: a current council building within 400 m. Test with a point inside the old box. |
| 2 | L16 map keeps the 60 nearest stops of all modes, so a train stop can vanish in dense areas (blind, edge) | medium | patch | Verified in `mapStops`. `pickMapStops` always keeps each mode's nearest. |
| 3 | Counts are stops, not services (blind) | low | patch | One caveat sentence added to the Transport panel; the real fix (frequency) is deferred. |
| 4 | Zone year hard-coded 2026 (blind, edge) | medium | patch | Derived from loaded `boundary_year`; "not in this school's zone" only when a zone exists for that school. |
| 5 | Council dwelling count can be from another year than the stated census year (blind, edge) | medium | patch | Count kept only when years match. |
| 6 | Screener cuts to 80 candidates before ranking; thin-sample rows lead the list (blind, gap, edge) | medium | patch | Cap raised to 2,000 with a note; thin rows sort last; shared thin predicates reused. |
| 7 | L13 triggers: supply question fires on offices and hotels; building-age chip hard-coded (blind) | medium | patch | Supply trigger now needs dwellings under construction above 0. The building-age chip was already taken from the L11 figure (hard-coded value was only a fallback); test added. |
| 8 | L08 shows no completions; total mixes certain and speculative dwellings (blind) | low | defer | Logged in `deferred-work.md`. |
| 9 | GTFS extractor: first-column assumption, stale manifest, row count mismatch (blind, edge) | medium | patch | Assertion, atomic write after `as_of`, manifest check. |
| 10 | GTFS key collision of parent stations across feeds; `as_of` from archive timestamp; parent anchor with bad coordinates (blind, edge) | low | reject | Parent ids are namespaced ("vic:rail:JOR"); the others are rare and the fixes add code. |
| 11 | One trip kept per route and shape loses frequency and some patterns (blind, edge) | medium | defer | Real limitation, logged; the caveat sentence now tells the reader. |
| 12 | School zone join not atomic; dangling `school_key` after a partial load (blind, edge) | medium | patch | Publish check that every zone key exists in current locations. |
| 13 | `Entity_Type` versus sector; second-campus join (blind, edge) | low | defer | Logged; no mismatch seen in the real file. |
| 14 | Attribution lacks licence link and "adapted" wording; credits a source whose section returned a gap (blind, edge) | medium | patch | Licence URL, "Adapted by VicProp", credit only from ok sections with a non-null figure. |
| 15 | Unit range plus or minus 10% presented as precise; `unitRange(0)` gives "1 to 1" (blind) | medium | patch | Guard below 1; note says indicative, not a measured error. |
| 16 | Match table column named building but holds a property-level pid; stale after G-NAF reload (blind, edge) | low | defer | L11 lookup works (a unit's `building_id` is the primary pid); staleness is in the RUNBOOK order and logged. |
| 17 | RUNBOOK section 9 says sections not built that section 10 builds; spec tasks unchecked (blind) | low | patch | Updated by the orchestrator. |
| 18 | `pipeline:gtfs` hard-codes `python` (blind, edge) | low | defer | Logged; Python is on PATH on this machine. |
| 19 | Copy numbers duplicated beside constants (blind) | low | defer | Logged. |
| 20 | Loader robustness: empty rows, missing CSV column, duplicate `development_key`, unknown statuses (blind, edge) | medium | patch | Clear errors added for the first three. Unknown statuses are still counted aside and checked by the "all four statuses present" check. |
| 21 | L10 rating fifth and position never asserted; thin markers untested (gap) | medium | patch | Tests added. |
| 22 | Production file paths of the loaders never executed in a test (gap) | medium | patch | `schools.real` and `com.real` tests added with default thresholds, skipped when files are absent. GTFS real run and nested-zip fixture deferred (minutes to run). |
| 23 | L13 now depends on three more sources, so a pending source switches the whole section off (gap) | false | reject | Intended: AD-4 fails closed, as in batch 1. |
| 24 | Layers have no state check (edge) | low | defer | Only Victoria is loaded; logged. |
| 25 | Zone rings JSON unparseable gives an empty polygon; render robustness (undefined census year, hop default, React keys); `fixtureStops` cache after rejection (edge) | low | reject | Data and payloads are produced by our own loaders and layers; fixes add guards for states that cannot be reached. |
| 26 | School map rings are not 400 m and 800 m (edge) | false | reject | The spec asks for 400 m and 800 m rings on stops; schools are kilometres apart, so kilometre rings are the honest scale. |
| 27 | `formatValue` shows "1,000 m" for 999.6 (edge) | low | patch | One-line rounding fix. |
| 28 | Screener drops the subject row when it has no price or rent (edge) | low | defer | Logged. |

## Design Notes

Not built in this batch, with reasons (also for the final report). Planning, flood, bushfire and heritage: the Vicmap WFS (`opendata.maps.vic.gov.au`) returned 504 on every request on 2026-11-21, so an adapter cannot be tested; next batch (live WFS through `vendor_cache`, per the spine). Nearby amenities: Vicmap Features of Interest has no shops, supermarkets or cafes; OSM or Overture needs a licence decision (ODbL duties; Overture Places CDLA text unread). Crime: the Crime Statistics Agency file is not downloaded yet. Short-stay (L06): vendor rights `pending`; the CRM register needs a sync and an owner decision on aggregation. Sale history: reported web lookup, rights `pending`. Price drivers (L04): the model came from Domain data, which the owner ruled out. Photos: no licensed source. Base maps: OSM tile policy bars bulk use.

## Verification

**Commands:**
- `npm test` -- expected: all tests pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: builds
- each new pipeline with `--pglite` -- expected: dry run prints row counts and passes its checks

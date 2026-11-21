---
title: 'Victorian suburb data and layers L02 Rent, L03 Price, L07 History, L09 Suburb compare (build order step 2a)'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
baseline_commit: '8825e377c2522da676572166b740103cd4d6f170'
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
- [x] `db/migrations/0004_vic_suburb_layers.sql` -- add missing tables or columns (`series_*` for dwelling type and period, Census marker table, `ref_suburb_neighbour`), seed sources `vgv_medians`, `homes_victoria_rents`, `abs_census_2021`, `abs_seifa_2021` as `cleared` (all CC BY 4.0, with attribution text), and `layer_config` rows for L02, L03, L07, L09 enabled -- AD-4, AD-7
- [x] `pipeline/ingest/{vgv-medians,homes-vic-rents,census-sal,seifa-sal,locality-neighbours}.mjs`, `pipeline/lib/*` -- parse, map to SAL with a stored match type, report unmatched counts, publish a dataset version each; row-count and range checks -- AD-6, AD-7
- [x] `src/server/repos/{series,suburb}.ts` -- current-pointer reads for medians, rents, markers, neighbours
- [x] `src/server/layers/{L02-rent,L03-price,L07-history,L09-suburb-compare}/index.ts`, `layers/index.ts` -- layers per the matrix; shared derive helpers (CAGR, gross yield) with their method named in the figure `note`
- [x] `src/routes/index.tsx` and a small `src/render/format.ts` -- format figures by `unit` (AUD, percent, count, weeks); show all layers
- [x] `src/**/*.test.ts`, `pipeline/**/*.test.mjs` -- one test per matrix row on fixtures; parser tests on small real excerpts; test that no layer output contains a score or forecast field
- [ ] (owner runs it, see Implementation Notes) Real run: migrate and load into the user's Neon DB with `--env-file=.env`; spot-check Docklands against `data/suburb_context.json` ($800 two-bed flat, Jun 2026) and `data/vgv_unit_growth.json`; record counts and unmatched names in Implementation Notes

**Acceptance Criteria:**
- Given the loaded Neon database, when the report for a Docklands unit is requested, then L01, L02, L03, L07 and L09 are `ok`, every figure has a chip, source ids and an `as_of`.
- Given a suburb with no neighbour rows, when L09 runs, then it returns `gap`, not an error.
- Given `npm test`, `npx tsc --noEmit`, `npm run build`, then all pass.
- Given the real load, then unmatched suburb counts per source are written in Implementation Notes.

## Implementation Notes

Heads-up before you start: a G-NAF address load (4.19M rows, `pipeline/ingest/gnaf-load.mjs`) was running in the background against the same Neon database when this spec was approved. Do not touch `ref_address`, `ref_building` or the `gnaf` dataset. Check that `src_dataset_current` has a `gnaf` row before the real run (the load may still be going or may have failed on a storage limit); if it is missing, build and test with PGlite, run the real loads for your own datasets only, and say so in your report. The Neon plan may have a small storage cap: check `pg_database_size` before and after.

**Owner decision 2026-11-20 (supersedes the real-run task):** the owner will run the real migration and loads against Neon themselves. Do not connect to the remote database or read `DATABASE_URL`. Verify with PGlite instead: run each new pipeline end to end against the real files in `data/raw/` into an in-process PGlite database (load `pipeline/ingest/suburbs-sal.mjs` first for `ref_suburb`), record row counts and unmatched suburb names per source in these notes, and give each loader a clear `--env-file=.env` real-run command. The foundation was committed as `8825e377c2522da676572166b740103cd4d6f170` (baseline moved there on purpose so the diff shows only this work). Deliver the run order and any env vars the owner needs as a runbook in these notes.

### Build notes (2026-11-20, subagent run)

**What was built.** Migration `0004_vic_suburb_layers.sql`; five loaders in `pipeline/ingest/` (`vgv-medians`, `homes-vic-rents`, `census-sal`, `seifa-sal`, `locality-neighbours`) on shared `pipeline/lib/{sal-map,suburb-run,files,csv,zip}.mjs` and `zip_member.py`; repos `series.ts` and `suburb.ts`; layers L02, L03, L07, L09 with helpers in `src/server/layers/shared/`; `src/render/format.ts`; the search page shows all layers, an L07 annual price table and an L09 side-by-side table.

**Deviations and decisions the owner should know about.**
- New source `gnaf_neighbours` (not in the spec's list of four). The adjacency comes from G-NAF but the `gnaf` dataset must not be touched, and each source has one pointer, so it needs its own source row. Seeded `cleared` on the same owner statement as migration 0003 (Geoscape approved; written confirmation not seen). If `gnaf` goes back to pending, set `gnaf_neighbours` to pending and switch L09 off.
- Dataset-missing check added to the runner: `LayerDef.dataset_ids`, `RightsContext.datasets`, checked inside `rightsGate`, so `/coverage` also reports such a layer as `not_covered`.
- `series_price` and `series_rent` were reshaped in 0004 (empty tables): `period_type` joins the key, `series_rent` gains `bedrooms` and the `all` dwelling type, `bonds_count` is renamed `lettings_count`, and both store `low_count`, `source_name` and `sal_match_type`. New tables `fact_suburb_marker`, `ref_suburb_neighbour`, `src_dataset_unmatched` (counts and lists set-aside rows; also holds `out_of_range` values).
- A source value outside its plausible range is set aside and listed, not loaded and not failed on: one real case, TAYLORS LAKES units 2018 = $7,000 (flagged `^` in the file). Census `unoccupied_share` above 1 (ABS noise in tiny suburbs) is set aside the same way, never clamped.
- `buildSalIndex` gained `matchSourceName`, which also tries the Valuer-General "NAME (COUNCIL)" form against ABS "Name (Council - Vic.)". The existing `match` is unchanged.
- Four tests that already failed on the baseline commit were fixed: migration 0003 (gnaf cleared, L01 on) had made `db/migrations.test.mjs` and the "production seed" test in `layers.test.ts` stale. They now assert the 0003 state.
- Census and the G-NAF zip are read through `python -I pipeline/lib/zip_member.py` (Node has no zip reader; same precedent as `gnaf-extract.py`). Python must be on PATH for those two loaders.
- Not done: the spec frontmatter was not set by the build (it is now `status: in-review`, with `baseline_commit` moved to `8825e37`); no commit; no change to `scripts/`, `data/raw/` or migrations 0001 to 0003.

**PGlite verification on the real files** (`pipeline/ingest/suburb-data.real.test.mjs`; suburbs loaded first, 2,944 SALs; each loader published its own version). `npm test` runs it when `data/raw` exists.

| Source | Rows loaded | as_of | Set aside (distinct names) |
|---|---|---|---|
| vgv_medians | 19,108 price rows | 2026-03-31 | 33 names matched no suburb, 1 out of range. Matched per file: units annual 443 of 463, units quarterly 426 of 446, houses annual 766 of 797, houses quarterly 742 of 772 |
| homes_victoria_rents | 23,716 rent rows (quarters from Jun 2015) | 2026-06-30 | 66 areas matched no suburb (grouped areas) and 1 ambiguous (Newtown); 79 of 146 areas matched on every sheet |
| abs_census_2021 | 24,112 marker rows, 2,944 suburbs | 2021-08-10 | 2 codes not in the suburb list (29494, 29797); 10 `unoccupied_share` above 1 (20228, 20287, 20747, 21323, 22004, 22167, 22610, 22641, 22654, 22871) |
| abs_seifa_2021 | 11,264 marker rows, 2,816 suburbs | 2021-08-10 | none |
| gnaf_neighbours | 16,704 directed pairs, 2,911 suburbs, from 17,240 G-NAF pairs (536 dropped because one side is unmatched) | 2026-08-31 | 43 localities of 2,996: 15 ambiguous, 28 no match |

Unmatched names, Valuer-General (any of the four files): Altona East, Cheltenham East, Cheltenham North, Clayton North, Coburg East, Cowes West, Fishermans Bend, Jolimont, Kew North, Lara Lake, Laverton South, Merinda Park, Osborne, Rosebud South, Sanctuary Lakes, Studfield, Syndal, Wallan East, Westall, Westgarth, Balcombe, Coonans Hill, Fiveways, Garden City, Green Lake, Hastings West, Hillside (Greater Melbourne), Jeeralang North, Kangaroo Ground South, Patterson Gardens, Sunnycliffs, Wendouree West, Woolamai Waters (cause not checked name by name; the list includes long-standing suburbs such as Westgarth, Syndal, Studfield, Jolimont, Coburg East and Cheltenham East as well as Fishermans Bend, so it is not only post-2021 suburbs). Out of range: Taylors Lakes unit 2018 $7,000.
Unmatched, Homes Victoria: 66 areas, nearly all groups of suburbs, for example Carlton-Parkville, Prahran-Windsor, Richmond-Burnley, Collingwood-Abbotsford, CBD-St Kilda Rd, Mt Eliza-Mornington-Mt Martha, Ballarat, plus "Wanagaratta" (misspelt in the file) and "Newtown" (ambiguous). The full list is printed by `node pipeline/ingest/homes-vic-rents.mjs --pglite`.
Unmatched, G-NAF neighbours, ambiguous: Thomson, Myall, Merrijig, Moonlight Flat, Killara, Stony Creek, Bellfield, Newtown, Hillside, Happy Valley, Springfield, Big Hill, Golden Point, Ascot, Fairy Dell. No match: Jilpanger, Larralea, Lyal, Moyarra, Jung, Blackheath, Thalloo, Wanalta, Condah Swamp, Mount Eccles South, Arapiles, Grass Flat, Coopers Creek, Inkerman, Tantaraboo, Broadlands, Granite Flat, Queensferry, Banksia Peninsula, Shannonvale, Fieldstone, Stanhope South, Baynton East, Woodside North, Speewa, Waranga, Tylden South, Tidal River.

**Spot checks against the research files (all pass in the real test).** Docklands 2-bedroom flat: $800 a week, 1,471 new lettings, $750 a year ago, +6.67% (`data/suburb_context.json`). Docklands units (`data/vgv_unit_growth.json`): March-quarter 2026 median $566,500 on 144 sales, change -10.8%, calendar 2025 median $585,000, 5-year rate -0.6%, 10-year rate -1.0%, annual series 2015 to 2025 equal to the file. Docklands has no house medians, so L03 shows a gap figure. L09 for Docklands lists Melbourne, Port Melbourne, South Melbourne, South Wharf, Southbank and West Melbourne (the six G-NAF neighbours), none left out. Gross yield for the 2-bedroom flat is 7.3% (rent $800 x 52 / $566,500).

**Runbook for the owner (real Neon run).** Nothing here has run against the remote database. Only `DATABASE_URL` is needed, in `.env`; python 3 must be on PATH. Check size first and after: `SELECT pg_size_pretty(pg_database_size(current_database()));` (the five loads add about 95,000 small rows, a few megabytes).
1. `node --env-file=.env db/migrate.mjs` applies 0004 (adds the tables, five sources, four layer rows, all enabled).
2. `node --env-file=.env pipeline/ingest/suburbs-sal.mjs` only if `abs_asgs_2021` has no published version (`SELECT * FROM src_dataset_current`). The loaders refuse to run without it.
3. Each loader, in any order; each prints rows, matched counts and the set-aside list, exits non-zero on a failed check and leaves the old pointer in place: `node --env-file=.env pipeline/ingest/vgv-medians.mjs`, then `homes-vic-rents.mjs`, `census-sal.mjs`, `seifa-sal.mjs`, `locality-neighbours.mjs`. Dry run any of them in memory with `--pglite` instead of the env file. `npm run pipeline:suburb-data` runs all five if `DATABASE_URL` is already set in the shell.
4. Check: `GET /api/v1/coverage` shows L02, L03, L07 and L09 as `live`; `GET /api/v1/property/{pid}/report` for a Docklands unit returns them `ok`.
5. Roll back a layer without code: `UPDATE layer_config SET enabled = false WHERE layer_id = 'L09-suburb-compare';`. The G-NAF address load does not need to be finished for these loads; the report needs it only to resolve an address.
6. Point a source back to its previous published version after a bad load that passed its checks (one statement; change the source id; old rows stay in the tables until a retention job exists, so they are still readable). It errors, and changes nothing, if there is no earlier published version:
   `UPDATE src_dataset_current c SET dataset_version_id = (SELECT v.dataset_version_id FROM src_dataset_version v WHERE v.source_id = c.source_id AND v.status = 'published' AND v.dataset_version_id < c.dataset_version_id ORDER BY v.dataset_version_id DESC LIMIT 1), published_at = now() WHERE c.source_id = 'vgv_medians';`
   Source ids: `vgv_medians`, `homes_victoria_rents`, `abs_census_2021`, `abs_seifa_2021`, `gnaf_neighbours`. Reports pick the change up on the next request.
7. Retry a failed load: a load that fails a check exits non-zero, leaves the pointer where it was, marks its version `failed` and deletes its rows. Fix the cause (usually the file, or the minimum row count in the message), then run the same loader again; it creates a fresh version. The failed version row stays as a record and is harmless.

## Design Notes

L09 uses the G-NAF neighbour table so the comparison set is real adjacency, not a distance guess. Gross yield is `median weekly rent x 52 / median price` for units and is `Estimated` because the rent and price geographies differ. Ranks are shown as "n of m among these suburbs" and never summed.

## Verification

**Commands:**
- `npm test` -- expected: all pass (run from PowerShell, proper-case path)
- `npx tsc --noEmit` -- expected: clean
- `npm run build` -- expected: Worker bundle builds

## Review Triage Log

| # | Finding (reviewer) | Verdict | Route | Evidence |
|---|--------------------|---------|-------|----------|
| 1 | L02 yield gap note says "publishes no median" when vgv is not loaded (blind, edge) | medium | patch | Confirmed in L02: null `listPrices` fell into the not-published branch. Fixed, test checks note. |
| 2 | L07 silently omits rent figures when rents unpublished (blind, edge) | medium | patch | Confirmed: `rentDs` null skipped figures with no message. Gap figure added, tested. |
| 3 | L09 caps neighbours at 24 silently and reports the capped count (blind, edge, gap) | medium | patch | Confirmed in `listNeighbours` and the slice. True count, `total_neighbours` and a note added, tested with 30 neighbours. |
| 4 | SEIFA flag q stored but ignored (blind, edge) | medium | patch | Confirmed: L09 read only `.value`. Now Estimated with a small-population note, tested. |
| 5 | Carried-forward median labelled "fewer than 10 sales" (blind, edge) | low | patch | Confirmed in L07 note. Shared `priceThinNote` now used by L03 and L07. |
| 6 | Python discovery stops at the Windows Store stub (blind, edge) | medium | patch | Confirmed: first spawned executable returned. Every candidate is tried, fake-spawner test added. |
| 7 | `formatPercent` prints "-0.0%" (blind, edge) | low | patch | Confirmed; direct fix with test. |
| 8 | carried_forward never asserted; markFailed cleanup and publish checks only seen passing; payload unit and thin not asserted (gap) | medium | patch | Verified by the filed evidence (no test referenced them). 19 tests added in `suburb-data-checks.test.mjs` and `suburb-layers.test.ts`. |
| 9 | Dead code added (blind) | low | patch | Confirmed by symbol search; deleted. |
| 10 | Spec notes contradict the frontmatter; unmatched-name cause unverified; no rollback step (blind) | low | patch | Notes corrected, rollback and retry steps added to the runbook, rollback SQL tested. |
| 11 | CC BY attribution text is seeded but never rendered (blind) | medium | defer | Already a launch blocker in deferred-work.md; the site footer and a per-source credits block land in step 2b. |
| 12 | L09 table and history table drop per-column provenance, cast payloads unchecked, no table caption (blind, edge) | low | defer | `src/routes/index.tsx` is replaced wholesale by the step 2b report page; fix there. |
| 13 | Table columns show a thin median as Observed in the UI (edge) | low | defer | The figures carry Estimated; only the old index.tsx table differs, replaced in step 2b. |
| 14 | 66 grouped Homes Victoria areas (Carlton-Parkville, Richmond-Burnley and others) give L02 a gap (blind) | medium | defer | Real product gap for inner-city apartments; needs an owner decision on showing area-level rent. Already recorded. |
| 15 | 33 unmatched Valuer-General names, some real suburbs (blind) | medium | defer | Cause not checked name by name; a manual alias table could recover them. |
| 16 | G-NAF adjacency incomplete: 536 pairs dropped, not disclosed in L09 (blind) | low | defer | Needs the loader to store the dropped count; not a wrong figure, a shorter list. |
| 17 | Stale latest year or quarter shown under the dataset as_of; quarters mixed in L09 (edge, blind) | low | defer | The label or note names the period; as_of is the dataset date. Tolerable, record for a freshness pass. |
| 18 | Pointer can flip between the as_of read and the rows read (edge) | low | defer | One operator, loads are rare; fix with one joined query later. |
| 19 | VGV parser drops rows whose name has unusual characters without listing them (edge) | low | defer | Not seen in the real files (all 33 odd names are listed); harden the regex later. |
| 20 | Census or SEIFA out-of-range cell fails the whole publish (edge) | low | reject | Failing loudly is the stated AD-7 behaviour; shares above 1 are already set aside. |
| 21 | fact_suburb_marker stores no match type (edge) | false | reject | Census and SEIFA are keyed by SAL code directly (spec: join on SAL code); there is no name match to record. |
| 22 | L07 not_covered when rents are uncleared but only gap when unpublished (blind, edge) | false | reject | AD-4 requires every listed source cleared; the two states are different by design and both now say why. |
| 23 | Retired locality reported under its raw pid (edge) | low | reject | Cosmetic, and unlikely to be seen. |
| 24 | Zip reader has no committed fixture; real-file test skipped when data/raw is absent (gap, blind) | low | defer | Real-file test covers it on the owner's machine; a tiny fixture zip would close it. |
| 25 | Dev-seed assertions weakened; seed comment stale; `dollars` duplicates `formatAud`; temp dirs not removed (blind, edge) | low | defer | Developer-only; no user harm. |

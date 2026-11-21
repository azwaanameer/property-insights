---
title: 'Report batch 3, section 3: nearby places (L20) served from a loaded OpenStreetMap extract'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0019158'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L20 "What is nearby?" was built on live calls to the public Overpass API. On the live Worker that call times out after 8 seconds every time, and from the build machine the public server answers "406 Not Acceptable" or hangs, so the section is always a gap. The public Overpass servers are also a fair-use service that must not carry a paid product's traffic.

**Approach:** Load Victorian places from the OpenStreetMap extract (ODbL 1.0, user ruled on 2026-11-21 that the credit "© OpenStreetMap contributors" is accepted) into a versioned table by a pipeline, and make L20 read that table. Remove the Overpass adapter. Mapillary and Wikimedia adapters stay as they are.

## Boundaries & Constraints

**Always:** Real data only; AD-1..AD-11. Same categories, same layer output shape and render as the current L20 (groceries, food, parks, medical, fitness, library; nearest named place with straight-line metres and counts within 400 m and 800 m; unnamed places counted not named; no rating, review or score). Credit "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright on the section and in L14; as_of is the extract date. Pipeline pattern of batches 2 and 3: versioned dataset through `pipeline/lib/dataset.mjs`, publish checks, `--pglite` dry run, committed small fixture, real-file test skipped when `data/raw` is absent. A place needs a point: ways and relations take their centroid. Layer returns a gap (not an error) if the dataset is not loaded.

**Never:** No live Overpass or other outside call for places; no new vendor adapter; no change to L19 or the Mapillary and Wikimedia adapters; no push; no Neon, Cloudflare or network access by the implementer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Places nearby | address in Docklands, dataset loaded | Per category: nearest named place, metres, counts at 400 m and 800 m, OSM credit | N/A |
| Unnamed place | element without a name tag | counted, not named | N/A |
| Nothing in a category | none within 800 m | that category shows none within 800 m, others unaffected | N/A |
| Outside Victoria or no coordinates | state not VIC or lat/lon null | gap with a plain message | N/A |
| Dataset not loaded | no current dataset | gap "Nearby places are not loaded." | N/A |

</frozen-after-approval>

## Code Map

- Data: `data/raw/vic/osm/australia-261120.osm.pbf` (Geofabrik Australia extract of 2026-11-20, about 977 MB, downloading; the orchestrator has downloaded it, the implementer waits for the file to exist and be complete: size 976690287 bytes). No Victoria-only extract exists on Geofabrik, so the extractor keeps only features inside Victoria's bounding box (lon 140.9 to 150.1, lat -39.3 to -33.9) and may drop any whose point is clearly outside Victoria afterwards using the existing suburb data if cheap; the bounding box is enough.
- Reader: `pyosmium` (Python `osmium`), not installed system-wide. Run with `uv run --no-project --with osmium python pipeline/ingest/osm-places-extract.py` (uv 0.11 is installed; test that `python -I` still works under it, else drop `-I` and keep the script directory free of other modules). Use a `FileProcessor` with a tag filter for the tags below, node locations for ways, and a centroid for ways/relations (areas via `with_areas()`), writing JSON lines to `data/out/osm-places/` with a manifest (as_of 2026-11-20 from the file name `261120`, file sha256, counts per category) like `pipeline/ingest/crime-extract.py` and `gtfs-extract.py`.
- Tags (same as the current Overpass query in `src/server/vendors/overpass.ts`): `shop` in supermarket, convenience, greengrocer, bakery; `amenity` in cafe, restaurant, pharmacy, doctors, clinic, hospital, library, gym; `leisure` in park, fitness_centre, playground. Reuse `categoryOf` from that file (move it into a shared module, e.g. `src/server/layers/shared/place-category.ts`) so the extractor's category rule (re-implemented in Python, with a parity test like `normalise-parity.test.ts`) and the layer agree.
- Loader: `pipeline/ingest/osm-places.mjs` + `package.json` script `pipeline:places` (like `pipeline:crime`; note `.env` is not read by npm scripts, document run order), table `ref_place (dataset_version_id, osm_id text, category text, name text null, lat double precision, lon double precision)` with an index on `(dataset_version_id, lat, lon)` and `(dataset_version_id, category)`; add to `LOADED_TABLES` in `pipeline/lib/dataset.mjs` and schemas in `pipeline/lib/schemas.mjs` like batch 2. Publish checks: every category present; coordinates inside the Victoria box; no duplicate osm_id; sane total (the full file should give at least 20,000 and at most 600,000 rows; supermarkets 500 to 5,000; parks at least 5,000) and a Melbourne CBD spot check (at least 50 food places within 800 m of -37.8136, 144.9631).
- Migration `db/migrations/0010_places_dataset.sql` (next after 0009_photos_places.sql): `ref_place`; the `openstreetmap` source row already exists (cleared, ODbL) from 0009: update its attribution if needed and set `max_cache_days` only if the dataset mechanism requires it; update the L20 `layer_config` row if a column needs the new dataset id. Renumber the migration reference in `_bmad-output/implementation-artifacts/spec-reported-web-lookup.md` from 0010 to 0011. Update pinned lists (`db/migrations.test.mjs`, `src/server/testing/db.ts`, `home.test.tsx`, `return-rating-questions.test.ts`, `src/server/layers/index.ts` consumers) as earlier batches did.
- Layer: `src/server/layers/L20-places/index.ts` (read the current one first and keep its figures, payload shape and copy), new repo `src/server/repos/place.ts` (bounding box prefilter then `haversineMetres`, like `repos/transit.ts` and `repos/school.ts`), `dataset_ids: ["openstreetmap"]`. Remove `src/server/vendors/overpass.ts`, its parts of `vendors.test.ts`, `types.ts`, `index.ts`, `fake-vendors.ts` (the `places` vendor), the `PlacesData` plumbing and the `LayerDef.timeout_ms` override only if nothing else uses it (L19 still does). Update RUNBOOK section 12 and L14 credit tests.
- Render: `src/render/report/PhotosPanel.tsx` (PlacesPanel lives there; keep unless payload changes), tests `photos-places.test.tsx`, `photos-places-layers.test.ts`.
- Do not change: L19, Mapillary and Wikimedia adapters, rights-gate semantics.

## Tasks & Acceptance

**Execution:**
- [x] `pipeline/ingest/osm-places-extract.py`, `osm-places.mjs`, fixtures (a tiny `.osm` XML under `pipeline/ingest/fixtures/places/` read by the same extractor), `osm-places.test.mjs`, `osm-places.real.test.mjs` (skipped when the pbf is absent), `package.json` script -- versioned load with the checks above and a `--pglite` dry run
- [x] Run the extractor on the real file locally (read-only on the local pbf, no network) and run the real-file test and the PGlite dry run on the extract; report the per-category counts and the extract time
- [x] `db/migrations/0010_places_dataset.sql`, pinned lists, web-lookup spec renumber
- [x] `src/server/repos/place.ts`, `L20-places`, shared category module, remove the Overpass adapter and its tests, L14 credit unchanged
- [x] Tests for the layer matrix rows, the parity of the category rule, the repo; keep all 729 existing tests passing (adjust only those that tested the removed adapter)
- [x] `RUNBOOK.md` section 12 update (run order: `uv run ... osm-places-extract.py` then `node --env-file=.env pipeline/ingest/osm-places.mjs`), `deferred-work.md`, Implementation Notes; do NOT touch Neon, Cloudflare or the network; do not commit

**Acceptance Criteria:**
- Given the Docklands unit and a loaded dataset, when the report loads, then L20 shows each category's nearest named place, metres labelled straight-line, counts at 400 m and 800 m, and the OpenStreetMap credit.
- Given no dataset, when the report loads, then L20 is a gap and nothing else changes.
- Given `grep -ri overpass src` then no production code calls Overpass.
- Given `npm test` (PowerShell), `npx tsc --noEmit` and `npm run build`, then all pass.

## Implementation Notes

**Built.** `pipeline/ingest/osm-places-extract.py` (pyosmium via `uv run --no-project --with osmium python -I`; node locations, `with_areas` for multipolygon relations, tag filter in C++; centroid of a closed way by the shoelace formula, mean of points for an open way, area-weighted outer-ring centroid for a relation), `osm-places.mjs` (zod, versioned load, publish checks, `--pglite`, runner fallback uv offline, uv, python), script `pipeline:places`, schemas `PlaceRow` and `PlacesManifest`, `ref_place` in `LOADED_TABLES`, migration `0010_places_dataset.sql` (table, two indexes, the `openstreetmap` source row re-described and `max_cache_days` set null; L20's layer_config row needed no change; `spec-reported-web-lookup.md` renumbered 0010 to 0011). Serve side: `repos/place.ts`, `layers/shared/place-category.ts` (`categoryOf`), L20 reads the table; the Overpass adapter (`vendors/overpass.ts`), the `places` vendor, `OsmPlace`/`PlacesData` and the fake `places` vendor are gone (`grep -ri overpass src` is empty). `LayerDef.timeout_ms` stays, L19 uses it. Fixture `fixtures/places/places-excerpt.osm` (22 places among 20 tagged nodes, 4 tagged ways and one multipolygon relation, edge cases listed in `fixtures/places.mjs`), test helpers `testing/places.ts` (`setPlaces`, `clearPlaces`, `osmPlace`), `createSuburbDataTestDb` loads the excerpt as dataset `places`. Tests: `osm-places.test.mjs`, `osm-places.real.test.mjs`, `place-category.test.ts` (python/TypeScript parity), `repos/place.test.ts`, the L20 matrix rows in `photos-places-layers.test.ts`, the render test, the migration test and the pinned lists. RUNBOOK section 12 and `deferred-work.md` updated.

**Real run (local, read-only on the pbf, no network except uv's package cache).** Extract of `australia-261120.osm.pbf` (976,690,287 bytes): 66 s, 45,746 places: groceries 5,325 (supermarkets 1,716), food 10,887, parks and playgrounds 25,039, medical 3,172, fitness 905, library 418; 16,899 nodes, 28,509 ways, 338 relations. The real-file test and the `--pglite` dry run (3 s after the extract) pass every default check (20,000 to 600,000 rows, 500 to 5,000 supermarkets, at least 5,000 parks, every category, 50 food places near the CBD).

**Decisions made without asking.**
- The spec's Code Map says `dataset_ids: ["openstreetmap"]` for L20 but its I/O matrix and acceptance criteria say a missing dataset is a gap "Nearby places are not loaded." With `dataset_ids` the rights gate would return `not_covered` instead, so the layer lists none and returns the gap itself (the crime layer did the same). The matrix wins; logged in deferred work.
- "Supermarkets 500 to 5,000" is checked on the extractor's own count of `shop=supermarket` (1,716), kept in the manifest as `counts_by_tag`, because the table stores only the six categories (`groceries` also holds convenience, greengrocer and bakery, 5,325). Parks "at least 5,000" is the `parks` category (parks and playgrounds, 25,039).
- The payload's `truncated` flag and its note are removed: there is no element limit any more, so the field would always be false and the note could never show. Everything else in the L20 payload, figures and copy is unchanged; the render is unchanged.
- An address outside Victoria is a gap ("Nearby places are loaded for Victorian addresses only."), checked before coordinates, as in L18.
- The extractor takes closed ways from the way objects (not from their areas) and only relations from areas, so each feature is one row; `ways` with no area (open) take the mean of their points. A relation tagged only on its outer way is not picked up (deferred).
- The Victoria box also holds southern New South Wales; no border polygon is loaded, so those rows are kept (deferred). The box check is by coordinates only.
- `max_cache_days` on the source is set null (a loaded dataset has no cache lifetime), so the 0009 migration test now asserts the 30-day ceiling for the two live vendors only.
- `uv run --offline` is tried first, then online `uv run`, then plain `python` (needs osmium), so tests do not depend on the network once uv has cached osmium. The parity test needs only plain `python -I` (`--categories` mode, no osmium).
- `placeChecks` also fail the load if the CBD spot check, parks or total are below the thresholds, so the tiny committed excerpt is published in tests with scaled thresholds (`PLACES_EXPECT`), and the default thresholds are proven to refuse it.
- A shared `batch2-layers.test.ts` assertion that every cited source is CC BY now allows ODbL for OpenStreetMap, because the Docklands report cites the loaded excerpt.

**Not done / for the orchestrator.** Migrations 0009 and 0010 on Neon, the places load on Neon (`node --env-file=.env pipeline/ingest/osm-places.mjs` after the extract; about 45,746 rows), `npm run build` and `npx wrangler deploy`, then the browser check on GAVIC720519114 and GAVIC425618586 at 1200 px and 390 px. Nothing was committed, and nothing touched Neon or Cloudflare.

## Spec Change Log

## Review Triage Log

## Design Notes

A loaded extract is stable, fast (one indexed query), free of fair-use limits, and versioned, at the cost of being as old as the file (refresh from Geofabrik when wanted; weekly files exist). The extract is of all Australia because Geofabrik publishes no state-level files; only Victoria is kept.

## Verification

**Commands:**
- `npm test` in PowerShell -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: success

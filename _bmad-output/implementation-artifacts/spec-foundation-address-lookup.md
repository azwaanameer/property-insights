---
title: 'Foundation and address lookup (build order step 1)'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
baseline_commit: '723b6a6cea148b4edc9353f8e9907fd1ed6fdaef'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/OVERVIEW.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** VicProp has research scripts and an approved architecture but no application. Nothing yet turns a typed address into a building, a suburb and a report envelope with free and locked layers.

**Approach:** Scaffold the Cloudflare/TanStack Start app, the Postgres schema, dataset versioning, the layer and report contracts, the entitlement seam and rights gate, a Victorian G-NAF loader, and address suggest and resolve, ending in one real layer (L01 Property) behind `GET /api/v1/property/{gnaf_pid}/report`. Spine ADs 1 to 10 bind.

## Boundaries & Constraints

**Always:** Layers are read-only and return `LayerResult` (AD-1). Locked layers send a teaser and no figures (AD-3). A layer is enabled only if all its sources are `cleared` (AD-4). Keys are G-NAF pid, building = primary pid, suburb = SAL 2021 code (AD-6). Repositories read only the current dataset pointer; publish is one transaction (AD-7). Pipelines write `ref_/series_/derived_/fact_/src_`; the app writes `app_` and `vendor_cache` only (AD-8). Zod at every route and loader boundary. Never run migrations or loads against a remote database without `DATABASE_URL` being set by the user; tests use in-process PGlite.

**Never:** No login or payments (entitlement is wired for `anonymous` and `user` principals only). No vendor adapters (AirDNA, Microburbs). No forecasts. No other states than VIC. No R2 upload (record `file_sha256` only). No commits. Do not edit `scripts/`, `data/raw/`, or CRM repos. No PostGIS yet (plain `lat`/`lon`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unit found | `310/628 Flinders St Docklands` | `match: "unit"`, gnaf_pid, building_id, sal_code, tier `A` | N/A |
| Building only | Unit number absent from G-NAF | `match: "building"`; L01 suppresses unit claims, header says "matched to building only" | N/A |
| Street only | Street, no number | `match: "street"`, no report | 404 `address_not_found` with candidates |
| Non-VIC | Valid pid in other state | Not loaded; 404 | 404 `not_covered` |
| Locked layer | Paid layer, anonymous | `status: "locked"`, teaser, empty `figures` | N/A |
| Layer throws | Repo error | That layer `status: "error"`; others render | Logged with `request_id` |
| Unclear source | Layer lists a `pending` source | Layer returns `not_covered`, not run | N/A |
| Failed publish | Row-count check fails | Pointer unchanged, old data served | Non-zero exit |

</frozen-after-approval>

## Code Map

- `package.json` (root, ESM) -- has `xlsx`, `@neondatabase/serverless`; add app, test and `pg` deps. Pipelines in `scripts/` stay untouched.
- `scripts/32-gnaf-building-units.py` -- reference for reading G-NAF PSV from the zip, alias exclusion (`ALIAS_PRINCIPAL='A'`), primary/secondary links. Copy the approach into `pipeline/ingest/`.
- `scripts/lib.mjs` `parseAddr`, `normStreet` -- reference for unit/number/street parsing.
- `data/raw/national/gnaf/g-naf_aug26_allstates_gda2020_psv_110.zip` -- VIC tables: ADDRESS_DETAIL, ADDRESS_DEFAULT_GEOCODE, STREET_LOCALITY, LOCALITY, PRIMARY_SECONDARY.
- `data/raw/national/abs-geography/2021_geog.xlsx` -- sheet `2021_ASGS_MAIN_Structures` has SAL codes and names (no mesh-block allocation; match locality to SAL by name, store match type).
- `C:\Users\azwaa\Documents\github\cityretreatscrm\{wrangler.jsonc,src/lib/server/sql.ts,DEPLOY.md}` -- read only. Its Vite config uses a Lovable wrapper; do not copy it.
- Cloudflare guide (fetched 2026-11-14): `vite.config.ts` = `cloudflare({ viteEnvironment:{ name:"ssr" } })`, `tanstackStart()`, `react()`; wrangler `main: "@tanstack/react-start/server-entry"`, `observability.enabled`.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `.gitignore` -- scaffold per the Cloudflare guide; pin the CRM versions (react-start 1.168.60, react-router 1.170.41, react ^19.2, vite ^7.3.1, @cloudflare/vite-plugin ^1.25.5, zod ^3.24.2); add vitest, `@electric-sql/pglite`, `pg`; scripts `dev build test db:migrate pipeline:gnaf`; ignore `.wrangler .output data/out .dev.vars` -- app runs on Workers
- [ ] `db/migrations/0001_core.sql`, `0002_seed.sql`, `db/migrate.mjs` -- tables: `src_source`, `src_dataset_version`, `src_dataset_current`, `ref_suburb`, `ref_building`, `ref_address` (+ trigram index on property-level rows), `series_price`, `series_rent`, `derived_rating`, `market_validation` (seed `VIC/unit validated 0.74-0.80`), `layer_config`, `app_user`, `app_org`, `app_subscription`, `app_report`, `app_lookup_log`, `vendor_cache`; seed sources with `rights_status`; plain-SQL runner with `schema_migrations` -- AD-4, AD-5, AD-7
- [ ] `src/server/db.ts` -- `Db { query(text, params) }` over Neon HTTP; PGlite and `pg` adapters for tests and pipelines -- one SQL path everywhere
- [ ] `src/server/contracts/{layer,report,address,errors}.ts` -- zod: `LayerResult`, `Figure`, `Chip`, `ReportModel`, `Principal`, error envelope -- AD-1, AD-2
- [ ] `src/server/services/{entitlements,layer-runner,assemble-report,resolve-address,parse-query}.ts` -- entitlement seam, rights gate, parallel layer run with per-layer failure isolation, query parser, resolver (unit > building > street) -- AD-3, AD-4, AD-6, AD-9
- [ ] `src/server/repos/{datasets,address,source}.ts`, `src/server/layers/L01-property/index.ts` -- current-pointer reads; L01 returns address facts as `Observed` with G-NAF `as_of`
- [ ] `src/routes/api/v1/{address/suggest,address/$gnafPid,property/$gnafPid/report,coverage}.ts`, `src/routes/{__root,index}.tsx` -- thin handlers; minimal search page showing the match and layer cards -- spec I/O
- [ ] `pipeline/lib/{db,dataset,schemas}.mjs`, `pipeline/ingest/gnaf-extract.py`, `pipeline/ingest/gnaf-load.mjs`, `pipeline/ingest/suburbs-sal.mjs`, `pipeline/publish/publish.mjs` -- extract VIC to TSV, batched UNNEST loads under a new `dataset_version_id`, row-count checks, pointer flip -- AD-7
- [ ] `src/**/*.test.ts`, `pipeline/**/*.test.mjs` -- tests for every I/O row, rights gate, locked response has no figures, failed publish leaves pointer, parser fixtures (`310/628 Flinders St`, `Unit 5, 12 Smith Rd`, `Level 3, 1 X St`)

**Acceptance Criteria:**
- Given a loaded fixture dataset, when `GET /api/v1/address/suggest?q=628 flinders` runs, then it returns candidates with `gnaf_pid`, ordered by similarity, limited to 10.
- Given a layer whose source is `pending`, when a report is assembled, then that layer is `not_covered` and never executed.
- Given an anonymous principal and a `paid` layer, when the report is returned, then JSON contains no figure values for it and `Cache-Control: private`.
- Given a publish with a failed check, when it finishes, then `src_dataset_current` is unchanged.
- Given `npm test`, then all tests pass; `npm run build` succeeds.

## Implementation Notes

Implemented by a subagent (stalled once at 600 s, resumed). Deviations it reported: SAL codes are in sheet `2021_ASGS_Non_ABS_Structures`; added `GET /api/v1/address/resolve` and an optional `?unit=` parameter; PGlite and `pg` adapters live outside `src/server/db.ts` to keep the Worker bundle clean; relative imports instead of an `@/` alias. `vite dev` crashed in workerd on Windows, so the app has not run end to end.

## Review Triage Log

Three context-free reviewers (blind hunter, edge-case hunter, verification-gap) ran on the 58-file diff. "Verified" means the cited code was read.

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `?unit=` on pid routes never looks the unit up | medium | patch | Verified: `resolveByPid` only copies `unit` into `unit_requested`; `findUnit` is not called. |
| 2 | `findUnit` can pick a shop or car space that shares a flat number | medium | patch | No flat-type preference in the query. |
| 3 | Pid regex rejects real SA/WA/NT pids with underscore | medium | patch | Verified: `GnafPid` and `OTHER_STATE_PID` have no optional underscore. |
| 4 | Rights message and `/coverage` show vendor ids and rights status to anonymous users | medium | patch | Verified in `rightsGate` and `handleCoverage`; `display_scope` unused. |
| 5 | No per-layer timeout; a hung layer stalls the report | medium | patch | Verified: `runLayers` is `Promise.all` with no timeout. |
| 6 | `layer_config.tier` ignored at run time | low | patch | Code tier wins silently. |
| 7 | `message` not required for gap, error, not_covered | low | patch | Contract comment says required; schema does not enforce it. |
| 8 | Suggest has no server-side minimum length | low | patch | Suggest shares `QuerySchema` with resolve; 3-character minimum is client-only. |
| 9 | `--limit` publishes a sample to a real database; declared count fails when limit exceeds rows | medium | patch | Verified: `minAddresses: limit ? 1 : ...`, `declaredRowCount: limit`. |
| 10 | A failed load leaves its rows in ref tables and the index | medium | patch | `markFailed` only flips status. |
| 11 | A house is described as "Matched to building only: no unit was given" | low | patch | Verified: `matchNote` has no case for a property with no units. |
| 12 | UI: crash when response has no `error`, unit dropped on pick, stale suggest, input not updated | medium | patch | Two reviewers agree; page never rendered. |
| 13 | Tests: AD-7 read path not pinned; "much smaller" and `sqlCheck` untested; `not_configured` test vacuous when `DATABASE_URL` set; ABS-workbook test fails on a clean checkout | medium | patch | Gap reviewer read the tests; the last is confirmed by `.gitignore` excluding `data/raw`. |
| 14 | Letter-prefixed flat numbers (`G05/12 X St`) not parsed | low | patch | Unit pattern needs a leading digit. |
| 15 | SAL names with a disambiguator such as `Bellfield (Banyule - Vic.)` never match | low | patch | The agent's own unmatched list includes Bellfield; 25,781 rows. |
| 16 | G-NAF seeded `cleared` without the full licence read | intent_gap, resolved by user | patch | User chose: pending in the production seed, cleared in a dev seed used by tests and local runs. |
| 17 | CC BY attribution never shown | medium | defer | Lands with L14 and the PDF; launch blocker recorded. |
| 18 | No rate limiting on anonymous endpoints | medium | defer | Needs Cloudflare rules; outside this spec. |
| 19 | Superseded dataset versions kept; index not version-scoped | low | defer | Retention is a later pipeline concern. |
| 20 | `gnaf-extract.py` untested | medium | defer | Spot-check against script 32 on first real load. |
| 21 | Route wiring untested; `vite dev` crashed | maybe-false, medium if true | defer | Handlers are tested directly; settle with a dev or preview smoke run. |
| 22 | Resolver hit rate unmeasured | medium | defer | Needs a golden set of real VIC addresses. |
| 23 | `xlsx` runtime dependency with advisories; pin mix; engines; `.dev.vars.example`; `python3` | low | defer | Hygiene. |
| 24 | Migration checksum and lock; rights-downgrade trigger; rights audit; `vendor_cache` limits | low | defer | Vendor-layer story. |
| 25 | Lookup-log indexes and retention; security headers; CI; staging; README | low | defer | Launch hardening. |
| 26 | Publish guards: older version after newer, ROLLBACK masking, short TSV rows, atomic extract writes | low | defer | Unlikely with one operator. |
| 27 | Money `Figure.unit` shown as raw cents; wording for unpublished suburb dataset | low | defer | L01 has no money figures. |
| 28 | Pipeline test imports `src/server/repos/address` against the no-shared-code rule | false | reject | Test-only parity check; production code of the two planes shares nothing. |
| 29 | `src/routeTree.gen.ts` missing | false | reject | Generated, present on disk; excluded from the staged diff by me. |
| 30 | `addresses.tsv` fixture absent from the diff | false | reject | Excluded from the diff file by me; the file exists and tests read it. |
| 31 | Ambiguous suburbs reported as `match: none` with no distinct code | low | reject | Spec lists only street-only and not-found; extra surface for a rare case. |

## Design Notes

Source tree deviates from the spine seed: framework default `src/` replaces `app/`; `server/` keeps the spine's names. PostGIS is deferred to the supply layer. Suggest searches property-level rows only (no flat number), keeping the trigram index small; units resolve through parsed unit number under the matched primary. Pipeline Db uses `pg` over TCP; the app uses the Neon HTTP driver; both satisfy `Db`.

## Verification

**Commands:**
- `npm test` -- expected: all pass
- `npm run build` -- expected: Worker bundle builds
- `node db/migrate.mjs --pglite` -- expected: all migrations apply in memory

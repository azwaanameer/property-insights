---
title: 'Report batch 3, section 2: neighbourhood photos (L19) and nearby places (L20), with the first live vendor adapters'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b228b0a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report has no pictures of the neighbourhood and nothing about shops, cafes, parks or services nearby. The user ruled (2026-11-21) that public images may be used, that OpenStreetMap data may be used with the credit "© OpenStreetMap contributors", and supplied a Mapillary token. No licensed listing photo source exists, so photos must be public street and place images.

**Approach:** Add the first live vendor adapters (Mapillary street-level images, Wikimedia Commons place images, OpenStreetMap places through the Overpass API), cached in `vendor_cache` (30 days at most, AD-8), a free layer L19-photos "What does the street look like?" and a free layer L20-places "What is nearby?", each with the right credit for every image or datum shown.

## Boundaries & Constraints

**Always:** Real data only; follow AD-1..AD-11. Layers never fetch: they call an adapter handed in through the layer context; adapters write `vendor_cache` only. A vendor failure, timeout (8 seconds) or missing key makes that layer a `gap` with a plain message and never fails another layer or the report (AD-9). Each image shows its author, licence and a link to its source page, unaltered. OpenStreetMap-derived figures carry "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright. Distances are straight-line and labelled so. Send a descriptive User-Agent ("VicProp/1.0 (property report tool)") with no personal details. The Mapillary token is read from `process.env.MAPILLARY_ACCESS_TOKEN` (never printed, logged or committed); when absent, L19 uses Wikimedia only. Tests never use the network (inject fake adapters and fetch). Source rows (`mapillary`, `wikimedia_commons`, `openstreetmap`) are added to migration 0009 with rights_status cleared (user rulings) before their layer_config rows.

**Never:** No Google Street View or other terms-restricted imagery; no image of the address itself presented as the property ("the street" only); no ratings or reviews of businesses; no quality or "walkability" score; no placeholder photos; no push; no other sections. Do not store images, only metadata and URLs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Photos found | address with Mapillary images within about 150 m, token set | Up to 4 recent street images (newest first, prefer a spread of directions) with captured year, creator and licence; up to 3 Wikimedia images within 1 km | N/A |
| Only old images | newest image older than 3 years | Shown with its year and a note that the street may have changed | N/A |
| No images | none nearby | gap "No public photos found near this address." | N/A |
| Token missing | env unset | L19 uses Wikimedia only; if none, gap | No error |
| Vendor down | timeout or non-200 | gap "Photos are not available right now." | Other layers unaffected |
| Places found | OSM returns elements | Per category: nearest (name, straight-line metres) and count within 400 m and 800 m | N/A |
| Place without a name | OSM element has no name tag | Counted, not listed by name | N/A |
| Cached | same rounded location within the TTL | No outside call | N/A |

</frozen-after-approval>

## Code Map

- No adapter mechanism exists yet: `vendor_cache` is created in `db/migrations/0001_core.sql` (cache_key, vendor, principal_id, payload jsonb, fetched_at, expires_at, CHECK expires_at <= fetched_at + 30 days) and is unused in `src/`. `src/server/layers/types.ts` `LayerContext` has `db`, `address`, `request_id`, `siblings`. Add `vendors` to it with a small cache helper (key from vendor plus rounded lat/lon to about 100 m plus parameters; public data stores `principal_id` null) and the adapters under `src/server/vendors/` (spine tree). Wire the context where layers are run (find the runner in `src/server/services` or `src/server/layers/index.ts`) and in `src/server/testing/` helpers so existing layer tests keep passing (default `vendors` that throws or returns empty).
- Mapillary: `GET https://graph.mapillary.com/images?access_token=TOKEN&fields=id,captured_at,compass_angle,is_pano,creator,thumb_1024_url&bbox=minLon,minLat,maxLon,maxLat&limit=200` (box under 0.01 degrees square; verified working 2026-11-21: Docklands 200 images 2012 to 2026, Cranbourne North 183 images all 2019). Skip panoramas (`is_pano`). Source page link `https://www.mapillary.com/app/?pKey=ID`. Check Mapillary's current terms for imagery licence (expected CC BY-SA 4.0) and thumbnail URL lifetime on their help or terms pages and record what you find; cache at most 7 days because thumbnail URLs can expire.
- Wikimedia Commons: `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=LAT|LON&ggsradius=1000&ggsnamespace=6&ggslimit=20&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json&origin=*`; keep only licences that are public domain, CC0, CC BY or CC BY-SA (from `extmetadata.LicenseShortName`), strip HTML from `Artist`, link `descriptionurl`; drop non-photos (SVG, maps, diagrams) by mime/extension.
- OpenStreetMap places: Overpass API `https://overpass-api.de/api/interpreter` POST `data=[out:json][timeout:20];(nwr(around:900,LAT,LON)[shop~"^(supermarket|convenience|greengrocer|bakery)$"];nwr(around:900,LAT,LON)[amenity~"^(cafe|restaurant|pharmacy|doctors|clinic|hospital|library|gym)$"];nwr(around:900,LAT,LON)[leisure~"^(park|fitness_centre|playground)$"];);out center tags 400;` Group into categories (supermarkets and groceries, cafes and restaurants, parks and playgrounds, pharmacy and medical, fitness, library). Lat/lon of ways come from `center`. Cache 30 days.
- Layers: `src/server/layers/L19-photos/index.ts`, `src/server/layers/L20-places/index.ts` (follow `L16-transport` for distances and the straight-line note, `shared/location.ts`, `shared/figures.ts`, `src/server/geo.ts` `haversineMetres`, `offsetMetres`); registry `src/server/layers/index.ts`: L19 right after L01-property, L20 right after L16-transport. L14 attribution `src/server/layers/L14-attribution/index.ts` must credit OpenStreetMap contributors, Mapillary (per-image credit stays on the image) and Wikimedia Commons only when those sections returned data.
- Migration `db/migrations/0009_photos_places.sql` (next after 0008_crime.sql): three source rows (attribution texts: "© OpenStreetMap contributors" with licence ODbL 1.0 https://opendatacommons.org/licenses/odbl/1-0/; "Photos: Mapillary contributors, CC BY-SA 4.0"; "Images from Wikimedia Commons; each image carries its own author and licence"), two layer_config rows (free, enabled) after the sources. Renumber the reference in `_bmad-output/implementation-artifacts/spec-reported-web-lookup.md` from 0009 to 0010. Update pinned lists (`db/migrations.test.mjs`, `src/server/testing/db.ts`, `src/site/home.test.tsx`, `src/server/layers/return-rating-questions.test.ts`, layer-count tests) as batches 2 and 3 did.
- Render: new `src/render/report/PhotosPanel.tsx` (responsive image grid, `loading="lazy"`, alt text "Street view near ADDRESS, YEAR", visible credit line under each image) and `PlacesPanel.tsx`, `ReportSection.tsx`, `src/render/pine.css`, `src/site/copy.ts`. Images load from the vendor CDN; do not proxy. Add a Content-Security-Policy or `referrerpolicy="no-referrer"` only if one already exists in the app.
- Do not change: rights-gate semantics, existing layers' output, the crime section.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/vendors/*` + `LayerContext.vendors` + runner and test helpers -- cache helper over `vendor_cache` (TTL clamp to 30 days, key rounding, no principal for public data), Mapillary, Wikimedia and Overpass adapters with 8 second timeout and typed results
- [x] `db/migrations/0009_photos_places.sql` -- sources then layers (AD-4); renumber the web-lookup spec reference
- [x] `src/server/layers/L19-photos`, `L20-places`, registry, L14 credits
- [x] `src/render/report/PhotosPanel.tsx`, `PlacesPanel.tsx`, `ReportSection.tsx`, `pine.css`, `copy.ts`
- [x] Tests: adapters (fake fetch: success, non-200, timeout, bad JSON, cache hit), layers (all matrix rows), render (credit under every image, no image without credit), L14, pinned lists; keep all 674 existing tests
- [ ] Implementer stops after tests, `tsc`, `npm run build`: do NOT call real vendor APIs, Neon or Cloudflare and do not commit; the orchestrator runs the migration, a real-API smoke test, sets the Cloudflare secret, deploys and checks the browser
- [x] `RUNBOOK.md` section 12 (photos and places: new secret `MAPILLARY_ACCESS_TOKEN`, run order), `deferred-work.md`, this spec's Implementation Notes

**Acceptance Criteria:**
- Given the Docklands unit with adapters returning images, when the report loads, then the photos section shows images each with author, licence and source link, and no image appears without a credit.
- Given the vendor times out, when the report loads, then the section is a gap and every other section still renders.
- Given OSM results, when the places section renders, then it shows the "© OpenStreetMap contributors" credit, straight-line distances labelled as such, and no rating, review or score.
- Given `npm test` (PowerShell), `npx tsc --noEmit` and `npm run build`, then all pass.

## Implementation Notes

**Built.** `src/server/vendors/` (`types.ts`, `cache.ts`, `mapillary.ts`, `wikimedia.ts`, `overpass.ts`, `index.ts` with `createVendors`), `LayerContext.vendors` (required; the runner and `assembleReport` take an optional `vendors`, default `UNAVAILABLE_VENDORS`; the HTTP handler builds the live ones from `processEnv()`), `LayerDef.timeout_ms`, migration `0009_photos_places.sql` (three cleared sources, two free layers; web-lookup spec renumbered to 0010), layers `L19-photos` and `L20-places` in the registry (after L01 and after L16), L14 credits (ODbL and CC BY-SA links, a credit link for OpenStreetMap), `PhotosPanel.tsx` (photos and places), copy, Pine styles, RUNBOOK section 12, deferred work. 729 tests (674 before), `tsc` and `npm run build` pass. Nothing touched Neon, Cloudflare or the network; nothing committed.

**Decisions made without asking.**
- The 8 second vendor limit and the runner's 8 second layer limit would race and give an `error` instead of the spec's `gap`, so the two layers declare `timeout_ms: 10000` (new optional `LayerDef.timeout_ms`; the runner's own `timeout_ms` input still wins, so tests keep short limits).
- Cache key rounds to 3 decimals (about 100 m) and each adapter queries around the rounded point with a 90 m margin (Mapillary 150+90 m box, Wikimedia 1000+90 m radius, Overpass 900 m), so a cached answer does not depend on which address asked first. The layer filters by true distance.
- Mapillary needs `geometry` in the fields list (to apply the 150 m limit); Wikimedia adds `coordinates` and `mime` to `prop`/`iiprop` (distance, and the JPEG-only photo check). Additions to the spec's URLs, not changes.
- Mapillary cache is 3 days, not 7: thumbnail links are signed and their lifetime is undocumented. Mapillary's help site refused a direct fetch (403); the licence (CC BY-SA, credit the photographer) comes from search summaries of its pages. Recorded in RUNBOOK section 12 and the migration notes.
- Photo choice: within 150 m, newest first; one image per facing direction (north, east, south, west, unknown) from the last two years of the newest image first, then the newest of the rest, then older ones; shown newest first. "Older than 3 years" is measured against the clock at request time.
- Wikimedia: JPEG only, titles with map, diagram, plan, logo, flag, chart and similar words dropped, a credit required (no author is accepted only for public domain or CC0, shown as "Author not stated").
- L20 shows the nearest place overall in each category (named or not; an unnamed one reads "A place with no name in OpenStreetMap" and is counted); a category with none within 800 m is an Unknown figure "None listed"; if every category is empty the section is a gap. The 400 element query limit sets a `truncated` flag and a note. One category per element, deduplicated by OpenStreetMap id.
- Figures: photo figures are Observed (the newest photo's year; the number of Commons photos shown), place distances are Estimated (worked out from two points). The OpenStreetMap credit in the panel comes from copy, not the payload, so a payload change cannot drop it.
- The footer data line got one OpenStreetMap sentence and one Mapillary and Wikimedia sentence, and `home.test.tsx` no longer asserts that OpenStreetMap is absent. The marketing catalogue was not changed.
- A vitest setup file makes the global `fetch` throw, so a test that forgets to inject a fake fails loudly instead of calling out.

**Not done / for the orchestrator.** Run migration 0009 on Neon, `wrangler secret put MAPILLARY_ACCESS_TOKEN`, a real-API smoke test (all three adapters have only ever run against fakes), deploy, browser check on GAVIC720519114 and GAVIC425618586 at 1200 px and 390 px, then commit. Things to watch in the smoke test: the real Mapillary and Overpass response shapes (the parsers throw on an unexpected shape, which shows as the gap "not available right now", never a wrong figure) and the Mapillary image count in dense areas.

## Spec Change Log

## Review Triage Log

## Design Notes

Live adapters at request time keep the dataset small and always current; the 7 to 30 day cache keeps the outside calls few. Cloudflare Workers limit subrequests per request, so each of the two layers makes at most three outside calls, in parallel.

## Verification

**Commands:**
- `npm test` in PowerShell -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors
- `npm run build` -- expected: success

- source_spec: `spec-foundation-address-lookup.md`
  summary: Show the CC BY attribution text from `src_source.attribution_text` in the report and PDF (renders with L14 Sources).
  evidence: Attribution is seeded but never read; CC BY requires it. Launch blocker before any public use.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Add rate limiting and anti-enumeration to anonymous suggest, resolve and report endpoints.
  evidence: Open endpoints allow scraping of the address table (relevant to the Geoscape terms) and cost abuse.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Add dataset-version retention (keep current plus N) and a version-scoped search index.
  evidence: The GIN trigram index spans every version, so suggest slows with each reload.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Test `gnaf-extract.py` against a synthetic G-NAF zip, or spot-check unit counts against `scripts/32-gnaf-building-units.py` on the first real load.
  evidence: The loader tests use a hand-written TSV, so alias skipping and primary linking are unverified.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Run the app end to end (vite dev or preview) and test route wiring, including static versus dynamic route precedence.
  evidence: `vite dev` crashed on Windows (workerd stack overflow); the search page has never rendered. Unverified, medium if broken.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Build a golden set of real VIC addresses to measure resolver hit rate; handle street suffix words, ranges, locality-only text and an ambiguity code.
  evidence: Fixtures hold few real cases; `data/benchmark_addresses.json` holds real CRM addresses usable locally.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Dependency and repo hygiene: move `xlsx` to devDependencies, align version pins, add `engines`, `.dev.vars.example`, `python3` fallback.
  evidence: `xlsx@0.18.5` has known advisories and only pipelines use it.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Rights hardening: migration checksums and advisory lock, trigger on `src_source` downgrade, rights audit table, `vendor_cache` use of `max_cache_days` and a required principal.
  evidence: The gate checks rights at run time; the DB trigger checks them only when a layer row is inserted or updated.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Launch hardening: lookup-log indexes and retention, non-blocking log write, security headers, CI for typecheck and test, staging environment, README, log message scrubbing.
  evidence: Reported by the blind reviewer; none needed for local build.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Publish and loader guards: refuse an older version after a newer one, protect ROLLBACK from masking errors, reject short TSV rows, write extract files atomically.
  evidence: Edge reviewer; low likelihood with one operator.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Word the L01 "suburb dataset not published" gap separately from "suburb not matched" (money formatting by `Figure.unit` landed in `src/render/format.ts` with spec-vic-suburb-layers-data).
  evidence: L01 still says the suburb is unknown for both cases.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Homes Victoria reports 66 rent areas as groups of suburbs ("Carlton-Parkville", "Prahran-Windsor", "Ballarat") that do not match one ABS suburb, so L02 shows a gap for them. Decide whether to add a hand-checked area-to-suburb table, or show the group figure labelled as an area.
  evidence: Real PGlite load, 79 of 146 areas matched per sheet. Names are never guessed in the pipeline (AD-6).
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Retention for the new datasets (`series_price`, `series_rent`, `fact_suburb_marker`, `ref_suburb_neighbour`): keep current plus N versions. Each re-run adds about 95,000 rows.
  evidence: Same gap as the G-NAF retention item; the new tables have no index that spans versions, so reads stay fast.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: The `gnaf_neighbours` source follows the `gnaf` rights decision (cleared 2026-11-20 on the owner's Geoscape statement). If gnaf is set back to pending, also set `gnaf_neighbours` to pending and switch L09 off; a trigger or a single rights row would remove the manual step.
  evidence: Migration 0004 notes.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Run the new layers against the real Neon database (HTTP driver) and through the running app; only PGlite was available to the build.
  evidence: Owner decision 2026-11-20: the owner runs the real migration and loads.

- source_spec: none
  summary: Build the Pine marketing site UI in the app (home, report, checkout and confirmation views, merged "What is in the report" grid) wired to the address suggest, resolve and report API, per the approved mockup pine-site.artifact.html.
  evidence: Split from the 2026-11-20 build request so the suburb data and layers (spec 2a) land first; the report page needs real L02 to L09 data to look right.
- source_spec: none
  summary: Checkout, payment adapter (Stripe when keys exist, dev-only unlock otherwise) and entitlement grants for purchased addresses and Pro, including the refund path and purchase identity (email token) since there is no login.
  evidence: Split from the 2026-11-20 build request; depends on the site UI and on a decision about purchase identity and the payment provider.

- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Show CC BY attribution per source in the report and footer from `src_source.attribution_text`.
  evidence: Review finding: attribution is seeded for five sources and never rendered; a launch blocker. Step 2b adds the footer credits; the per-source block is still needed.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Decide how to show the 66 grouped Homes Victoria rent areas (for example Carlton-Parkville, Richmond-Burnley) so inner-city apartment suburbs are not a gap in L02.
  evidence: They are core apartment markets and the numbers exist at area level; needs an owner decision on an Estimated area-level rent.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Check the 33 unmatched Valuer-General names name by name (Westgarth, Syndal, Studfield, Jolimont, Coburg East, Cheltenham East, Fishermans Bend) and add an alias table where a suburb exists.
  evidence: The stated cause was unverified and several are long-standing suburbs.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Store the count of G-NAF adjacency pairs dropped for ambiguous or unmatched localities and say so in L09.
  evidence: 536 pairs and 43 localities are dropped; a suburb next to one shows a shorter list with no disclosure.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Freshness and consistency pass: show the period of each median in L09 cells, read as_of and rows in one query so a pointer flip cannot split them, and list VGV rows whose name has unusual characters.
  evidence: Review findings on mixed quarters, a pointer-flip race and a regex that can drop rows without listing them; low likelihood with one operator.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Add a small committed zip fixture for `readZipMembers` and restore a dev-seed behaviour test; tidy temp dirs and the duplicated money formatter.
  evidence: The zip path is only exercised by the real-file test, which is skipped when `data/raw` is absent.

- source_spec: `spec-marketing-site-ui.md`
  summary: Launch blocker: the marketing copy promises 20 sections for a house and 23 for a flat while the report has five layers (L01, L02, L03, L07, L09); build the layers or trim the copy before any public launch.
  evidence: Review finding and a misleading-conduct risk flagged by the claims review; recorded in the spec Design Notes.
- source_spec: `spec-marketing-site-ui.md`
  summary: Launch polish for the site: self-host fonts, privacy and terms links, mobile nav menu, focus and page-title update on report load, honest generating state, favicon and Open Graph, accessible type sizes and keyboard scrolling for wide tables.
  evidence: Blind review findings; none affect correctness but several matter before a public launch.
- source_spec: `spec-marketing-site-ui.md`
  summary: Add a DOM test environment (jsdom or similar) and interaction tests for the address combobox: arrows, Enter, Escape, pick keeps the unit, newer keystroke discards an older response.
  evidence: Verification-gap finding; the repo has only node-environment tests and the browser checks ran on a deleted temporary config.
- source_spec: `spec-marketing-site-ui.md`
  summary: Define and disclose Pro plan fair-use limits (or confirm there are none) before selling Pro.
  evidence: The claims review says any limit on a subscription described as covering client addresses must be disclosed near the price.

- source_spec: `spec-checkout-entitlements.md`
  summary: Run checkout once end to end in Stripe test mode (one report, Pro, renewal on a test clock, full refund) and fix any request or event shape that differs from the documentation the provider was written against.
  evidence: The Stripe provider was tested only against a stubbed fetch and self-signed fixtures. A Pro refund may not map to its purchase if Stripe omits the invoice id on the charge (the code also reads `payment_intent`, `invoice` and `metadata.purchase_id`).
- source_spec: `spec-checkout-entitlements.md`
  summary: Buyers cannot reopen a report after clearing cookies or switching browser, and cannot cancel Pro themselves. Add sign-in or an emailed link, a Stripe Customer Portal link, and email sending (receipt, access link).
  evidence: Design Notes of the spec; the pricing page already says "Cancel any time". Pro cancellation is only possible from the Stripe dashboard today.
- source_spec: `spec-checkout-entitlements.md`
  summary: Rate limiting and abuse control on `POST /api/v1/checkout` (anonymous callers can create pending purchase rows) and on the webhook endpoint; add a cleanup for old `pending` and `failed` purchases.
  evidence: Same gap as the open-endpoint item from the foundation spec; each call writes a row.
- source_spec: `spec-checkout-entitlements.md`
  summary: Production safety for the dev unlock: also refuse it when a production marker is set (for example a `ENVIRONMENT=production` var), and fail the deploy if `ALLOW_DEV_UNLOCK` is present in production secrets.
  evidence: The spec only requires `ALLOW_DEV_UNLOCK=1` and no Stripe key; nothing else stops a mistaken production setting when no Stripe key is set yet.
- source_spec: `spec-checkout-entitlements.md`
  summary: Consumer-law and tax items before taking money: refund wording and process (the copy promises a full refund if the report does not load, but refunds are manual in Stripe), GST invoice or receipt, Pro fair-use terms, and whether a 30 day reopen window is what the pricing page promises.
  evidence: The spec forbids automatic refunds; the checkout page repeats the FAQ refund sentence.

- source_spec: `spec-checkout-entitlements.md`
  summary: Before selling Pro: build a cancel path (self-serve or support process), because the copy promises cancel any time and the claims review requires easy cancellation of a subscription.
  evidence: Review finding; today Pro can only be cancelled from the Stripe dashboard. Pro must not be sold until this exists.
- source_spec: `spec-checkout-entitlements.md`
  summary: Before switching on the first paid layer: make payableLayers address-specific (the layer must cover the address) and verify the Pro refund-to-purchase match and a pinned Stripe API version in Stripe test mode.
  evidence: Review findings: any enabled paid layer makes every address payable; the Pro refund match relies on the charge carrying the invoice id, unverified against real Stripe.
- source_spec: `spec-checkout-entitlements.md`
  summary: Handle chargeback (charge.dispute.created), invoice.payment_failed and customer.subscription.updated events, and make access sharing harder (one-time token exchange for the return link, or login).
  evidence: Review findings; today the 32 day expiry is the only backstop and a bearer link opens Pro on any number of devices.

- source_spec: `spec-report-return-rating-questions.md`
  summary: Add a serve-time freshness check that the published rating was built from the current Census and Valuer-General dataset versions, and read both inputs inside one transaction in `pipeline/derive/rating.mjs`.
  evidence: Review findings: the rating records input versions in `file_sha256` but nothing compares them at serve time; a pointer move mid-run records the wrong inputs.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Make L05 and L13 state-aware (standard questions mention section 32 and owners corporation; L05 gap message is Victorian) before any non-Victorian state is loaded.
  evidence: Review finding; only Victorian addresses resolve today.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Extend the calculator with stamp duty, land tax, loan costs and an equity return, and test its edit and reset wiring in a real browser.
  evidence: Review findings; the section now states what it leaves out, and the repo has no DOM test tooling.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Add negative tests for the rating publish checks (fifths, ordering, shrink below 80%), fix `getRating`'s unit-only unrated reason, and give the synthesis pass a shared time budget.
  evidence: Review findings; a weakened check would still pass today.

- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: L08 Supply shows only under-construction, approved and applied projects; recent completions are loaded but not shown, and the pipeline total mixes certain and speculative dwellings.
  evidence: Blind review of L08; completed rows carry `year_completed` and `resi_dwellings`. Add a recent-completions row and split the total.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: Transport extraction keeps one representative trip per route, shape and direction, so frequency, hours and school-only or night-only services are lost, and stop patterns that share a shape key can drop stops.
  evidence: Edge review of `gtfs-extract.py` `process_feed`. A stop-pattern signature in the keep key, and a weekday trips-per-hour figure, would fix both.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: The City of Melbourne to G-NAF match table is keyed by G-NAF pid and goes stale when G-NAF is reloaded; no serve-time check that the match was built against the current G-NAF version, and the column is named `gnaf_building_id` though it holds a property-level pid.
  evidence: Edge and blind reviews. The RUNBOOK says to re-run `pipeline:com` after a G-NAF reload; a stored G-NAF dataset version id and a gate in L11 would make staleness visible.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: L16, L17 and L10 have no state check; an address outside Victoria would get Victorian statements ("no zone", "no stop within 40 km").
  evidence: Edge review. Only Victoria is loaded so no other-state address resolves today; needed before another state.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: Screener drops the subject suburb row when it has no price or rent of its own and gives no note; school zone join by school number across second campuses is untested; the `npm run pipeline:gtfs` script hard-codes `python`.
  evidence: Edge and blind reviews; each is low frequency (a few suburbs, a few schools, a machine without `python` on PATH).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-2-transport-schools-building-supply.md`
  summary: Copy numbers (1 km, 400 m, 800 m) are literal text next to constants in the layer files; the GTFS outer-zip branch has no committed nested-zip fixture or real-file test (a full real run takes minutes).
  evidence: Blind and gap reviews; a mismatch appears only if a constant changes.

- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: Add a suburb rate per 100,000 by joining the agency's suburb counts to ABS populations, and say how the two sets of suburb boundaries differ.
  evidence: The agency publishes counts only for suburbs (and a rate only for council areas); its suburb and postcode list is not the ABS SAL list, so a join needs a name and postcode to SAL match stored with its match type (AD-6) and a population per SAL from the Census.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: Some G-NAF suburb and postcode pairs do not match the agency's list (for example Windsor appears under 3004 in the file), so those addresses get a gap. A hand-checked alias table, stored with its match type, would recover them without guessing.
  evidence: Matching is on normalised name AND postcode by design (no match is a gap). Count how many Victorian G-NAF localities miss after the Neon load and decide whether an alias table is worth it.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: Load the agency's offence subgroup level (for example residential against non-residential burglary, theft from a motor vehicle) and Table 02's police service area rates; only subdivisions and council areas are stored now.
  evidence: The extractor adds subgroup rows up to subdivision to keep the table near 180,000 rows. Subgroups would roughly double it.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The loader reads one fixed workbook name and the agency publishes a new file every quarter; make the input path an argument, keep earlier years' versions comparable, and add a freshness line to the report ("data to June 2026, next release due").
  evidence: `DEFAULT_XLSX` in `pipeline/ingest/crime.mjs` and the 2026 file name in `pipeline/ingest/crime-extract.py`; the section states the year ending from the data but has no release schedule.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The Victorian rate is worked out from the council rows because the workbook has no state total row, and the newest year's rates use Victoria in Future estimates (the agency's note). Cross-check against the agency's published state rate when it is loaded.
  evidence: Design decision in the spec; `getVictorianRate` in `src/server/repos/crime.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: `npm run pipeline:crime` hard-codes `python` and does not read `.env`; the layer is not state-aware (only Victoria is loaded).
  evidence: Same as the batch 2 loaders (`pipeline:gtfs`); needed before another state or a machine without `python` on PATH.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The offence table is the agency's own offence names. One of them, "A80 Dangerous and negligent acts endangering people", contains the word "dangerous", so a literal search of the section for that word finds it. It is the agency's classification name, shown as published.
  evidence: The acceptance criterion bars verdict wording; the owner may prefer a shortened label, which would stop it being the agency's name.


- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: L18 matches the suburb by name and postcode at serve time (a deliberate exception to AD-6); a pipeline-built crosswalk from the G-NAF suburb code to the agency's suburb and postcode would store a match type.
  evidence: review of b228b0a, finding 4. 99.5% of Victorian G-NAF addresses match today; 5,887 match nothing (mostly Rosebud West, 4,604) and get the "list does not include" gap.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The crime extractor and loader assume a year-ending-June file with 87 council rows a year for 10 years; the next release with a different shape will stop the load loudly, so the checks need updating then.
  evidence: review of b228b0a, finding 12 (`crime-extract.py` June check, `crime.mjs` row counts).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The panel footer carries one Estimated chip although the section also shows an Observed council rate; the per-figure chips are right.
  evidence: review of b228b0a, finding 11 (cosmetic).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-safety-crime.md`
  summary: The site copy for the Victorian rate (`src/site/copy.ts`, crime strings) still says it excludes only unknown-location incidents; the layer note now names justice institutions, immigration facilities, unincorporated Victoria and unknown location.
  evidence: review of b228b0a, finding 6; copy.ts was being edited by another build at the time.
- source_spec: `scripts/27-sold-harvest.mjs`
  summary: Sold-listing harvest data (RapidAPI realty-in-au) feeds only the offline price-driver model; the user ruled on 2026-11-21 that this route may be used. No harvested record may reach a layer as a raw listing.
  evidence: review of b228b0a, finding 8.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: Mapillary returns up to 200 images for the search box in no stated order, so in a very dense street the newest photos can be missing from the 200; a narrower box or a captured-at filter would fix it.
  evidence: built to the spec's request (bbox, limit 200); noted while writing the picker.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: Mapillary thumbnail links are signed and their lifetime is undocumented; the cache is 3 days and a broken photo is possible inside that window. No retry on a broken image is built.
  evidence: help.mapillary.com read only through search summaries (403 on direct fetch), 2026-11-21.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: The Mapillary licence version (4.0) is assumed from the owner's note; the help page says CC BY-SA without a version. Confirm in Mapillary's current terms.
  evidence: RUNBOOK section 12.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: The public Overpass endpoint has fair-use limits and no service level; with steady traffic, move to a paid or self-hosted Overpass or a periodic OpenStreetMap extract loaded as a dataset.
  evidence: spec Design Notes; the layer already tolerates the vendor being down. RESOLVED 2026-11-21 by spec-report-batch-3-places-from-osm-extract.md: places are a loaded OpenStreetMap extract and the Overpass adapter is removed.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: OpenStreetMap place counts stop at 400 elements (the query limit) and say so when reached; in the densest areas the counts are understated.
  evidence: parseOverpass `truncated` flag and the section note. RESOLVED 2026-11-21: the loaded extract has no element limit; the flag and note are removed.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: The marketing catalogue (`CATALOGUE` in `src/site/copy.ts`) and its 18, 2, 5 counts do not list the street photos section; 'What is nearby day to day?' already stands for the places section.
  evidence: left alone: the spec names no site-catalogue change and the home test pins the counts.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: A Wikimedia photo whose author field is empty is dropped unless it is public domain or CC0; some valid CC BY photos with the author only in the description are therefore skipped.
  evidence: `parseWikimedia` credit rule (a credit is required for CC BY and CC BY-SA).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md`
  summary: The OpenStreetMap places are as old as the Geofabrik file (2026-11-20 today) and are refreshed by hand: download a newer `australia-YYMMDD.osm.pbf` into `data/raw/vic/osm/` and run the two steps in RUNBOOK section 12. A scheduled refresh (weekly files exist) and an "as of" line in the section would keep it fresh.
  evidence: `as_of` is stored on the dataset version and on every L20 figure; nothing schedules the load.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md`
  summary: Geofabrik publishes no Victoria-only file, so the extractor keeps the Victoria bounding box (lon 140.9 to 150.1, lat -39.3 to -33.9), which also holds southern New South Wales (for example Wagga Wagga) and a corner of South Australia's border. Harmless for a Victorian address (a place across the border is a real nearby place) but the row counts are not "Victoria only". Dropping rows outside the Victorian boundary would need the state border polygon (not loaded).
  evidence: first rows of the real `places.jsonl` include lat -35.18, lon 147.36 (Wagga Wagga area); manifest counts 45,746 rows.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md`
  summary: A multipolygon relation tagged only on its outer way (the old tagging style, with no leisure or amenity tag on the relation itself) is not picked up, and a way or relation takes its centroid (which can lie outside a concave park); a very large park is one point, so a person can be nearer its edge than the figure says. The section already says distances go to the place's centre point.
  evidence: `with_areas(tag_filter)` in `pipeline/ingest/osm-places-extract.py`; `SCOPE_NOTES` in L20.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md`
  summary: Old `vendor_cache` rows with vendor `openstreetmap` (written by the removed Overpass adapter, if any ran) are no longer read and expire within 30 days; they can be deleted by hand.
  evidence: `DELETE FROM vendor_cache WHERE vendor = 'openstreetmap';` (RUNBOOK section 12).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-places-from-osm-extract.md`
  summary: L20 lists no `dataset_ids`, so a missing places dataset is the gap "Nearby places are not loaded." (the spec's matrix) rather than the rights gate's `not_covered`; the spec's Code Map also asked for `dataset_ids: ["openstreetmap"]`. Decide which wording the owner wants once the dataset is live; the crime layer made the same choice.
  evidence: `src/server/layers/L20-places/index.ts`; spec I/O matrix row "Dataset not loaded".
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: The earlier note that sold-listing harvest data "feeds only the offline price-driver model" and that no harvested record may reach a layer as a raw listing is SUPERSEDED by the owner's ruling of 2026-11-21: sale history has no licence issue, so L21 shows individual sales (date, price, beds, baths, car spaces, address and a link) as reported by realestate.com.au. Still true: no agent, agency, phone, listing text or photo is stored or shown. The older `rea_rapidapi` source row (blocked, for a live per-request call) is untouched; nothing calls the site or RapidAPI at request time.
  evidence: `db/migrations/0011_sold_dataset.sql`; `pickProperty` in `pipeline/ingest/rp-sold.mjs`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: AD-11 describes reported facts from an on-demand web lookup, shown only to the user who asked and stored 30 days in `vendor_cache`. L21 follows the spec instead: reported sales are a loaded dataset (`fact_reported_sale`, source `rp_sold_listings`, cleared on the owner's ruling) shown to every reader, each labelled as reported and never as a title record. The contract's chip set has no "Reported" chip, so each sale carries Estimated plus the words "as reported on realestate.com.au". If the owner wants the AD-11 chip, add "Reported" to `Chip` in `src/server/contracts/layer.ts` and to `CHIP_CLASS` in `src/render/report/FigureTile.tsx` and the CSS chip classes; nothing else enumerates it.
  evidence: spec Boundaries (chip rule); `src/server/contracts/layer.ts`; ARCHITECTURE-SPINE AD-11.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: The price-driver model is published as its own source `rp_sold_model` (like `conditions_rating`) because a dataset pointer is one per source and the derive step must not move the sales pointer. The spec named only `rp_sold_listings`; the extra source row is cleared on the same ruling and credited in the sources list as "VicProp price-driver model".
  evidence: `db/migrations/0011_sold_dataset.sql`; L04 lists both sources and cites both on every figure.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: The standard error shown is the one `scripts/23-price-drivers.mjs` printed (the coefficient's standard error x 100 on the log-price scale), not a delta-method error of the percentage effect, so for a large effect (3 bed +101%, SE 2.4) it understates the spread (a delta-method SE would be about 4.8). The section says so. If the owner wants the percentage SE, multiply by exp(coefficient) in `fitPriceModel`.
  evidence: `fitPriceModel` in `pipeline/derive/price-drivers.mjs`; the L04 note "The standard error is that of the log-price coefficient".
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: Half the apartment sales (1,682 of 3,387) are left out of the model because the unit number has fewer than three digits (the floor is read from it, as in the script), which drops most of the outer-suburb apartments; six of the 26 suburbs (Reservoir, Frankston, Mount Waverley, Noble Park, Elwood, Dandenong) have under 20 usable sales and get no suburb effect. A "floor unknown" band or a model without the floor for low-rise suburbs would use them.
  evidence: left_out counts printed by `node pipeline/derive/price-drivers.mjs --pglite` (price 25, bedrooms 9, no unit number 1,682, thin suburb 37).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: The dataset date is the newest harvest date (2026-11-21), but the 900 sales of the six inner suburbs came from `data/rp_harvest.json`, retrieved 2026-11-11, and show the later date too. A per-row retrieval date would fix it.
  evidence: `loadSold` takes `as_of` from the sold file's `retrieved` date or the harvest file's modification date, whichever is later.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: Same-street sales for a house match the street as G-NAF names it without its suffix (`ResolvedAddress.street` holds name and type only), so a house on a street such as "Little Dryburgh Street South" matches no sale (the listing key keeps "SOUTH"); a G-NAF street suffix on the address would fix it. A sale at a street number inside a G-NAF range (628 in 612-642) is also not matched to the building.
  evidence: `streetKeyOf` and `matchSalesToBuildings`; 87% of apartment sales with a unit number were matched to a building on the real G-NAF extract (3,484 of 5,698 sales in all, the rest are mostly houses and addresses G-NAF has no multi-unit building for).
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: The six suburbs in `data/rp_sold_harvest.json` that returned no Victorian rows (Carlton, Richmond, Box Hill, Cheltenham, Ringwood, Croydon; their search crossed into other states) are not in the dataset, so an address there gets the coverage gap even though sales exist. The spec's "26 suburbs" are the 6 inner CRM suburbs plus the 20 with rows; 5,698 sales, of which 3,394 are apartment-like, not "about 3,300 sales" in all.
  evidence: `mixed states` status and `victorian: 0` for those six in the file.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: L04 is a gap for a house even in a harvested suburb (the model is apartments only); houses could get a second model and a "houses and townhouses" driver table. Layout medians use every apartment sale with a price (no unit number needed) while the effects use only sales with a unit number, so the two parts of the section rest on different sale counts, each stated.
  evidence: `HOUSE_MESSAGE` in `src/server/layers/L04-drivers/index.ts`; `layoutMedians` in `pipeline/derive/price-drivers.mjs`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The AirDNA adapter and parser have only run against fakes built from the CRM's field names: the rentalizer answered 503 (`authentication_unavailable`) on the orchestrator's probe of 2026-11-21, so no real success body has been captured. After the first real answer compare it with `parseRentalizer` (a wrong shape is a quiet "not available right now" line, never a wrong figure), then replace the fixture in `src/server/vendors/airdna.test.ts` with a trimmed real one. In particular confirm `occupancy.ltm` is a fraction (the CRM multiplies by 100) and `comps_revenues` lines up with `comps` by position.
  evidence: `src/server/vendors/airdna.ts` `parseRentalizer`; CRM `src/lib/airdna.parse.ts`, `airdna.comps.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The report has no bedroom or bathroom figure for an apartment, so L06 assumes 2 bedrooms (the size L02 and L05 use) and 2 bathrooms (AirDNA's own default, a guess) and says so. A reported-details layer (the web-lookup spec) or a bedroom choice in the report would replace the assumption; then L06 should read it and pass the real size, and L02's rent for that size.
  evidence: `REPORT_BEDROOMS`, `REPORT_BATHROOMS` in `src/server/layers/L06-shortstay/index.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: L14 needed to read L06's result, but a synthesis layer saw only ordinary layers (the layer contract says other synthesis layers are not included). Added `LayerDef.after_synthesis` and a third runner pass instead of making L06 an ordinary layer (it needs L02's result). Only L14 uses it; L13 does not see L06, so no question is prompted by the short-stay figure (the spec allowed leaving L13 unchanged). If a question such as "the short-stay estimate is our own because AirDNA's confidence is not High" is wanted, mark L13 `after_synthesis` and read `L06-shortstay` `payload.method`.
  evidence: `src/server/services/layer-runner.ts` `runLayers`; `src/server/layers/types.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The spec does not say how few comparable listings are too few for our own estimate; the section follows the CRM (any comparable listing with income counts, and fewer than 5 strong ones is labelled "few comparable listings"), so a single comparable listing gives a "median" of one and a range with no width. A minimum such as 3 would be a one-line change in `chooseIncome` (`src/server/layers/shared/shortstay.ts`); the owner has not set one.
  evidence: `chooseIncome` in `src/server/layers/shared/shortstay.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The 0002 seed's older source row `shortstay_vendor` (pending, "AirDNA today") is untouched and unused; L06 lists the new cleared `airdna_rentalizer`. It could be deleted or marked superseded in a later migration. The web-lookup spec's migration reference was renumbered from 0012 to 0013.
  evidence: `db/migrations/0002_seed.sql`, `db/migrations/0012_shortstay.sql`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The AirDNA call still starts only when L06 runs, in the second pass, after every ordinary layer. It needs only the address, so it could start at the top of the report and overlap pass 1, saving up to the pass-1 time. Skipped in the 2026-11-21 review fixes because it needs a new layer contract (a `prefetch` hook run by the runner for a layer that passed the rights gate and entitlement), or a runner that knows L06's query; the vendor budgets (6 s AirDNA, 5 s Mapillary and Wikimedia) and layer limits (6.5 s and 5.5 s) already hold the whole report to about 12 s when vendors hang.
  evidence: `src/server/services/layer-runner.ts` `runLayers` passes; `src/server/layers/L06-shortstay/index.ts` `run`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The AirDNA cache is now keyed on the address point snapped to about 100 m, so two different buildings on the same block share the answer of whichever address was asked first (AirDNA's comparable listings are geocoded from the address it was sent). Accepted for cost control; a stricter key (the building id, or the snapped point plus the street number) would separate them at the cost of more paid calls.
  evidence: `airdnaCacheKey` in `src/server/vendors/airdna.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-short-stay.md`
  summary: The 10 minute AirDNA failure marker is written for every failure, including a 401 or 403 (a bad or revoked RapidAPI key) and a 200 of the wrong shape, so after the owner fixes a key the section stays "not available right now" for up to 10 minutes. Mapillary and Wikimedia have no failure marker (their calls are free), so a hung vendor still costs those requests up to 5 s each.
  evidence: `negative_ttl_seconds` in `src/server/vendors/cache.ts`; clear with `DELETE FROM vendor_cache WHERE payload ? '__vendor_failed';`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: Re-run the price-driver model on the real database to publish the corrected standard errors (delta method, same scale as the effect), the null-parking exclusion and the unit-prefix floor fix: `node --env-file=.env pipeline/derive/price-drivers.mjs`. Until then the live model still holds the old log-scale `se_pct`, so L04 shows errors that are too small for a large effect. The comment in migration `0011_sold_dataset.sql` still describes `se_pct` as log-scale; it was left alone because the migration is applied.
  evidence: `effectInPercent` in `pipeline/derive/price-drivers.mjs`; `db/migrations/0011_sold_dataset.sql` line 60.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: L21 now returns a gap for a house whose street has a G-NAF suffix (North, South, East, West ...), because the address carries only the street name and type and would otherwise be shown the sales of the street without the suffix. That is detected from the displayed address. The real fix is to carry `street_suffix` on `ResolvedAddress` and key the listing street with its suffix (`streetKeyOf` keeps it), so those houses get their own sales instead of a gap. The reverse case in the earlier item (a sale at a street number inside a G-NAF range) is unchanged.
  evidence: `hasStreetSuffix` in `src/server/layers/L21-sales/index.ts`; `ref_address.street_suffix` is loaded but not read.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-sales-and-drivers.md`
  summary: A sale with no parking count is now left out of the whole price-driver fit (a pooled least-squares row cannot be left out of one column) and of the layout medians, instead of counting as "no car space". On the committed harvest none are missing; if a later harvest has many, a "parking not stated" indicator column would keep those sales in the model.
  evidence: `no_parking_count` in `pipeline/derive/price-drivers.mjs`.
- source_spec: `_bmad-output/implementation-artifacts/spec-report-batch-3-photos-places.md`
  summary: The request-scoped memo (`requestScoped` and `memoPerRequest`, `src/server/repos/request-scope.ts`) covers only `getSalesDataset`, shared by L21 and L04. Other reads that two layers repeat (the suburb row, the current-dataset pointer lookups in `loadRights`) could use it; the Neon HTTP driver pays one round trip per query, so the saving is small per read.
  evidence: `getSalesDataset` in `src/server/repos/sale.ts`.

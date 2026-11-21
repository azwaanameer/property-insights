# VicProp runbook: getting the site and its data running

Written 2026-11-21. Run every command from the repo root in PowerShell. `.env` must hold `DATABASE_URL` (a Neon connection string). Never paste it into chat. The old password was pasted into a chat earlier: rotate it in the Neon console first, then update `.env`.

## 0. What exists and what has run

| Piece | State |
|---|---|
| App (TanStack Start on Cloudflare), schema, migrations 0001 to 0005 | Built and tested in memory (358 tests, type check, production build all pass). Never run against your Neon database. |
| Address search and L01 Property (needs the G-NAF load) | Built. The G-NAF load into Neon has not completed: the log from 14 Nov stops at 2.1 million of 4.19 million rows. |
| Suburb data and layers L02 Rent, L03 Price, L07 History, L09 Suburb compare | Built. Loaders verified against your real files in memory. Not loaded into Neon. |
| Marketing site, report page, checkout and confirmation pages | Built and viewed in a browser against stand-in data. Not deployed. |
| Payments | Stripe code written, never run against Stripe. A dev-only unlock exists for localhost. |

## 1. Look at the database first (Neon SQL editor)

```sql
SELECT source_id, dataset_version_id, published_at FROM src_dataset_current;
SELECT source_id, status, count(*) FROM src_dataset_version GROUP BY 1, 2 ORDER BY 1;
SELECT pg_size_pretty(pg_database_size(current_database()));
```

Expect nothing yet, or a partial `gnaf` row from the old attempt. If a `gnaf` version is `loading` (the old run was killed, not failed cleanly), its rows still use storage. Inspect, then remove them:

```sql
SELECT dataset_version_id, status, row_count FROM src_dataset_version WHERE source_id = 'gnaf';
-- only for versions whose status is 'loading' or 'failed', never the published one:
DELETE FROM ref_address  WHERE dataset_version_id = <id>;
DELETE FROM ref_building WHERE dataset_version_id = <id>;
UPDATE src_dataset_version SET status = 'failed' WHERE dataset_version_id = <id>;
```

## 2. Decide the Neon plan before the G-NAF load

The Victorian G-NAF file is 4,187,113 addresses (583 MB as TSV, already extracted in `data/out/gnaf-vic/`). With the search index the table will be several times that size, well past the free tier's 0.5 GB. Use a paid Neon plan, or the load will stop partway again. Check `pg_database_size` after the load. Nothing else in this runbook is large (the five suburb loads add about 95,000 small rows).

## 3. Load order

```powershell
node --env-file=.env db/migrate.mjs                       # schema: tables, sources, layer switches
node --env-file=.env pipeline/ingest/suburbs-sal.mjs      # suburb list; the loaders need it
node --env-file=.env pipeline/ingest/gnaf-load.mjs        # addresses; long; TSV is already extracted
node --env-file=.env pipeline/ingest/vgv-medians.mjs      # Valuer-General prices
node --env-file=.env pipeline/ingest/homes-vic-rents.mjs  # Homes Victoria rents
node --env-file=.env pipeline/ingest/census-sal.mjs       # Census markers (needs python on PATH)
node --env-file=.env pipeline/ingest/seifa-sal.mjs        # SEIFA markers
node --env-file=.env pipeline/ingest/locality-neighbours.mjs   # adjacent suburbs (needs python on PATH)
```

Every loader prints rows, matches and anything set aside, exits non-zero if a check fails, and leaves the old data live in that case. Any loader can be dry-run in memory first with `--pglite` instead of `--env-file=.env`. To re-extract G-NAF from the zip instead of reusing the TSV: `python -I pipeline/ingest/gnaf-extract.py` first.

Check: `GET /api/v1/coverage` shows L01, L02, L03, L07 and L09 live, and the report for a Docklands unit (try `310/628 Flinders St Docklands`) returns them `ok`.

Roll back one layer without code: `UPDATE layer_config SET enabled = false WHERE layer_id = 'L09-suburb-compare';`. Roll a dataset back to its previous version, and retry a failed load: see the runbook in `_bmad-output/implementation-artifacts/spec-vic-suburb-layers-data.md`, steps 6 and 7.

## 4. Run the site locally

`npm run dev` crashes on this Windows machine (workerd). Use the Node host instead:

```powershell
npm run dev:node        # reads .env, serves http://localhost:5173
```

Pages: `/` home, `/report/<gnaf_pid>` report, `/checkout/<gnaf_pid>`, `/done`. The search needs the G-NAF load. Without a database every API call answers with a plain error, and the pages still render.

## 5. Deploy to Cloudflare (untested here)

```powershell
npm run build
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put ENTITLEMENT_SECRET      # 32+ random characters
npx wrangler deploy
```

Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` the same way only when you are ready to take payments. Never set `ALLOW_DEV_UNLOCK` in production. Run the Stripe test-mode steps in `_bmad-output/implementation-artifacts/spec-checkout-entitlements.md` (Implementation Notes) before using real keys. The Worker bundle and the Neon driver have not been exercised in workerd, so expect to fix small things on first deploy.

## 6. What is not done (read before launching)

Blockers before the public sees it:
- **The site promises more than the report holds.** The copy says 20 sections for a house and 23 for a flat. The report has five layers (L01, L02, L03, L07, L09). Build the layers or trim the copy.
- **Nothing can be sold yet.** No paid layer exists (sale history needs the reported web lookup, spec `spec-reported-web-lookup.md`, still a draft with rights `pending`). Checkout correctly answers "nothing to unlock".
- **Pro has no cancel path** but the copy says cancel any time. Do not sell Pro until it does.
- **Stripe is untested.** The Pro refund-to-purchase match and the API version pin need a test-mode run.
- **CC BY attribution per source, privacy and terms links, and the Geoscape wording** in the footer need checking and finishing.
- **No login or receipt email.** A buyer who clears cookies cannot reopen a purchase.
- **No rate limiting** on the anonymous search and checkout endpoints.

Known data gaps: 66 grouped Homes Victoria areas (Carlton-Parkville, Richmond-Burnley and others) give L02 a gap; 33 Valuer-General names (Westgarth, Syndal, Fishermans Bend and others) are unmatched. Everything deferred is in `_bmad-output/implementation-artifacts/deferred-work.md`.

Not started: layers for schools, transport, flood, bushfire, heritage, planning, the building and short-stay, the return calculator, and the A4 PDF.

## 7. Git

The foundation is committed (`8825e37`). Everything since is uncommitted in the working tree: migrations 0004 and 0005, the pipelines, layers, site, checkout, tests, specs and this file. Review it, then commit when you are ready. `.env` is ignored by git.

## 8. Live deployment (2026-11-21)

Worker `vicprop` is deployed at https://vicprop.agenticapps.workers.dev (Cloudflare account on the logged-in Wrangler). Secrets set: `DATABASE_URL`, `ENTITLEMENT_SECRET`. Not set, on purpose: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (checkout answers `payments_not_configured`) and `ALLOW_DEV_UNLOCK` (the dev route answers 404). Redeploy with `npm run build` then `npx wrangler deploy`. The branch `build/foundation` is pushed to origin; `main` is unchanged. The GitHub repo is public.

## 9. Report sections added 2026-11-21

Migration 0006 and `node --env-file=.env pipeline/derive/rating.mjs` have been run on Neon, and `vicprop` is redeployed with L05 Return calculator, L15 Conditions rating (VIC apartment suburbs only) and L13 What should you ask next. The report now has eight sections. After any reload of Census or Valuer-General data, run `npm run pipeline:rating` again (it is the last step of `npm run pipeline:suburb-data`). Batch 2 (section 10) then added transport, schools, building, supply, screener and sources.


## 10. Report batch 2: transport, schools, building, supply, screener, sources (built and run on Neon 2026-11-21)

Six new sections, all free for now (same decision as batch 1: nothing paid can be sold yet): `L16-transport` How do you get around?, `L17-schools` Which schools is it zoned for?, `L11-building` What do we know about the building?, `L08-supply` What new apartments are coming?, `L10-screener` Where else could you invest?, `L14-attribution` Where did all this come from?. The report page order is L01, L02, L03, L16, L17, L11, L08, L05, L07, L09, L10, L15, then L13 and L14.

**Order to run (PowerShell, repo root, `.env` holding `DATABASE_URL`).** G-NAF and the suburb datasets from section 3 must already be published: the building match reads G-NAF and the screener reads the suburb datasets.

```powershell
node --env-file=.env db/migrate.mjs      # migration 0007: 3 sources, 6 tables, 6 layer switches, L13 gets 3 more sources
python -I pipeline/ingest/gtfs-extract.py                       # extracts the stops into data/out/gtfs-vic (a few minutes)
node --env-file=.env pipeline/ingest/gtfs-stops.mjs             # loads gtfs_vic
node --env-file=.env pipeline/ingest/school-zones.mjs           # school locations (Windows-1252 CSV) then school zones, two dataset versions
node --env-file=.env pipeline/ingest/com-buildings.mjs          # City of Melbourne buildings and development monitor; matches buildings to G-NAF
```

Each prints its counts and exits non-zero if a check fails, leaving the old dataset live. Dry runs in memory, no database needed: `node pipeline/ingest/gtfs-stops.mjs --pglite` (small committed fixture feed; add `--dir data/out/gtfs-vic` for the real extract), `node pipeline/ingest/school-zones.mjs --pglite`, `node pipeline/ingest/com-buildings.mjs --pglite` (G-NAF is not published in memory, so nothing is matched there). `data/out/gtfs-vic/` must exist for the real GTFS load; `npm run pipeline:gtfs` creates it.

**Counts the checks expect (from the 2026-11-14 files).** GTFS: 28,777 stops (324 train, 1,624 tram, 25,992 bus, 837 coach), feed dated 2026-11-06. Schools: 2,318 open schools and 2,372 zone rows (1,268 primary), 11 zone schools not in the locations file keep their name only. City of Melbourne: 14,093 current buildings (census 2024), 1,451 developments, and with the full G-NAF loaded about 18,600 G-NAF buildings matched (13,752 exact street number, 4,848 street number inside the council's range). The match was tried locally on the real files against the real G-NAF extract: the Docklands unit 310/628 Flinders St sits in G-NAF building GAVIC720476126, which matches the council record "614-644 Flinders Street" (built 2018, 45 floors) by range, so its facts show as Estimated. The check fails the load if fewer than 5,000 G-NAF buildings match while G-NAF is published.

**What is real, and what it says.**
- Transport: nearest stop per kind (train, tram, bus, regional coach) and counts within 400 m and 800 m, from the PTV GTFS stops. Straight-line distances only: no walk time, no isochrone. A schematic SVG (no map tiles) shows the stops.
- Schools: which 2026 government school zones contain the address (every zone listed with its year levels, none picked), the nearest government and non-government schools, with the 2026 zone-year line, "not a guarantee of a place, confirm with the school or the Department", and the Department's "should not be relied on for property purchase decisions". No quality score of any kind. Government and non-government school numbers overlap, so schools are keyed G or N plus the number.
- Building: the G-NAF unit count as a range (indicative, about 10% either side, Estimated; G-NAF can miss unit addresses) and, where the data build matched one council record, year built, floors, main use and the council's dwelling count with the match type. Outside the City of Melbourne it says the dataset covers that council only and invents nothing.
- Supply: projects and dwellings under construction, approved and applied for within 1 km, from the council's development monitor. City of Melbourne addresses only.
- Screener: suburbs within two boundaries (G-NAF neighbours), with price, rent and gross yield before costs, ordered by yield with thin-sample rows last; the conditions-rating column appears only where `market_validation` says validated (Victorian units).
- Attribution: every source a section that ran cited, with its credit text, licence and dataset date, read from `src_source` and `src_dataset_current`.
- As-of dates: zones, locations and City of Melbourne datasets carry the date the file was saved into `data/raw` (2026-11-14); GTFS carries the feed build date (2026-11-06). The council building census year (2024) is in each figure note.

**Roll back one section without code:** `UPDATE layer_config SET enabled = false WHERE layer_id = 'L16-transport';` (and likewise for the others).

**After a data refresh:** re-run the matching loader, `npm run pipeline:com`, whenever G-NAF is reloaded, because the match is made against the G-NAF version current at the time.

**Not built in this batch (and why).** Planning, flood, bushfire and heritage (the Vicmap server returned 504 on every call on 2026-11-21; next batch, live through `vendor_cache`). Nearby amenities (no shops or cafes in Vicmap; OpenStreetMap or Overture needs a licence decision). Crime (built in batch 3, section 11). Short-stay (rights pending; needs a CRM sync and a decision). Sale history (reported web lookup, rights pending). Price drivers (the model came from Domain data). Photos (no licensed source). Base-map tiles (OpenStreetMap's tile policy bars bulk use).


## 11. Report batch 3: recorded crime (built 2026-11-21; Neon load, deploy and browser check still to run)

One new section, free for now like the others: `L18-safety` What does recorded crime look like?, between schools and the building. The report page order is now L01, L02, L03, L16, L17, L18, L11, L08, L05, L07, L09, L10, L15, then L13 and L14. The layer id keeps the word "safety" (the registry id); nothing the reader sees says safe or unsafe.

**Order to run (PowerShell, repo root, `.env` holding `DATABASE_URL`).** G-NAF must already be published (the address supplies the suburb name and postcode).

```powershell
node --env-file=.env db/migrate.mjs      # migration 0008: source csa_crime_incidents, 3 tables, the L18 switch
npm run pipeline:crime                   # extract (python, openpyxl, about 20 seconds) then load and publish
```

`npm run pipeline:crime` is `python -I pipeline/ingest/crime-extract.py && node pipeline/ingest/crime.mjs`, like the other pipeline scripts it does not read `.env` itself, so with `.env` run the two steps by hand: `python -I pipeline/ingest/crime-extract.py` (writes `data/out/crime-vic/`, gitignored), then `node --env-file=.env pipeline/ingest/crime.mjs`. Dry run in memory, no database needed: `python -I pipeline/ingest/crime-extract.py` then `node pipeline/ingest/crime.mjs --pglite` (add `--dir DIR` for another extract). The loader prints its counts and exits non-zero if a check fails, leaving the old dataset live.

**Source.** `data/raw/vic/crime/Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx` (17 MB, already downloaded; page https://www.crimestatistics.vic.gov.au/crime-statistics/latest-victorian-crime-data/download-data, files need a browser User-Agent). Licence: CC BY 4.0, stated in the workbook's own Notes ("When reporting this data you must attribute the Crime Statistics Agency (or CSA) as the source"). The loader refuses a workbook whose notices do not carry that sentence, because the source is cleared on it. The other three workbooks in that folder are not used.

**What is loaded.** Table 01 (council area, count and rate per 100,000, years ending June 2017 to 2026) and Table 03 (suburb or town and postcode by offence, added up to the 25 offence subdivisions). Tables 02, 04 and 05 (by offence group and police service area, location type, charge status) and the victim, offender and family-incident workbooks are not loaded.

**Counts the checks expect (workbook saved 2026-11-21).** Table 01: 870 rows (87 a year for 10 years: 79 council areas, 2 non-council rows and 6 region "Total" rows); the Total rows are checked against the rows they add up (a mismatch fails the load) and are not stored, because they carry a rate and would double count. Table 03: 341,869 rows, 181,147 once added up to subdivision; the sum for each year must equal the extractor's control total and the council counts within 1% (in the real file they are equal: 465,100 for 2026). Every Table 03 council area must be in Table 01. Dataset 181,957 rows (181,147 suburb, 810 council), 14 notices.

**What it shows.** For the address's suburb (matched on the normalised G-NAF locality name AND the postcode; no match is a gap): the incidents recorded in the latest year in total and by the six divisions, the change on the year before, the offence table (this year and last), the five-year totals, then the council area's rate per 100,000 residents beside the Victorian rate, and the CSA's notices word for word. A suburb in two councils has its counts added and one rate row for each council. No suburb rate (the CSA publishes none; its suburb boundaries are not the ABS ones), no score, label, ranking or forecast. Chips: the council rate as published is Observed; anything added up, subtracted or divided is Estimated (the suburb totals, the year change, the Victorian rate). The Victorian rate is worked out from the council rows so the top and bottom match: each area's residents are its incidents times 100,000 divided by its rate.

**Known limits.** The agency lists only offences that occurred, so a division with no row shows 0 and a year with no row shows "None listed". Some agency suburb and postcode pairs differ from G-NAF (for example Windsor appears under 3004), and those addresses get an honest gap. The newest year's rates use Victoria in Future population estimates (the CSA says so, and the section carries the note).

**Roll back without code:** `UPDATE layer_config SET enabled = false WHERE layer_id = 'L18-safety';`.

**Orchestrator steps still to run:** migration 0008 and the crime load on Neon, `npm run build` and `npx wrangler deploy`, then the browser check on GAVIC720519114 and GAVIC425618586 at 1200 px and 390 px.



## 12. Report batch 3: street photos and nearby places (built 2026-11-21; places moved to a loaded OpenStreetMap extract the same day; migrations, places load, secret, deploy and live check still to run)

Two new free sections and the first live vendor adapters: `L19-photos` What does the street look like? (right after the property section) and `L20-places` What is nearby? (right after transport). L19 reads no loaded dataset: each call goes to an outside service (Mapillary, Wikimedia Commons) at request time and is cached in `vendor_cache`. L20 makes no outside call at all: it reads `ref_place`, a Victorian OpenStreetMap extract loaded by a pipeline (migration 0010). It was first built on the public Overpass API, which timed out on the live Worker every time and is a fair-use service that must not carry a paid product's traffic; that adapter is gone.

**Run order (PowerShell, repo root, `.env` holding `DATABASE_URL`).**

```powershell
node --env-file=.env db/migrate.mjs                 # migrations 0009 (sources openstreetmap, mapillary, wikimedia_commons; layers L19, L20) and 0010 (table ref_place)
uv run --no-project --with osmium python -I pipeline/ingest/osm-places-extract.py    # about a minute; writes data/out/osm-places/ (gitignored)
node --env-file=.env pipeline/ingest/osm-places.mjs                                 # loads and publishes the places dataset into DATABASE_URL
npx wrangler secret put MAPILLARY_ACCESS_TOKEN      # paste the Mapillary client token; without it L19 shows Wikimedia photos only
npm run build; npx wrangler deploy
```

`npm run pipeline:places` runs the extract and the load in one go, but npm scripts do not read `.env`, so with `.env` run the two steps by hand as above. Dry run in memory, no database needed: the extract, then `node pipeline/ingest/osm-places.mjs --pglite` (add `--dir DIR` for another extract). The loader prints its counts and exits non-zero if a check fails, leaving the old dataset live. Until the places load has run, L20 is the gap "Nearby places are not loaded." and nothing else changes. For local runs put `MAPILLARY_ACCESS_TOKEN=...` in the gitignored `.dev.vars` (Worker) or `.env` (node dev). The token is read in `src/server/vendors/index.ts` only and is never logged, cached or returned (the request URL carries it, so adapter errors never include the URL).

**Sources.** Mapillary images (CC BY-SA 4.0, credit "Photos: Mapillary contributors, CC BY-SA 4.0"); Wikimedia Commons photos (only public domain, CC0, CC BY and CC BY-SA files; each shows its own author and licence); OpenStreetMap places from the Geofabrik Australia extract (ODbL 1.0, credit "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright). All three are `cleared` in 0009 on the owner's rulings of 2026-11-21 (public images may be used; OpenStreetMap with that credit).

**The places dataset.** Source file `data/raw/vic/osm/australia-261120.osm.pbf` (Geofabrik Australia extract of 2026-11-20, 976,690,287 bytes, about 977 MB; Geofabrik publishes no Victoria-only file, so the extractor keeps only features inside Victoria's bounding box, lon 140.9 to 150.1 and lat -39.3 to -33.9, which also takes in border towns and country of southern New South Wales; the report shows places for Victorian addresses only, so a place across the border is simply a real nearby place). `osm-places-extract.py` (pyosmium, run with `uv run --no-project --with osmium python -I`, uv fetches osmium into its own cache) keeps features tagged `shop` in supermarket, convenience, greengrocer, bakery; `amenity` in cafe, restaurant, pharmacy, doctors, clinic, hospital, library, gym; `leisure` in park, fitness_centre, playground. A node is its own point, a way takes the centroid of its outline (the mean of its points if open) and a multipolygon relation the area-weighted centroid of its outer rings. A relation tagged only on its outer way (the old tagging style) is not picked up. The category rule is `categoryOf` in `src/server/layers/shared/place-category.ts` and `category_of` in the extractor; `src/server/layers/place-category.test.ts` runs both over the same samples. `as_of` is the extract date from the file name (2026-11-20). Counts in the real file: 45,746 places (groceries 5,325 of which 1,716 supermarkets; food 10,887; parks and playgrounds 25,039; medical 3,172; fitness 905; library 418); 16,899 nodes, 28,509 ways, 338 relations.

**Publish checks (osm-places.mjs).** Before anything is created: every row passes the schema (a point inside the Victoria box, a known category, an osm_id of the form node/N, way/N or relation/N), no duplicate osm_id, the manifest's counts agree with the rows, and the extractor's own count of `shop=supermarket` is 500 to 5,000. In the publish transaction: declared row count, at least 20,000 and at most 600,000 rows, no shrink below 80% of the current version, every category present, at least 5,000 parks and playgrounds, every point inside the box, no duplicate osm_id, and at least 50 cafes and restaurants within 800 m of -37.8136, 144.9631 (Melbourne CBD). A failed check leaves the old dataset live. To refresh, download a newer `australia-YYMMDD.osm.pbf` into `data/raw/vic/osm/` (Geofabrik publishes weekly files) and run the two steps again; the extractor picks the newest file by name.

**Mapillary terms, as read 2026-11-21.** help.mapillary.com (Licenses) says images are shared under CC BY-SA and must be credited to the photographer; the version is not stated there, 4.0 is assumed from the owner's note. Mapillary's help site returned 403 to a direct fetch, so this comes from search summaries of its pages. Thumbnail URLs are signed CDN links; nothing found says how long they last (one forum post reports "URL signature expired"). Hence the Mapillary cache is 3 days, not the 7-day ceiling the spec allows. If a photo ever shows as broken, shorten `MAPILLARY_TTL_DAYS` in `src/server/vendors/mapillary.ts`.

**How it behaves.** L19 makes at most 2 outside calls, in parallel, 8 second limit; the layer runner waits 10 s for it (`LayerDef.timeout_ms`) so a slow vendor is a gap ("Photos are not available right now."), never an error. Cache keys are the vendor plus the point rounded to 3 decimals (about 100 m) plus the radius; each adapter searches around the rounded point with a margin, and the layer filters by true distance (street photos 150 m, Commons photos 1 km). A failed call is never cached. Public data is stored with `principal_id` null. Images are never stored or proxied. L20 is one indexed query on `ref_place` (a bounding box on lat and lon, then the straight-line distance in code, 800 m): no outside call, no limit, as old as the extract. It is a gap, never an error, when the dataset is not loaded ("Nearby places are not loaded.") or the address is outside Victoria or has no coordinates; it does not list the dataset in `dataset_ids`, because the rights gate would turn a missing dataset into `not_covered` and the spec asks for the gap.

**Safe to test without the network.** Vitest installs a setup file (`src/server/testing/no-network.ts`) that makes the global `fetch` throw, and layers get `UNAVAILABLE_VENDORS` unless a test passes fakes (`src/server/testing/fake-vendors.ts`).

**Roll back one section without code:** `UPDATE layer_config SET enabled = false WHERE layer_id = 'L19-photos';` (or `'L20-places'`).

**Smoke test to run after deploy.** Open GAVIC720519114 (Docklands) and GAVIC425618586 at 1200 px and 390 px: street photos with creator, licence and a Source link under each; Commons photos if any; the places table with the OpenStreetMap credit (read from `ref_place`, so it answers in milliseconds); the sources list crediting OpenStreetMap, Mapillary and Wikimedia Commons. Check the `vendor_cache` rows for Mapillary and Wikimedia (principal_id null, expiry within 3 or 30 days); there are no new `openstreetmap` rows in it any more (old ones from before 0010 expire on their own and can be deleted: `DELETE FROM vendor_cache WHERE vendor = 'openstreetmap';`). A second load must not call out again.

## 13. Report batch 3: reported recent sales and price drivers (built 2026-11-21; migration 0011, the two Neon loads, deploy and browser check still to run)

Two new free sections, placed right after the price section: `L21-sales` What have nearby homes sold for? (recent sales in the same building, or on the same street for a house, as reported on realestate.com.au) and `L04-drivers` What makes it worth more or less? (what bedrooms, bathrooms, a car space, the floor and the suburb are associated with in apartment sale prices). The report order is now L01, L19, L02, L03, **L21, L04**, L16, L20, L17, L18, L11, L08, L05, L07, L09, L10, L15, then L13 and L14. The owner ruled on 2026-11-21 that sale history has no licence issue and that the RapidAPI realty-in-au sold listings may be used for the model. Nothing calls the listing site or RapidAPI at request time: both sections read loaded tables.

**Order to run (PowerShell, repo root, `.env` holding `DATABASE_URL`).** G-NAF must already be published (a sale is matched to a G-NAF building) and so should the suburb list.

```powershell
node --env-file=.env db/migrate.mjs                          # migration 0011: sources rp_sold_listings and rp_sold_model, 3 tables, the L21 and L04 switches
node --env-file=.env pipeline/ingest/rp-sold.mjs             # loads and publishes the sold listings (about 5,700 sales)
node --env-file=.env pipeline/derive/price-drivers.mjs       # fits the model on the PUBLISHED sales and publishes it (run this after every sales load)
npm run build; npx wrangler deploy
```

`npm run pipeline:sold` and `npm run pipeline:drivers` run the same two steps, but npm scripts do not read `.env`, so with `.env` use the `node --env-file=.env` lines above. Dry run in memory, no database needed: `node pipeline/ingest/rp-sold.mjs --pglite` (no G-NAF there, so no building is matched) and `node pipeline/derive/price-drivers.mjs --pglite` (loads the real files first, then fits and prints the driver table and the Docklands layout medians; `--suburb SAL` prints another suburb's). Both exit non-zero if a check fails and leave the old dataset live. Until the loads have run L21 and L04 are the gap "Reported sales are not loaded."; if only the model is missing, L04 says "The price-driver model is not loaded."

**Input files (local, gitignored, never changed by the pipeline).** `data/rp_harvest.json` (key `sold`: 900 sales for the six inner suburbs, harvested 2026-11-11, each with `crm_suburb`) and `data/rp_sold_harvest.json` (`retrieved` 2026-11-21 and 20 more suburbs, 240 sales each; six more suburbs in it returned no Victorian rows). The six CRM suburbs get their ABS SAL codes from `CRM_SAL` in `rp-sold.mjs` (Melbourne CBD 21640, Southbank 22315, Docklands 20766, St Kilda 22343, South Yarra 22314, Port Melbourne 22107); the others carry their own. **The loader reads only the property fields** (`pickProperty`): not agent, agency, phone, the listing title or anything else, so none reaches a table, a log line or an output. The real-file test searches the loaded rows for every agent, agency and phone value in the files. The dataset's date is the NEWEST harvest date (2026-11-21), so the 900 inner-suburb sales, retrieved on 2026-11-11, show the later date too.

**What is loaded.** 5,698 of 5,700 sales in 26 suburbs, sold 2025-03-03 to 2026-11-21 (two listings dropped for a price under $50,000: a car space and a $35,000 "apartment"). Dropped and counted, never silent: no numeric price, price outside $50,000 to $20,000,000, a bad date or one more than two years before the harvest date or after it, a non-Victorian postcode, no type, a repeated listing id. A coordinate outside Victoria is stored as null; an address with no readable street number keeps its row with the street fields null. Each sale keeps its listing path (`url`); the report links to `https://www.realestate.com.au/` plus it.

**Matching to G-NAF buildings (AD-6).** A sale is matched when its street number (or range), street, suburb and postcode are those of exactly one multi-unit G-NAF building (`building_id` and `match_type = exact_street_number`); two buildings, another suburb or no building is no match and nothing is guessed. Listing street names are normalised (last word's abbreviation spelled out, "Mt" as "Mount", apostrophes dropped) the way G-NAF names are. Checked on the real G-NAF extract (filtered to these suburbs, in memory): 3,484 of 5,698 sales matched, and 2,898 of the 3,329 apartment sales that have a unit number (87%); the 11 sales at 628 Flinders Street are the Docklands test address's building.

**Publish checks, sales.** Declared row count, at least 3,000 rows, no shrink below 80% of the current version, every price in range, every sale date within two years before the harvest date and not after it, no duplicate listing id, at least 20 suburbs, and (only when the suburb list or G-NAF is published in the same database) every SAL code a known suburb and every building id a known G-NAF building.

**The model (pipeline/derive/price-drivers.mjs, source `rp_sold_model`, a derived dataset published like the rating).** The method of `scripts/23-price-drivers.mjs`: ordinary least squares on log sale price with suburb fixed effects, apartments only, all harvested suburbs pooled. A sale is used when it is an apartment, unit or flat priced $150,000 to $2,500,000 with 1 to 3 bedrooms, at least 1 bathroom and a unit number of three or more digits (2105 is floor 21; the script's parsing is shared in `pipeline/lib/sold.mjs`), in a suburb with at least 20 such sales. On the real files: **1,634 of 3,387 apartment sales used** (1,682 left out for a unit number under three digits, 25 for price, 9 for bedrooms, 37 in 6 thin suburbs), 20 suburbs, sold 2025-03-21 to 2026-11-20, R-squared 0.703, typical unexplained spread about 19%. Effects (percent, standard error, sales with it): 2 bed vs 1 bed +32.1% (1.3, 948), 3 bed +101.1% (2.4, 110), 2+ baths +19.6% (1.3, 643), car space +21.2% (1.4, 1,347), floors 10-19 +0.1% (1.5, 237), 20-29 +1.7% (2.1, 98), 30+ +9.0% (2.6, 74); suburbs against Melbourne CBD from Footscray -17.3% to Port Melbourne +24.5% (Docklands +9.3%, standard error 2.4, 142 sales). **The standard error is the script's:** the coefficient's standard error times 100 on the log-price scale, not a delta-method error of the percentage, so for a large effect (three bedrooms) it understates the spread; the section says so. Layout medians (1 to 3 bed, 1 or 2+ bath, with or without a car space) are the median reported sale price per suburb, stored only where the suburb has at least 20 sales of the layout (65 cells; Docklands has four: 1 bed 1 bath no car $370,000 on 28 sales, 1 bed 1 bath with car $420,000 on 23, 2 bed 1 bath with car $565,000 on 31, 2 bed 2+ bath with car $698,000 on 47). They use every apartment sale with a price in range (no unit number needed). Publish checks: declared row count, at least 8 effects, at least 500 sales used, the 2-bed effect between +5% and +60%, exactly one reference suburb, no negative standard error, every window ending on or before the harvest date, every layout cell at least 20 sales with a price in range.

**What the sections show.** L21: for an apartment, the 8 most recent sales matched to its G-NAF building (all 11 for the Docklands unit's building 628 Flinders Street are counted, 8 shown), for a house the sales of houses, townhouses and villas on its street (street, suburb and postcode must all agree; apartments are left out); each with sale date, price, beds, baths, car spaces, address and a link to its realestate.com.au listing, labelled "As reported by realestate.com.au, not verified, not a Victorian title record"; a count the listing did not give reads "Not listed". L04: the pooled drivers with effect, standard error and sales, this suburb against the reference suburb (or "reference suburb" or "too few usable sales"), the layout medians, the window and the number of sales ("used 1,634 of 3,387"), and "associations in past reported sales, not causes" before the table. Gaps: an address outside the 26 suburbs (both sections name the suburbs), a building or street with no sale in the dataset, a unit with no building, and for L04 a house. No valuation or estimated price for the property, no forecast, no agent, agency or phone anywhere. Chips: every figure is Estimated (the contract's chip set is unchanged: AD-11's "Reported" is a labelled kind of Estimated, so each sale carries the Estimated chip and the words "as reported").

**Roll back one section without code:** `UPDATE layer_config SET enabled = false WHERE layer_id = 'L21-sales';` (or `'L04-drivers'`). To refresh, run the harvest scripts, then the two loaders again.

**Smoke test to run after deploy.** Open GAVIC720519114 (Docklands) at 1200 px and 390 px: L21 lists 8 sales of 628 Flinders Street (newest 17 Sep 2026, $760,000) each with a realestate.com.au link, "Showing the 8 most recent of 11"; L04 shows the seven drivers and the Docklands row with standard errors and sales, the four layout medians and the "not causes" note; the sources list credits "Recent sales as reported on realestate.com.au listings, retrieved by VicProp." and the price-driver model. Open 14 Lucinda Lane, Cranbourne North (GAVIC425618588): both sections are gaps naming the 26 suburbs.
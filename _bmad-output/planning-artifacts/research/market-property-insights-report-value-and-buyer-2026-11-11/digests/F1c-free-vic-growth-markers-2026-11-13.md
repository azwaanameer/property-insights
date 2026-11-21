# F1c Free Victorian and national growth markers (suburb / SA2 / LGA)

Access date: 2026-11-13. Method: 14 web searches, 10 page fetches. No project files read.
Status key: Verified = primary page read this session. Secondary = search-result snippet or mirror only. Unverified = not seen.
Join key to the Valuer-General (VG) median unit price by suburb series (suburb, annual, 2015-2025): "Direct" = suburb name key; "Needs concordance" = SA2/SAL/postcode/LGA crosswalk; "Spatial" = point-in-polygon against a suburb boundary layer.

## 1. Data table

| Marker | Dataset | Unit | Frequency / coverage | Licence | Access | Join to VG suburb series | Status |
|---|---|---|---|---|---|---|---|
| Pop/household/dwelling projections | VIF2023 LGA Population, Household and Dwelling Projections to 2036 | LGA (79 + unincorporated) | Static 2023 vintage (record updated 2025-04-29); horizon 2036 | CC BY 4.0 | XLSX: planning.vic.gov.au/__data/assets/excel_doc/0033/680874/VIF2023_LGA_Pop_Hhold_Dwelling_Projections_to_2036.xlsx | Needs concordance (suburb to LGA; many suburbs span 2 LGAs) | Verified |
| Pop projections, small area | VIF2023 SA2 and VIF Small Area (VIFSA, 191) files | SA2 / VIFSA | Static, to 2036 (state and regions to 2051) | CC BY 4.0 on data.vic listings; report cover cites CC BY 3.0 AU | Excel on planning.vic.gov.au VIF "download data" (page returned 403 to fetch) | Needs concordance (suburb to SA2) | Secondary |
| Population actuals | ABS Regional Population 2024-25 (released 2026-03-31) | SA2, LGA | Annual; 2001-2021 final, 2022-24 revised, 2025 preliminary | ABS default is CC BY; not confirmed on page | ABS data download (XLSX) | Needs concordance | Secondary |
| Dwelling approvals | ABS Building Approvals, Australia (Sep 2026 reference, released 2026-11-02, small-area cubes 2026-11-09) | SA2, LGA, GCCSA | Monthly; small-area cubes per financial year (2025-26, 2026-27 YTD); history via older data cubes | ABS Creative Commons (terms on ABS site, not read) | XLSX data cubes and zipped CSV (SA2 and LGA by state) | Needs concordance. Split is "houses" vs "dwellings excluding houses" (apartments + townhouses), no pure apartment split | Verified |
| Dwelling pipeline (state) | Urban Development Program (UDP) 2025 Melbourne (redevelopment sites, 25,371 dwellings under construction metro-wide per snippet) | Site/point and LGA | Annual | Unverified (likely CC BY) | planning.vic.gov.au UDP pages (403 to fetch) | Spatial (points to suburb polygons) | Secondary |
| Dwelling pipeline (CBD) | City of Melbourne Development Activity Monitor | Site; 13 small areas | Roughly twice a year per press; "Unknown" on state listing | CC BY 4.0 on Victorian catalogue; Melbourne portal page names no licence | data.melbourne.vic.gov.au (API/export) | Spatial; covers City of Melbourne LGA only (CBD, Southbank, Docklands, Carlton etc.) | Verified (page); licence conflicting |
| Housing targets | Plan for Victoria housing targets by LGA to 2051 (statewide 2.24m homes; e.g. Boroondara 65,500, Banyule 45,500, Bayside 30,000) | LGA | Static (2025) | Unverified | Web table on planning.vic.gov.au; no dataset found | Needs concordance (LGA only) | Secondary |
| Activity centre / growth areas | Priority precincts and Housing Statement activity centres | Polygons (not located) | n/a | Unverified | Not found as open spatial data | Spatial if located | Unverified |
| Infrastructure: SRL | SRL Planning Area Declaration Boundary (SRL East) | Polygon, hosted feature layer | Last updated 2026-03-18 | Listed on data.vic.gov.au (licence not read) | data.vic.gov.au / data.gov.au; ArcGIS hosted layer | Spatial (suburb in or near polygon) | Secondary |
| Infrastructure: precincts, stations | SRL precincts, Metro Tunnel, LXRP, NELP, West Gate Tunnel | Documents only found; no open precinct/station polygon dataset found | n/a | n/a | bigbuild.vic.gov.au (PDFs); station points derivable from GTFS | Spatial via GTFS stops | Unverified (no dataset) |
| Infrastructure: pipeline | DTF Victorian Infrastructure Pipeline / Capital Investment Dashboard (BP4 2015-16 to 2026-27); Victorian Major Projects Pipeline 2025-26 (Excel) | Project, "locations approximate" | Annual (budget) | Unverified | dtf.vic.gov.au; vic.gov.au Excel | Weak (approximate locations) | Secondary |
| Transit access | PTV GTFS Schedule (Dept of Transport and Planning) | Stop/route points; train, tram, bus | Weekly | CC BY 4.0 on Victorian sources (data.gov.au mirror says CC BY 3.0 AU) | ZIP (opendata.transport.vic.gov.au) | Spatial. Gives current network only; station opening dates need separate research | Secondary |
| Rent level and trend | DFFH Rental Report: Moving Annual Rents by Suburb and Town (RTBA bond data) | Suburb/town, by bedroom count (no flat/unit split stated) | Quarterly; Jun 2026 quarter released 2026-10-29, updated 2026-11-10; series from 2000 per snippet | CC BY 4.0 | XLSX only (dffh.vic.gov.au file; data.vic.gov.au resource) | Direct suburb-name join (best join in this set) | Verified |
| Rent by LGA | DFFH Quarterly Median Rents by LGA (also affordable lettings) | LGA | Quarterly from Mar 2019 | Same series (CC BY 4.0 assumed) | XLSX | Needs concordance | Secondary |
| Vacancy (suburb/postcode) | SQM Research free vacancy graphs | Postcode / suburb / region, incl. Melbourne | Monthly | "Personal reference only"; commercial use requires contacting SQM; underlying data paid | Web charts only | Postcode; not reusable in a commercial report without licence | Verified (terms quoted) |
| Vacancy (official) | No free official suburb-level vacancy found for Victoria | n/a | n/a | n/a | n/a | n/a | Unverified (gap) |
| Short-stay density | Inside Airbnb Melbourne (latest scrape 2026-09-16) | Listing point; neighbourhoods.geojson (unit not stated) | Irregular scrapes; archives by request | CC BY 4.0 | listings.csv(.gz), neighbourhoods.geojson | Spatial (lat/long into suburb polygons); caveat: scraped, not official | Verified |
| Census demand (tenure, dwelling structure, income, age, birthplace) | ABS Census 2021 DataPacks (GCP, TSP etc.) | SAL (suburbs and localities) and SA2 downloads by state | Census 5-yearly; 2021 vintage | ABS CC BY (licence line not shown on page) | ZIP DataPacks per state; GeoPackages. G37 = Tenure and landlord type by dwelling structure (SA2 GeoPackage); G33 is household income, not unoccupied dwellings | SAL names align best with suburb names, but not identical to VG localities | Verified (geographies); table codes Secondary |
| Census 2026 | ABS 2026 Census (held 2026-08-11) | SAL/SA2 | Phase 1 June 2027; employment data Oct 2027; commuting early 2028 (dates may change); new formats will replace DataPacks/GeoPackages | ABS | ABS | n/a until 2027 | Secondary |
| Jobs/commute | ABS Census Journey to Work; Jobs in Australia; City of Melbourne pedestrian counts | SA2 / sensor point | Census-based / continuous | CC BY (assumed) | ABS, data.melbourne.vic.gov.au | Not searched this session | Unverified |
| Hospitals/universities | Vicmap / DH facility points | Point | n/a | n/a | n/a | Spatial | Unverified |
| Risk: planning overlays | Vicmap Planning: Planning Scheme Overlay Polygon (+ History, + codelist) | Polygon (flood LSIO/FO, bushfire BMO, heritage HO as overlay codes) | Updated as schemes amend | CC BY 4.0 on data.vic.gov.au; CC BY 3.0 AU on data.gov.au mirrors | data.vic.gov.au (WFS/shapefile/GeoJSON likely) | Spatial; heritage/flood overlays are lot-level so need % coverage of suburb | Secondary |
| Risk: EPA | EPA data | n/a | n/a | n/a | n/a | n/a | Unverified (not searched) |

## 2. Key findings

- Only one candidate in this set joins directly on suburb name: the DFFH Moving Annual Rents by Suburb and Town (CC BY 4.0, quarterly, RTBA bonds). It is the best free yield-side marker. Caveat: breakdown shown is by bedrooms; a flat/unit split was not confirmed on the page. It gives rent growth and rent level (so gross yield against the VG median unit price), which is the most defensible investor marker.
- Projections (VIF2023) are free and CC BY 4.0 but only LGA is verified; SA2/VIFSA files exist per search. They are 2023 vintage with an explicit "not forecasts" disclaimer, and horizon is 2036 at LGA/SA2 level. Use as a context band, not a suburb ranking.
- Dwelling supply is free at SA2/LGA: ABS Building Approvals is monthly and current (Sep 2026 released 2026-11-02). Split is houses vs "dwellings excluding houses", which includes townhouses, so apartments are not isolated. The state UDP and City of Melbourne Development Activity Monitor give site-level pipeline, but UDP access/licence is unconfirmed and DAM covers City of Melbourne only.
- Free official suburb-level vacancy for Victoria was not found. SQM suburb/postcode vacancy is free to view but "for personal reference only" and commercial reuse needs SQM permission; do not scrape or redistribute. Safer substitute: Census 2021 unoccupied-dwelling share (stale) or LGA-level vacancy from SQM under licence.
- Short-stay density: Inside Airbnb Melbourne is CC BY 4.0, latest scrape 2026-09-16, point data with neighbourhood GeoJSON. Spatial join to suburb polygons is feasible. It is a scrape (listing counts, not bookings), and Victorian short-stay registration data was not checked here.
- Infrastructure pipeline has no clean open geodata for Metro Tunnel, level crossing removals, NELP or West Gate Tunnel; only the SRL planning-area boundary polygon (hosted feature layer, updated 2026-03-18) was found. The DTF pipeline gives "approximate" locations. PTV GTFS (CC BY 4.0, weekly) offers stop points for proximity-to-train/tram features but only for the current network.
- Planning overlays (Vicmap Planning overlay polygons) cover flood, bushfire and heritage as overlay codes and are CC BY 4.0 on data.vic.gov.au (mirrors say 3.0 AU). They are polygon data needing spatial overlay to produce a suburb share; heavy to process but feasible.
- Census 2026 will not help for this release: first results June 2027, with DataPacks/GeoPackages being replaced by new formats. Use Census 2021 SAL/SA2 (renter share, tenure by dwelling structure G37, income, age, birthplace) with its age flagged.

## 3. Geography matching (join to VG suburb series)

- VG suburb series keys on Victorian locality/suburb names. ABS SAL (suburbs and localities) is built from Vicmap locality boundaries but is an approximation: names and boundaries differ, some localities are merged or split, and SAL is re-issued per ASGS edition. Expect a few percent of suburbs to need manual name matching.
- SA2 is not a suburb: SA2s are typically 3,000-25,000 people, often combining several suburbs or splitting one. Use a population-weighted SAL-to-SA2 correspondence (ABS publishes correspondences) or assign each suburb to the SA2 containing its centroid.
- Postcode (POA) is a poor key: postcodes cross suburb and LGA lines. Fine for SQM vacancy if a licensed version is bought, but state clearly that it is approximate.
- LGA data (VIF2023, housing targets, rental LGA medians, building approvals LGA) can be attached to each suburb by its majority LGA; label it "council-area context", not a suburb measure.
- Point data (Inside Airbnb, GTFS stops, SRL polygons, UDP sites, overlays) needs a Vicmap suburb/locality polygon layer; SAL polygons are the easiest free choice if the VG suburb names are mapped to SAL.
- Time alignment: VG series is annual 2015-2025; Census is 2016 and 2021 only; ABS building approvals and DFFH rents are fine for annual aggregation; Inside Airbnb has limited history (use archives by request).

## 4. Sources (accessed 2026-11-13)

- Verified (page read): discover.data.vic.gov.au VIF2023 LGA dataset; discover.data.vic.gov.au Rental Report Moving Annual Rents by Suburb and Town; insideairbnb.com/get-the-data; sqmresearch.com.au/graph_vacancy.php; abs.gov.au Building Approvals latest release; abs.gov.au Census DataPacks page (partially read, 100k of 262k chars); data.melbourne.vic.gov.au Development Activity Monitor information page (template fields unrendered).
- Secondary (search snippet): planning.vic.gov.au VIF pages and VIF2023 report PDF; discover.data.vic.gov.au Rental Report LGA resources; planning.vic.gov.au housing targets page (snippets only); discover.data.vic.gov.au SRL Planning Area Declaration Boundary (and data.gov.au mirror); opendata.transport.vic.gov.au GTFS Schedule; abs.gov.au 2026 Census topics and data release plan, id.com.au 2026 Census release timeline; abs.gov.au regional population 2024-25 methodology; Vicmap Planning overlay polygon on discover.data.vic.gov.au; abs.gov.au GeoPackages page; dtf.vic.gov.au Victorian Infrastructure Pipeline; discover.data.vic.gov.au / data.gov.au Development Activity Monitor.

## 5. Blocked / failed

- WebFetch 403: sqmresearch.com.au home/terms attempt (graph_vacancy page later worked via different path), planning.vic.gov.au VIF download-data page, planning.vic.gov.au UDP 2025 Melbourne page.
- planning.vic.gov.au housing targets page fetch did not complete (first batch returned results only for other pages; result for this URL was not seen; treat targets as Secondary).
- Melbourne DAM information page returned unrendered template placeholders (no licence/date/fields).
- Inside Airbnb page read only chars 0-100,000 of 195,621; neighbourhood unit for Melbourne not confirmed.

## 6. Unverified and gaps

- Whether any SA2-level VIF2023 spreadsheet is published (vs LGA only) and its exact file name; exact licence version on each.
- ABS licence line for Building Approvals, Regional Population and Census DataPacks (ABS default is CC BY 4.0 but not read this session). Table code for unoccupied private dwellings (not G33) not confirmed; check ABS data item list.
- UDP 2025 licence, geometry, and whether apartment-specific pipeline fields exist.
- Housing targets: any machine-readable file; activity centre and priority precinct polygons.
- Big Build station and project location geodata (Metro Tunnel, LXRP, NELP, West Gate Tunnel); Infrastructure Victoria pipeline (not found; DTF pipeline found instead).
- Flood/bushfire/heritage as distinct layers and licence reconciliation (CC BY 4.0 vs 3.0 AU); EPA data not searched.
- Employment (ABS Jobs, Journey to Work), City of Melbourne pedestrian counts, hospital and university locations not searched. Bond lodgement counts not shown on the rent page; separate RTBA data not checked.
- Short-stay registration data from Victoria (state register) not checked here.

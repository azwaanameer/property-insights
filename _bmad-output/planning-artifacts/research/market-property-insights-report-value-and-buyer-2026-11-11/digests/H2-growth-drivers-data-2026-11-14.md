# H2 Growth-driver datasets for a suburb "conditions rating" (all states) - 2026-11-14

Researcher run date: 2026-11-14. Labels: **Verified** = page fetched or URL tested with curl this run (HTTP status/size reported); **Secondary** = web-search summary only; **Unverified** = not checked. Sizes come from `Content-Length` / `Content-Range` headers (files over 50 MB were not downloaded; one accidental 127 MB ABS API CSV pull was deleted). Where a licence is reported from a search snippet it is marked Secondary. Commercial reuse readings are mine from licence names, not legal advice.

Headline: the ABS Data API (SA2 population, building approvals, SEIFA, Census) is the one dataset family that is national, scriptable, no key, CC BY 4.0. Everything else is state-by-state and uneven. Infrastructure project locations are the weakest category: no national machine-readable list, and only QLD (QTRIP roads) and VIC (infrastructure pipeline xlsx) gave file downloads that I could confirm.

---

## 1. Infrastructure and events

| Dataset | Publisher | Granularity | Years / last update | Format | Direct URL | curl result | Licence / commercial reuse | Scriptable? | Label |
|---|---|---|---|---|---|---|---|---|---|
| Infrastructure Priority List 2026 (national) | Infrastructure Australia | Proposals (not geocoded in file) | List dated 11 Mar 2026 (Secondary); PDF last-modified 6 Mar 2026 | PDF only; "interactive map" page has PDF download; no CSV/GeoJSON link found in page HTML | https://www.infrastructureaustralia.gov.au/sites/default/files/2026-03/2026%20Infrastructure%20Priority%20List.pdf | 200, 20,537,672 bytes | Licence not stated on page (not found in fetched HTML). Treat as unknown; ask IA | Scriptable download, but needs manual extraction of the table from PDF | Verified (URL); licence Unverified. WebFetch of IA pages timed out; I used curl on the HTML instead |
| Victorian Infrastructure Pipeline dataset 2026-27 | Dept of Treasury and Finance Vic | Project, "locations approximate only" | Page says updated 2 Nov 2026; file last-modified 18 Aug 2026 | XLSX, 2.59 MB per page | https://dtf.vic.gov.au/sites/default/files/2026-08/2026-27-Victorian-Infrastructure-Pipeline-data.xlsx | 301 then 200 | Licence not stated on page (footer links Copyright). Unknown | Yes (no login) | Verified URL; contents (status, completion dates, lat/long) not opened; licence Unverified |
| QTRIP 2025-26 to 2028-29 (roads and transport program) | Qld Dept of Transport and Main Roads | Project (roads), with coordinates in some editions | Dataset modified 2025-08-21 | CSV | https://www.data.qld.gov.au/dataset/fd6db6f7-e895-427b-9221-d95a32c90848/resource/87448a6d-c86d-4f45-b69a-2a0707201cbf/download/qtrip-2025-26-to-2028-29-publication-excel-v1.0-24-june-2025-open-data-csv.csv | 206, 151,590 bytes, last-modified 21 Aug 2025 | CC BY 4.0 (CKAN API) - commercial reuse yes with attribution | Yes (CKAN API: data.qld.gov.au/api/3/action) | Verified. Columns/geometry not inspected |
| Queensland Government Infrastructure Pipeline (QGIP) | Qld Dept State Development | Project | Review under way; updated pipeline "mid to late 2026" | Interactive dashboard; no CSV found | https://www.statedevelopment.qld.gov.au/infrastructure/projects-and-programs/queensland-government-infrastructure-pipeline | not tested | n/a | No | Secondary |
| Qld Forward procurement pipeline | Qld Government | Opportunity, may span locations | Feb 2025 / Nov 2025 editions | CSV | data.qld.gov.au/dataset/forward-procurement-pipeline | not tested | CC BY presumed (Unverified) | Yes | Secondary |
| NSW Budget Paper 2 major projects (geocoded) | NSW Treasury via data.nsw.gov.au | Project points | Latest resource found is 2017-18 (dataset modified 2019-06-11) - stale | CSV, GeoJSON | https://data.nsw.gov.au/data/dataset/56f0b52a-1354-4910-b681-509ecd92888e/resource/d3f364ff-3f4c-400d-82d0-3a8f7dd67344/download/nswbudgetpaper2201718point_v02.geojson | not tested | CC BY | Yes | Verified listing via CKAN API; too old to use |
| NSW Infrastructure Pipeline | Infrastructure NSW | Project >$50m | Page last updated 24 Jul 2026 (search summary) | Web listing with filter and export (format unconfirmed) | https://www.infrastructure.nsw.gov.au/industry/construction-industry/pipeline-of-projects | not tested | Unknown | Maybe | Secondary |
| ANZ infrastructure pipeline (Infrastructure Partnerships Australia) | IPA | Project | n/a | Website; a 2020-era UK document says PDF only | https://infrastructurepipeline.org/utilise-our-data | not tested | Unknown | Unknown | Secondary - worth a look, page "utilise our data" suggests a data offer |
| SA Major Developments Directory | SA DPTI | Project | Dataset modified 2017-08-29, XLS 2013-14 | XLS | data.sa.gov.au/data/dataset/major-developments-directory | not tested | CC BY | Yes | Verified listing; stale |
| SA Planning and Development Fund investment projects | SA DPTI | Project (spatial) | modified 2024-07-16 | SHP, KML, GeoJSON zips | https://www.dptiapps.com.au/dataportal/PlanDevFundInvestmentProjects_geojson.zip | not tested | CC BY | Yes | Verified listing only |
| Suburban Rail Loop planning area boundary | Vic DTP | Polygon | modified 2026-03-18 | spatial (datashare) | discover.data.vic.gov.au dataset "SRL Planning Area Declaration Boundary" | not tested | CC BY 4.0 | Via Vic Data Share | Verified listing |
| WA METRONET / Perth projects | - | - | - | - | none found on catalogue.data.wa.gov.au (search "METRONET" returned 0) | - | - | - | Verified negative for that catalogue only |
| Brisbane 2032 venues, Cross River Rail, Sydney Metro, Western Sydney Airport, Canberra light rail | various | - | - | No project-location dataset found in state CKAN searches (only contract disclosures, annual reports, planning documents). | - | - | - | - | Verified negative (CKAN searches only, not exhaustive) |

Notes
- No national, geocoded, status/completion-date infrastructure dataset was found. A practical route is to build our own project table from QTRIP (QLD roads), the Victorian pipeline xlsx, and manual curation of the IA list and the Olympics venue plan.
- Proposed or under-construction rail lines as GIS: none confirmed (only Suburban Rail Loop planning boundary in Vic).

---

## 2. Public transport: static GTFS

| State | Publisher | URL | curl result | Last-modified | Licence | Commercial reuse | Scriptable | Label |
|---|---|---|---|---|---|---|---|---|
| VIC | Transport Victoria (Open Data Transport Vic) | https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/62370a3a-3fe0-4f6b-9022-9ebbf25751cc/download/gtfs.zip | 200, 243,642,809 bytes (not downloaded) | 13 Nov 2026 (weekly) | CC BY 4.0 (page) | Yes with attribution | Yes, no key | Verified |
| QLD (SEQ) | TransLink | https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip | 206, 43,401,875 bytes | 13 Nov 2026 (weekly) | CC BY 4.0 on data.qld.gov.au (Secondary; data.gov.au mirror says "not specified") | Yes with attribution (confirm) | Yes, no key | URL Verified, licence Secondary |
| WA (Perth) | Public Transport Authority | https://www.transperth.wa.gov.au/TimetablePDFs/GoogleTransit/Production/google_transit.zip (302 from /LinkClick.aspx?link=%2fTimetablePDFs%2fGoogleTransit%2fProduction%2fgoogle_transit.zip) | 206, 26,921,491 bytes | 12 Nov 2026 | PTA custom licence: non-exclusive, limited, revocable; no PTA trademarks; must state data is "available free of charge from www.transperth.wa.gov.au"; accepted by downloading | Licence silent on commercial use; revocable - get written confirmation before relying on it in a paid product | Yes (direct link) | Verified |
| SA (Adelaide) | Dept of Infrastructure and Transport / Adelaide Metro | https://gtfs.adelaidemetro.com.au/v1/static/latest/google_transit.zip | 206, 15,382,669 bytes | 13 Nov 2026 | CC BY (data.sa.gov.au, modified 2022-09-08); data.gov.au says CC BY 3.0 AU | Yes with attribution | Yes, no key. Note: I found this path by testing, not from a documented page; the developer page https://gtfs.adelaidemetro.com.au/ returns 200 HTML | URL Verified, licence Secondary |
| NT (Darwin, Alice Springs bus) | NT Dept of Lands, Planning and Logistics | https://dli.nt.gov.au/data-feeds/bus-gtfs/google-transit-darwin.zip | 206, 1,360,948 bytes | n/a | CC BY 4.0 (Secondary) | Yes with attribution | Yes | URL Verified, licence Secondary |
| NSW | Transport for NSW Open Data Hub | https://opendata.transport.nsw.gov.au/dataset/timetables-complete-gtfs | Page 200 (24,310 bytes); resource says "Login to download"; api.transport.nsw.gov.au endpoint returned 401 without key | Page: updated 13 Nov 2026 17:45 UTC (daily) | CC BY (page) | Yes with attribution | Needs free account + API key (script OK after registration) | Verified |
| ACT | Transport Canberra | https://transport.api.act.gov.au/gtfs/data/gtfs/v2/gtfs.zip | 401 Unauthorized | n/a | CC BY 4.0 (developer page) | Yes with attribution | Needs registration per MyWay+ GTFS developer access guide | Verified |
| TAS | Dept of State Growth | https://www.transport.tas.gov.au/public_transport/gtfs-data | 403 to WebFetch and curl (UA Mozilla) | n/a | Unknown | Unknown | Unknown | BLOCKED - manual |
| Proposed/under-construction rail lines | - | none found | - | - | - | - | - | - |

Also useful: SA stop shapefiles/GeoJSON (https://www.dptiapps.com.au/dataportal/AdelaideMetroStops_geojson.zip, CC BY, modified 2020-02-24, Secondary-from-CKAN, not curl-tested).

---

## 3. Population and jobs

### 3a. ABS Data API (national, Verified)

- Base URL that works: `https://data.api.abs.gov.au/rest/` (tested 200). The host `api.data.abs.gov.au` that appears in the ABS user guide examples did not resolve from this machine (curl exit 6), so use `data.api.abs.gov.au/rest`.
- Dataflow list: `GET /dataflow/ABS?detail=allstubs` with `accept: application/vnd.sdmx.structure+json` returned 1,228 dataflows (603,545 bytes).
- Data query: `/data/ABS,{DATAFLOW},{version}/{dimension key}?startPeriod=...&endPeriod=...` with `accept: text/csv` (or `application/vnd.sdmx.data+json`). Unfiltered `all` on BA_SA2 returned ~127 MB for 3 months - always filter.
- Licence: ABS site states all material under CC BY 4.0 except logos, microdata, third-party content (page fetched). Commercial reuse is permitted under CC BY with attribution; the page does not address the API specifically. No API key. Rate limits not stated.

| Marker | Dataflow ID (version) | Granularity / years | Test result | Label |
|---|---|---|---|---|
| Population, SA2 | **ABS_ANNUAL_ERP_ASGS2021 (1.2.0)** "ERP by SA2 and above (ASGS Edition 3), 2001 onwards". Dimensions MEASURE, REGION_TYPE, ASGS_2021, FREQ | SA2 annual, up to 2025 | CSV for 2024-2025 returned 200, 424,075 bytes, 4,908 SA2 rows (=2 years x ~2,454 SA2s); 2025 ERP present (e.g. Qld 8,592,524) | Verified |
| Population, SA2 by age and sex | **ERP_ASGS2021 (1.0.0)** | SA2, age/sex, 2001 onward | listed in dataflow list; not queried | Verified listing |
| Population components of change, SA2 | **ERP_COMP_SA_ASGS2021 (1.0.0)** (2022 on); earlier **ERP_COMP_SA** (2017-2021) | SA2 | listed only | Verified listing |
| Population, LGA | ERP_LGA2025 (1.0.0), ABS_ANNUAL_ERP_LGA2025 (1.0.0), ERP_COMP_LGA2025 | LGA | listed only | Verified listing |
| Regional summary stats (ABS "Data by region") | ABS_REGIONAL_ASGS2021 (1.7.0) "Data by region 2011-2025, by Main Structure and GCCSA"; ABS_REGIONAL_LGA2021 (1.7.0) | SA2/SA3/SA4 etc., 2011-2025 | listed only | Verified listing |
| Building approvals SA2 | **BA_SA2 (2.0.0)** "from July 2021 onwards" (dims MEASURE, SECTOR, WORK_TYPE, BUILDING_TYPE, REGION_TYPE, REGION, FREQ); history: BA_SA2_2016-21 (1.0.0), BA_SA2_201116 (1.0.0) | SA2, monthly | Filtered series query returned latest observation 2026-09; the dataflow carries a "Download all data as CSV (Over 10GB)" link at https://data.api.abs.gov.au/files/ABS_BA_SA2_2.0.0.csv. Dataflow annotated "NonProductionDataflow: true" - ABS flags it as non-production, so confirm stability | Verified |
| Building approvals LGA / GCCSA | BA_LGA2025 (1.0.0), BA_LGA2026 (1.0.0), BA_GCCSA (1.0.0) | LGA, GCCSA | listed | Verified listing |
| SEIFA 2021 (API) | ABS_SEIFA2021_SA2 (1.0.0), ABS_SEIFA2021_SAL (1.0.0), ABS_SEIFA2021_POA, _SA1, _LGA | SA2 / suburb (SAL) / postcode | listed | Verified listing |
| Census 2021 SA2/SAL tables (income, occupation, commute, labour force, dwelling structure) | C21_G17_SA2/SAL (income), C21_G60_SA2/SAL (occupation), C21_G62_SA2/SAL (travel to work), C21_G43_SA2 (labour force/education/migration), C21_G41_SA2 (dwelling by bedrooms), C21_G44_SA2 (usual residence 1 yr ago) - all 1.0.0 | SA2, SAL, POA | listed | Verified listing |
| Labour force (not suburb level) | LF (1.0.0), LF_AGES | national/state | listed | Verified listing |
| Population projections (ABS) | POP_PROJ_REGION (1.0.0) "Projections by Region 2022-2071" | state/GCCSA only | listed | Verified listing; not SA2 |
| Jobs in Australia | NOT in the API (no dataflow with "jobs" in name among the 1,228 listed) | - | - | Verified negative |

### 3b. Downloadable ABS files and other population/jobs datasets

| Dataset | Publisher | Granularity / years | Format | Direct URL | curl | Licence | Scriptable | Label |
|---|---|---|---|---|---|---|---|---|
| SEIFA 2021, SA2 indexes | ABS | SA2; released 27 Apr 2023 (page); next SEIFA follows 2026 Census (no date found) | XLSX | https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Statistical%20Area%20Level%202%2C%20Indexes%2C%20SEIFA%202021.xlsx | 206, 1,316,059 bytes | CC BY 4.0 (site-wide) | Yes | Verified |
| SEIFA 2021, Suburbs and Localities | ABS | SAL (suburb) | XLSX 6.77 MB | https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Suburbs%20and%20Localities%2C%20Indexes%2C%20SEIFA%202021.xlsx | not tested (page-stated size) | CC BY 4.0 | Yes | Verified (page) |
| Jobs in Australia 2022-23 (employee jobs by SA2 in a map; tables 2 and 3 by geography) | ABS | Page says nearly 2,500 regions including SA2; the SA2 figures are in an interactive map backed by a web service, not clearly in the xlsx tables. Released 14 Nov 2025; **next release 27 Nov 2026** | XLSX; all datacubes ZIP 27.16 MB | https://www.abs.gov.au/statistics/labour/jobs/jobs-australia/2022-23/All%20datacubes.zip | 200 (ZIP) | CC BY 4.0 (site-wide) | Yes | Verified. Whether the zip has SA2 rows is Unverified. TableBuilder (Jobs and Income of Employed Persons, LEED) needs ABS registration (Secondary) |
| NSW population projections 2024 (replaces 2022 as Common Planning Assumptions) | NSW Dept of Planning | NSW, LGA, SA2; page updated 21 Oct 2024 | Excel via "Explore the data" page | https://www.planning.nsw.gov.au/data-and-resources/population-projections/explore-the-data | not tested | Page does not state; data.nsw.gov.au lists 2022 series as CC BY | Probably manual | Page Verified; file URL not found |
| NSW TZP24 population by travel zone/SA2 (Transport) | TfNSW | Travel zone, regional SA2 file, 2021-2066 | CSV | https://opendata.transport.nsw.gov.au/data/dataset/e35da583-c645-4e15-a7ca-ea6678ae2699/resource/f6f8b711-2321-4533-98a8-f579d6f91265/download/tzp24-spd-by-tz-2021-2066-regional-sa2.csv | not tested | CC BY | Yes | Verified listing (CKAN) |
| Victoria in Future 2023 (VIF2023) | Vic DTP | SA2 (to 2036 per search summary), LGA, regions to 2051; data.vic.gov.au modified 2025-04-29 | XLSX | e.g. https://www.planning.vic.gov.au/__data/assets/excel_doc/0038/680879/VIF2023_Victoria_Demographic_Projections_to_2051.xlsx (state-level file) | **403 Forbidden** to curl and WebFetch | CC BY 4.0 (CKAN) | Blocked by bot protection; manual browser download | Licence Verified; SA2 file URL not found; BLOCKED |
| Queensland Government population projections (2023 edn; a 2025 edn SA2 report exists) | QGSO | SA2, SA3, SA4, LGA | Excel tables on QGSO page, not CKAN | https://www.qgso.qld.gov.au/statistics/theme/population/population-projections/regions | page fetched, no links in extracted text | CC BY 4.0 (CKAN dataset modified 2024-12-06) | Probably manual | Partly Verified |
| WA Tomorrow Report 12 SA2 forecasts (DPLH-111), Report 11 (DPLH-086) | WA DPLH via SLIP | SA2, shapefile/GeoJSON/GPKG | spatial | https://data-downloads.slip.wa.gov.au/DPLH-111/GeoJSON | 302 to **login** (sso.slip.wa.gov.au) | Catalogue says "Custom (Active Acceptance)" | Needs free SLIP account; then scriptable? Unverified | Verified |
| SA population projections for SA2 (2016-41) | SA Dept Planning | SA2 | XLSX | https://data.sa.gov.au/data/dataset/b667a56a-8959-41bc-a7cc-68e5bc858841/resource/6891e275-ab66-4cf8-842a-647156fad445/download/population-projections-for-south-australian-statistical-areas-level-2_-2.._.xlsx | 200, 1,870,590 bytes, last-modified 2 Jan 2020 (old) | CC BY | Yes | Verified (old; look for newer) |
| TAS population projections (TasPOPP 2024, LGA level) | TAS Treasury | LGA to 2053; no SA2 file found | PDF/XLS | https://www.treasury.tas.gov.au/economy/population-projections | not tested | Unknown | - | Secondary |
| ACT population projections 2025 (to 2065) | ACT Treasury | territory, district, SA2 (suburb) | PDF + XLS | https://www.treasury.act.gov.au/snapshot/demography/act | not tested | Unknown | - | Secondary |
| NT population projections 2024 release | NT Treasury | SA2 projections exist per search summary | Word doc + datasets page | https://treasury.nt.gov.au/dtf/economic-group/population-projections | not tested | Unknown | - | Secondary |

---

## 4. Other markers

### 4a. Schools

| Dataset | Publisher | Granularity / years | Format | Direct URL | curl | Licence / commercial | Scriptable | Label |
|---|---|---|---|---|---|---|---|---|
| School Profile 2025 (includes ICSEA, enrolments, LBOTE) | ACARA Data Access Program | School; 2025 | XLSX 2 MB | https://dataandreporting.blob.core.windows.net/anrdataportal/Data-Access-Program/School%20Profile%202025.xlsx | 206, 2,059,522 bytes, last-modified 20 Feb 2026 | "Under the My School terms of use" (https://www.myschool.edu.au/terms-of-use). ACARA page does not state commercial limits. A search summary says My School terms restrict creating lists of comparative school performance for a commercial purpose, and use of derivative works outside the terms needs prior written consent from ACARA. **Treat commercial reuse as NOT allowed without ACARA written permission** | Yes (direct blob URL) | URL and page Verified; terms text Secondary (terms page not fetched) |
| School Profile 2008-2025 | ACARA | School, time series | XLSX 28 MB | https://dataandreporting.blob.core.windows.net/anrdataportal/Data-Access-Program/School%20Profile%202008-2025.xlsx | not tested | same | Yes | Verified (page) |
| School-level NAPLAN | ACARA | School | by application form (https://acara2.my.salesforce-sites.com/datarequest), legal signatory, security requirements, "research" purpose; 2026 NAPLAN school results due Dec 2026 | - | - | Application only | Manual | Verified (page) |
| Victoria School Locations 2023 | Vic Dept of Education | School points | CKAN | discover.data.vic.gov.au/dataset/school-locations-2023 (modified 2026-11-11) | not tested | CC BY 4.0 | Yes | Verified listing |

Implication: ICSEA is a socio-educational advantage index, not school quality. Using the ACARA file in a paid report carries licence risk; school location data from state portals (CC BY) are the safe substitute for "access to schools".

### 4b. Crime

| State | Dataset | Granularity | Format | Direct URL | curl | Licence | Label |
|---|---|---|---|---|---|---|---|
| NSW | BOCSAR quarterly recorded crime dataset by **Suburb** (also postcode, LGA) | Suburb, 62 offence categories | ZIP | https://bocsarblob.blob.core.windows.net/bocsar-open-data/SuburbData.zip | 206, 12,661,404 bytes, last-modified 15 Sep 2026 | CC BY (CKAN data.nsw.gov.au) | Verified |
| SA | SA Police crime statistics by **suburb**, annual CSVs 2010-11 to 2025-26 | Suburb | CSV | https://data.sa.gov.au/data/dataset/860126f7-eeb5-4fbc-be44-069aa0467d11/resource/cfce21c4-9712-454f-b32d-0f7c989accda/download/data_sa_crime_q1_q2_q3_q4_2025-26.csv | 200, last-modified 13 Aug 2026 | CC BY | Verified |
| VIC | Crime Statistics Agency data tables (recorded offences by LGA; "Recorded offences Visualisation" workbook with 6 tables) | LGA confirmed; suburb/postcode in the 2.97 MB workbook NOT confirmed (sheet text unreadable with my method) | XLSX | https://files.crimestatistics.vic.gov.au/2026-09/Data_Tables_Recorded_Offences_Visualisation_Year_Ending_June_2026.xlsx and ...Data_Tables_LGA_Recorded_Offences_Year_Ending_June_2026.xlsx | 200, 2,969,568 bytes | CC BY 4.0 (CKAN) | Verified file; suburb level Unverified |
| QLD | Offence counts and rates monthly by LGA, police division/district/region, from 1997/2001 | LGA, police division | CSV | https://open-crime-data.s3-ap-southeast-2.amazonaws.com/Crime%20Statistics/LGA_Reported_Offences_Number.csv | 206, 5,765,308 bytes, last-modified 9 Nov 2026 | CC BY 4.0 | Verified. No suburb dataset found |
| ACT | ACT Crime Statistics (dataset 2egm-dieb) | Unclear (suburb? Unverified) | XLSX | https://www.data.act.gov.au/download/2egm-dieb/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | 403 to curl | Unknown | listing Secondary |
| WA | WA Police "crime time series" xlsx (15 MB) | Police district, not suburb | XLSX | https://www.wa.gov.au/organisation/western-australia-police-force/crime-statistics | not tested | Unknown | Secondary |
| TAS, NT | Not searched | - | - | - | - | - | Unverified |

### 4c. Hazards (flood, bushfire) and distance/access

| Dataset | Publisher | Coverage | Format | URL | Notes | Label |
|---|---|---|---|---|---|---|
| Designated Bushfire Prone Area | Vic (Data Share), CC BY 4.0 | VIC | SHP (via Data Share search page) | https://datashare.maps.vic.gov.au/search?md=93136d30-5c02-597f-bdec-c26928766b41 | Needs Data Share portal use (likely manual or its own API) | Verified listing |
| Low Bushfire Rating Areas | CFA | VIC | SHP zip | https://applications.cfa.vic.gov.au/mycfa/location/LBRA_FHR_Vic_Shape.zip | not curl-tested | Verified listing |
| NSW Bush Fire Prone Land | NSW Spatial Services, CC BY | NSW | ZIP | https://portal.spatial.nsw.gov.au/client/services?id=84c338fe2e8c49a9836751ed49c9c581 | portal link, not direct file | Verified listing |
| Bushfire Prone Areas OBRM-026 | WA OBRM via SLIP, CC BY 4.0 | WA | GeoJSON/SHP/GPKG | https://data-downloads.slip.wa.gov.au/OBRM-026/GeoJSON | Needs SLIP login (same as above) | Verified listing |
| Bushfire Protection Areas | SA DPTI, CC BY | SA | SHP/GeoJSON/KML zips | https://www.dptiapps.com.au/dataportal/BushfireProtectionAreas_geojson.zip | not curl-tested | Verified listing |
| Bushfire hazard area / prone area series | Qld, CC BY 4.0, modified 2024-08-15 | QLD | spatial (qldspatial) | data.qld.gov.au "Bushfire prone area - Queensland series" | file link not captured | Verified listing |
| Victorian Flood History Oct 2022 event | Vic, CC BY 4.0 | VIC (event) | SHP via Data Share | https://datashare.maps.vic.gov.au/search?md=452de6fa-b55b-478f-94be-09c99f7e9989 | event extent, not hazard map | Verified listing |
| NSW Flood Data Portal | NSW SES/OEH, CC BY 3.0 (search summary) | NSW by study | zips on data.gov.au | https://data.gov.au/data/dataset/nsw-flood-data-portal | patchwork by study | Secondary |
| Australian Flood Risk Information Portal (AFRIP) | Geoscience Australia | National catalogue of studies up to 2018, no longer expanded | catalogue | https://www.ga.gov.au/scientific-topics/community-safety/projects/afrip | no national hazard raster found | Secondary |
| National Residential Flood Risk Assessment | Geoscience Australia | preliminary, 221,000 homes | report/data | https://data.gov.au/data/dataset/f3b25537-ea7d-4a28-aeca-b00250605c04 | not full coverage | Secondary |
| Historical bushfire boundaries v1.0 | Geoscience Australia | national, CC BY-ND 4.0 (ND = no derivatives; check), 428 MB zip | zip/WFS | researchdata.edu.au/historical-bushfire-boundaries-version-10/3405276 | too big; licence has ND | Secondary |
| TAS, ACT, NT hazard layers; coast distance; CBD distance | - | - | - | not searched | Derive CBD/coast distances from ABS ASGS boundaries and a coastline layer (Unverified). | Unverified |

### 4d. Housing supply pipeline (DA data)

| State | Dataset | Notes | Label |
|---|---|---|---|
| National | ABS BA_SA2 (see 3a) | The only uniform source: approvals by SA2, monthly, with building type (house / apartments). Use this as the supply marker. | Verified |
| NSW | Online DA Data API (NSW Planning Portal) | All DAs lodged on the Portal since Jan 2019; councils mandated from 1 Jul 2021; CC BY; requires API subscription key; API changes with backward-compat window from 1 Jul 2026 | Secondary |
| SA | Development Application Public Register (data.sa.gov.au) | Only DAs decided by the Commission/Minister/Governor since 2010; plan.sa.gov.au register for the rest | Secondary |
| ACT | Completed development applications (data.gov.au) | Listed | Secondary |
| VIC, QLD, WA, TAS, NT | Not found in my searches | Unverified |

---

## 5. Per-state coverage matrix

Y = confirmed downloadable this run; P = partial / needs registration / old; N = not found; ? = not checked.

| Marker | NSW | VIC | QLD | SA | WA | TAS | ACT | NT |
|---|---|---|---|---|---|---|---|---|
| Infra project list with location | P (BP2 2017-18 geojson; pipeline web) | Y (VIP xlsx, content not opened) | P (QTRIP roads CSV) | P (old MDD; PDF fund projects) | N | ? | ? | ? |
| GTFS static | P (needs key) | Y | Y | Y | Y | Blocked | P (needs reg) | Y (Darwin) |
| ERP SA2 (ABS API) | Y | Y | Y | Y | Y | Y | Y | Y |
| BA SA2 (ABS API) | Y | Y | Y | Y | Y | Y | Y | Y |
| SEIFA SA2/SAL | Y | Y | Y | Y | Y | Y | Y | Y |
| State pop projection at SA2 | P (2024 page, file URL not found) | Blocked (403) | P (page, no links) | P (2016-41 old) | P (SLIP login) | N (LGA only) | P (Secondary) | P (Secondary) |
| Employee jobs by SA2 | ABS Jobs in Australia, national, P | same | same | same | same | same | same | same |
| School profile ICSEA | Y (national file; licence risk) | Y | Y | Y | Y | Y | Y | Y |
| Crime by suburb | Y | Unconfirmed (LGA Y) | N (LGA/police division) | Y | N (police district) | ? | P (blocked) | ? |
| Bushfire layer | Y (listing) | Y (listing) | Y (listing) | Y (listing) | Y (login) | ? | ? | ? |
| Flood layer | P (by study) | P (event) | ? | ? | ? | ? | ? | ? |
| DA pipeline | P (API key) | N | N | P | N | ? | P | ? |

---

## 6. Evidence that infrastructure or events moved nearby prices

Cited exactly; label shows how I checked.

| Evidence | Publisher / date | Finding (size and timing) | Quality | Label |
|---|---|---|---|---|
| Yen, Mulley, Shearer, Burke, "Announcement, construction or delivery: When does value uplift occur for residential properties? Evidence from the Gold Coast Light Rail system in Australia", *Land Use Policy* vol 73, pp 412-422, 2018 (DOI 10.1016/j.landusepol.2018.02.007) | Elsevier via EconPapers page fetched | Difference-in-differences vs control areas. Prices rise after announcement, biggest increase after firm government financial commitment, slower during construction and operation. Abstract gives no magnitudes. A search summary quoting the paper/Griffith gives: +11.9% vs control 1996-2002 (feasibility announced), +26.3% 2002-2006, +2.3% 2006-2011 (construction), >30% in total within 800 m 1996-2016 | Peer reviewed | Direction and timing Verified; the percentages are Secondary (Griffith News teaser dated 30 May 2017 fetched but cut off) |
| Lee (UNSW), Liang and Koo (Deakin), "Rail works lift property prices", The Conversation, 15 Oct 2019 | The Conversation page fetched | Level crossing removals, Melbourne. Average house value +9% in surrounding area; 8.81% Bayswater, 28.6% Glen Iris, 10.5% St Albans, 2.1% Mitcham; units 2.35%, 7.3%, 6.53%; effect vanishes beyond 1,400 m. Study unpublished at the time (conference paper); method not described | Academic authors, press article | Verified (the article) |
| Zhang and Shukla, Mernda rail extension, Melbourne, *Property Management* 2023 (Emerald DOI 10.1108/PM-02-2022-0013 in search results) | search summary | Homes within 800 m of the proposed station were ~8.7% higher than those 800-1,600 m away; gains not fully emerged during construction | Peer reviewed | Secondary |
| Melser, "Estimating the housing capitalization effects of new infrastructure: should we be using rents instead of prices?", *Transportation Research Part A* 138, 402-421, 2020 (DOI 10.1016/j.tra.2020.04.016) | EconPapers page fetched | Studies a new Sydney train line; argues prices are contaminated by anticipation and recommends rents. No effect sizes in abstract | Peer reviewed | Verified (existence, method); magnitudes Unverified |
| Domain analysis of Sydney Metro Northwest, Oct 2025 | search summary; page returned 403 | Houses within 400 m of a station ~16.6% above similar homes 2-3 km away, units ~24.4%; 400-800 m houses ~9.3%; >800 m ~2%. House premiums peaked 1-2 years before the 2019 opening; unit premiums visible before formal announcement; Macquarie Park little uplift | Industry, method not seen | Secondary |
| Chen, Yazdani, Mojtahedi, Newton (UNSW), hedonic study of Sydney Metro | search summary | Rail transit impacts generally negative at announcement stage, positive at construction stage; pre-completion | Peer reviewed (journal not captured) | Secondary |
| Somerville and Wetzel, UBC Sauder, press release 25 Jan 2010 (EurekAlert) | EurekAlert page fetched | Host cities incl. Sydney: no post-Olympics boom or bust; prices "the same as they would be in the absence of the Games"; pre-Games construction employment up (Sydney 1.7%) | Academic, press release | Verified |
| Study of Sydney 2000 on NSW transaction prices 1980-2007 (difference-in-differences) | search summary only; record page failed to load | Host-suburb markets grew substantially faster during bidding and pre-Olympic periods, not post-Olympics; non-host suburbs in the city grew faster pre and post | Peer reviewed (authors/journal not captured) | Secondary |
| PyeongChang 2018, *Applied Economics* 2023 (vol 55 issue 8, pp 823-838) | search summary | Apartment prices in three host districts 6.6% above non-host after Games, extra gain near KTX station/arena | Peer reviewed | Secondary |
| Tim Lawless (CoreLogic research director), reported by MacroBusiness, 22 Jul 2021 | MacroBusiness page fetched | Olympics "should work as a positive influence"; effects gradual, tied to infrastructure, jobs, transport; biggest impact likely in the years before the Games. No numbers in the excerpt | Industry commentary | Verified |
| Same, via search summaries (not fetched) | various | Lawless said Brisbane house prices averaged 3% a year for 10 years and that could double in the lead-up. Cotality: Brisbane dwelling values +14.5% in 2025 (more than double Sydney). No Cotality study isolating an Olympics effect found; boom coincides with interstate migration and national trends | Secondary | Secondary |
| JLL, "Property values" appendix, Western Sydney Airport EIS (2016) | search summary | Mostly aircraft noise; found no statistically significant noise-price link in Sydney/Melbourne; no ex-post hedonic study of the 2014 airport announcement found | Consultant | Secondary |
| Perth METRONET | search summary | No peer-reviewed uplift study found; a 2016-era agency claim of ~4.5% within 400 m and ~1.3% at 400-800 m, original unconfirmed | Weak | Secondary / Unverified |
| Grattan Institute, "What price value capture?" (2017) | search result title | About value capture policy; no station-specific percentage seen | Think tank | Secondary (not read) |
| RBA | - | No RBA paper on infrastructure announcements found in two searches | - | Verified negative (limited) |

Read-across for rating design: the best evidence says (a) uplift is local (within ~800 m for rail; up to ~1.4 km in the Melbourne crossing study), (b) a large part is priced in at announcement and especially at funding commitment, before construction, so a "project announced" marker may already be in prices by the time you score, (c) effects vary widely by suburb, (d) for mega-events the evidence is mixed to null for city-wide price level (Somerville/Wetzel), with host-suburb effects before the Games in the Sydney study. Treat "Olympics venue proximity" as a weak, short-horizon marker.

---

## 7. Blocked or failed fetches

- Infrastructure Australia 2026 IPL page and interactive map page: WebFetch timed out (60 s); used curl instead (pages 200; only a PDF link, no data file).
- Victoria planning.vic.gov.au (VIF2023 page and xlsx): 403 Forbidden to WebFetch and curl.
- Transport Tasmania GTFS page: 403 to WebFetch and curl.
- Transport Canberra static GTFS: 401 without credentials.
- TfNSW Open Data GTFS resource: login required; TfNSW API 401.
- WA SLIP downloads (data-downloads.slip.wa.gov.au): redirect to SSO login.
- gtfs.adelaidemetro.com.au/Resources (a URL from a search snippet): 403; working path found separately.
- ACT crime xlsx download: 403 to curl.
- Domain Metro Northwest analysis (insight.domain.com.au): 403.
- vufind-test.katalog.k.utb.cz (Sydney Olympics paper record): DNS failure.
- data.act.gov.au CKAN-style API: 404 (it uses Socrata; catalog API works).
- `api.data.abs.gov.au` host: did not resolve; `data.api.abs.gov.au/rest` works.
- Victorian CSA "Recorded offences" workbook: downloaded (2.97 MB) but could not read sheet text; suburb-level content unconfirmed.

## 8. What needs a manual download or action by the user

1. Victoria in Future 2023 SA2 projections Excel from planning.vic.gov.au (403 to scripts) - open in browser; also confirm file has SA2 level.
2. NSW 2024 population projections SA2 file: https://www.planning.nsw.gov.au/data-and-resources/population-projections/explore-the-data (browser; file URLs not exposed to my fetch).
3. QLD projections 2025 edition SA2 tables from QGSO "Regions" page; ACT 2025, NT 2024, TAS (check for SA2) from their Treasury pages.
4. WA SLIP (WA Tomorrow SA2 forecasts DPLH-111, bushfire prone areas OBRM-026): create a free SLIP account.
5. NSW Open Data Hub: register and obtain an API key (GTFS, and Planning Portal DA API key is separate). ACT: request MyWay+ GTFS access (registration).
6. Tasmania GTFS: open https://www.transport.tas.gov.au/public_transport/gtfs-data in a browser and note the licence and file link.
7. Infrastructure Australia: ask IA for the priority list as a spreadsheet and its licence; otherwise extract from the PDF. Open the Victorian pipeline xlsx and check for coordinates, status and completion dates.
8. ACARA: get written permission or a data licence for any commercial use of ICSEA, and apply through the ACARA form for school-level NAPLAN if needed.
9. Check the CC BY/ND terms of any Geoscience Australia layer before use (bushfire boundaries are CC BY-ND 4.0 per search summary).
10. Confirm PTA (WA) licence position on commercial use in writing; it is revocable and silent on commercial use.
11. Check whether the Victorian CSA Recorded offences workbook has suburb/postcode sheets; open in Excel.
12. Re-run the Jobs in Australia check after 27 Nov 2026 (next release); check whether SA2 employee-job counts are in the data cubes zip.
13. Flood hazard layers for QLD, SA, WA, TAS, ACT, NT, and crime for TAS/NT, and DA data for VIC/QLD/WA were not found - need targeted searches.

## 9. Search/fetch budget used

About 27 web searches and 24 WebFetch calls, plus many curl and CKAN API calls (curl HEAD/range tests and CKAN package_search queries count as fetches I made through the shell).

# C5b Free official data outside Victoria - 2026-11-13

Budget used: 14 searches, 8 fetches (1 blocked 403). Status tags: V = Verified (primary page fetched), S = Secondary (search-result summary only), U = Unverified/not found.

## State table

| State | Sale prices (suburb, house/unit) | Rents (suburb) | Planning zones/overlays | Licence | Scripted access |
|---|---|---|---|---|---|
| NSW | Valuer General bulk property sales: raw transactions, .DAT files, not medians (S). Planning Portal Rent & Sales dataset: medians by LGA only, trimmed 5%/5%, not suburb (S). Suburb house/unit medians must be self-computed from the bulk files. Catalogue metadata dated Oct 2023 (S). | Fair Trading rental bond lodgement by postcode: dwelling type, bedrooms, weekly rent (V). Page says update annually (monthly lodgement, annual prior-year file), page last updated 06/10/2022 (V); an earlier search summary said monthly (S, conflict). Rent & Sales Report by LGA, quarterly (S). | "EPI Land Zoning" on Planning Portal open data: ArcGIS REST, WFS, WMS, JSON, XLSX (V for formats and CC BY; endpoint URLs not shown on page). Service lists show 2,000-record query cap, GDA2020 (S). Update frequency not stated (V). | CC BY (V for rental bond and zoning pages) | Yes: CKAN package_show API on data.nsw.gov.au (V); ArcGIS REST/WFS for zoning (V). |
| QLD | No state suburb median sale price series found (U). Not searched beyond this. | RTA median rents quarterly: xlsx workbook ~6 MB; postcode, suburb, LGA, state; houses, townhouses, flats/units; bonds lodged and held; Q1 published Apr, Q2 Jul, Q3 Oct, Q4 Jan (V). No bedroom split stated (V). | No statewide zoning layer confirmed (S/U). Data via QSpatial and Open Data Portal; most spatial data "CC-By" with licence in each dataset's metadata (S). Zoning sits in council planning schemes, e.g. Brisbane City Plan zoning listed "Not Specified" on data.gov.au; some councils CC BY 4.0 (S). | RTA median rents: no licence stated on page, State of Queensland copyright footer (V) - reuse terms unconfirmed. Spatial: CC BY typical (S). | Rents: direct xlsx URL https://www.rta.qld.gov.au/sites/default/files/2023-04/rta-bond-statistics.xlsx (V, filename dated 2023-04; may be overwritten in place). Spatial: QSpatial download (gdb/shp/tab/kmz), clip by area (S). |
| WA | Landgate free property statistics: annual median house price movements only (S); suburb sales reports are paid (from $42.70, S). No free suburb house/unit medians found (S). | No Consumer Protection bond statistics found (U). | DPLH Local Planning Scheme Zones and Reserves (DPLH-071): weekly updates; public WMS and ArcGIS Map Service on SLIP (open access); download formats (GPKG, GeoJSON, FGDB, SHP) and Feature/WFS services marked Government Use Only (V). | Custom "Active Acceptance" DPLH licence (V); SLIP metadata says "Creative Commons Non-Commercial" (S, conflict). Treat as NOT clearly commercial-use. | Public map service queryable by script; bulk download and WFS restricted (V). Licence terms must be read before commercial use. |
| SA | Valuer-General: quarterly median HOUSE prices only, metro Adelaide plus 8 regional towns; no unit medians on the page; last updated 16 Oct 2026, Q3 2026 (V). DATA SA "Metro median house sales" by suburb with sales counts: XLSX/CSV, Q3 2026 file present (V); house only apparent (V, columns not seen). | No SA bond/rent by suburb dataset found (U). | Planning and Design Code zones, subzones, overlays, variations on Data.SA, updated fortnightly, shapefile downloads; also SAPPA viewer (S). | VG site CC BY 3.0 AU (V). DATA SA median house sales CC BY 4.0 (V). P&D Code: "CC BY" with version unclear, data.gov.au mirror shows CC BY 3.0 AU (S). | Yes: CKAN API (package_show) on data.sa.gov.au (V); datastore status patchy per file (V). |
| ACT | No official suburb median sale price dataset found; aggregators say "state revenue offices" (S/U). | Not found (U). | Territory Plan Land Use Zone and Overlay Zone polygons via ACTmapi ArcGIS REST (data4.actmapi.act.gov.au); data.gov.au record "Licence Not Specified", updated 23/01/2026; a sibling Precinct Codes dataset is CC BY 4.0; ACTmapi says reference only, legal text is on Legislation Register (S). | Zoning licence unconfirmed (S); sibling dataset CC BY 4.0 (S). | ArcGIS REST service exists (S). |
| TAS | No Valuer-General suburb median series found; REIT quarterly reports are an industry body, not official (S/U). | Not found (U). | Tasmanian Planning Scheme zoning and interim scheme zoning on LIST (data.gov.au mirror); electronic planning map in LISTmap is the authorised version (S). | data.gov.au records "not specified"; LIST generally CC BY but check per dataset (S/U). | LIST web services/downloads likely, not verified (U). |

## National

| Item | Detail | Licence | Scripted access |
|---|---|---|---|
| ABS (Census, SDMX Data API, Census DataPacks) | Suburb-level Census (SAL, SA2), ERP, building approvals etc. | CC BY 4.0 for website material; exclusions: microdata, third-party content, logos/branding. Page does not mention the Data API; commercial reuse not discussed (V, abs.gov.au copyright page). A third-party site claims the API is CC BY 4.0 (U). | API base https://data.api.abs.gov.au/rest/data/{flowRef}/{dataKey}, JSON/CSV/XML (S, from ABS user guide listing). DataPacks CSV download (S). |
| Geoscape G-NAF | Quarterly releases; latest listed Feb 2026 in one result (S, may be stale vs today 2026-11-13). Open G-NAF fact sheet. | End User Licence Agreement based on CC BY 4.0, with a restriction: not for sending mail, and not to generate an address or compile information (S). data.gov.au metadata variously "Not Specified" / "Other (Open)" (S). | Bulk download from data.gov.au (S). Direct fetch of the data.gov.au page returned 403 (blocked); exact EULA text not read. |

## Key observations
1. No state outside Victoria was found publishing free suburb-level median sale prices with a house/unit split. NSW gives raw sales (self-compute), SA gives house-only suburb medians, WA suburb sales are paid, QLD/ACT/TAS not found.
2. Rents are the strongest free layer: NSW (postcode, type, bedrooms, CC BY) and QLD (suburb, house/townhouse/unit, quarterly xlsx, licence unstated). SA, WA, ACT, TAS rental not found within budget.
3. Planning: NSW (CC BY, ArcGIS REST/WFS) and SA (CC BY, fortnightly, Data.SA) are the cleanest. WA is restricted/custom; ACT and TAS licences unspecified on data.gov.au.
4. Licence risk: WA DPLH licence and unspecified ACT/TAS/QLD-council licences need a check before commercial PDF use; G-NAF has a use restriction.

## Sources (accessed 2026-11-13)
- V https://data.nsw.gov.au/data/dataset/rental-bond-lodgement
- V https://valuergeneral.sa.gov.au/News-and-Publications/publisheddataandstatistics
- V https://data.sa.gov.au/data/dataset/metro-median-house-sales
- V https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data
- V https://catalogue.data.wa.gov.au/dataset/local-planning-scheme-zones-and-reserves-dop-025
- V https://www.planningportal.nsw.gov.au/opendata/dataset/?tags=LZN
- V https://www.abs.gov.au/website-privacy-copyright-and-disclaimer
- Blocked (403): https://www.data.gov.au/data/dataset/geocoded-national-address-file-g-naf
- S https://www.planningportal.nsw.gov.au/housing-rent-and-sales-dataset
- S https://catalogue.data.infrastructure.gov.au/dataset/rdh-bulk-property-sales-information-nsw/resource/7cb5fbed-5906-4bab-934a-8b01bacc8813
- S https://www.nsw.gov.au/housing-and-construction/rental-forms-surveys-and-data/rental-bond-data
- S https://www.parliament.nsw.gov.au/parliamentary-business/research-and-library/research-publications-data/housing-affordability-2025
- S https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_SEPP/MapServer
- S https://www.business.qld.gov.au/running-business/support-services/mapping-data-imagery/data/qspatial
- S https://data.gov.au/data/dataset/cp14-zoning-overlay
- S https://www.landgate.wa.gov.au/property-reports ; https://www.wa.gov.au/service/natural-resources/land-valuation/property-statistics
- S https://plan.sa.gov.au/our_planning_system/plan_sa/south_australian_property_and_planning_atlas/how_to_use/downloading_data
- S https://data.gov.au/data/dataset/actgov-tp-land-use-zone ; https://data4.actmapi.act.gov.au/arcgis/rest/services/ACT_PLANNING/tp_labels/MapServer
- S https://data.gov.au/data/dataset/tasmanian-planning-scheme-zoning
- S https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide/using-api
- S https://www.data.gov.au/data/dataset/geocoded-national-address-file-g-naf (via search listing) ; https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/resource/9a8f6baa-f790-49a0-84b1-3cb39a6a1b88/download/fact-sheet-open-g-naf-use-restriction.pdf

## Unverified / gaps
- NSW Valuer General licence for bulk sales (catalogue says CC BY, dated 2023; not fetched).
- Whether QLD RTA median rents may be reused commercially (no licence stated).
- ACT and TAS rent and sale price datasets; WA and SA rental data; QLD sale price medians (not found; may exist).
- ACT and TAS zoning licences; QLD statewide zoning.
- G-NAF EULA wording and current release date; ABS Data API licence (page silent).
- Third-party aggregator claims (yourpropertyguide, yourinvestmentpropertymag, microburbs) ignored.

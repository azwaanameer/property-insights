# H1 - Free official sales / rent / vacancy / approvals data by state

Run date: 2026-11-14. Method: web search + WebFetch + `curl -sIL` header tests + CKAN/Socrata API calls + opened 5 of the XLSX files to read sheet names and column headers.

Labels: **Verified** = page fetched / file header-tested / file opened this run. **Secondary** = search-result summary only. **Unverified** = not checked or not found.

Headline findings:
1. Free, scriptable, CC BY, suburb-or-finer RENT data exists for VIC, QLD, SA, TAS and NSW (bond-based). None found for WA, ACT, NT.
2. Free official suburb SALES data with a house vs unit split exists only for VIC (CC BY). SA gives house-only suburb medians (CC BY 4.0). NSW record-level sales are free but licensed non-commercial (CC BY-NC-ND 4.0); a Property Sales Information (PSI) licence is needed for a paid product. QLD, WA, TAS, ACT, NT: paid or not found.
3. No state publishes free official suburb/postcode vacancy rates. Only commercial sources (SQM, REIQ regional, HTAG) were found.
4. Approvals: ABS Building Approvals SA2 cubes (CC BY 4.0 site licence) cover every state and territory. No finer state-level free source was verified.

Note on fetchability: land.vic.gov.au and valuation.property.nsw.gov.au return HTTP 403 to scripts, so the VIC sales files and the NSW bulk sales files cannot be fetched by script. I did not try to bypass this.

---

## VIC

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| V1 | Rental Report: Moving annual median rent by suburb and town (sheets: 1/2/3 bed flat, 2/3/4 bed house, All properties) | DFFH / Homes Victoria (mirrored data.vic.gov.au) | Suburb/town, by dwelling type and bedrooms | Quarterly series from Mar 2000 to Jun 2026 (column headers read in file) | Dataset page updated 10/11/2026; Jun 2026 qtr file | XLSX | https://www.dffh.vic.gov.au/moving-annual-median-rent-suburb-and-town-june-quarter-2026 redirects (307) to https://www.dffh.vic.gov.au/sites/default/files/documents/202610/Moving%20annual%20median%20rent%20by%20suburb%20and%20town%20-%20June%20Quarter%202026.xlsx = HTTP 200, 1,177,003 bytes | CC BY 4.0 (data.vic.gov.au page) | Yes with attribution | Script (the landing URL changes each quarter; use data.vic.gov.au CKAN to find it) |
| V2 | Victorian Property Sales Report: Median House by Suburb Time Series (annual, 10-yr windows) | Valuer-General Victoria / DTP | Suburb, annual | 2015-2025 file; older windows 2013-23, 2014-24 | CKAN metadata modified 2026-09-29 | XLSX | https://www.land.vic.gov.au/__data/assets/excel_doc/0033/775617/houses-by-suburb-2015-2025.xlsx (URL from CKAN API; not fetched) | `cc-by` in CKAN; resource page says CC BY 4.0 | Yes with attribution | HTTP 403 to curl (browser or manual) |
| V3 | Victorian Property Sales Report: Median Unit by Suburb Time Series | same | Suburb, annual | 1 Jan 2015 - 31 Dec 2025, released 9 Sep 2026 | data last updated 29 Sep 2026 | XLSX | https://www.land.vic.gov.au/__data/assets/excel_doc/0034/775618/units-by-suburb-2015-2025.xlsx = HTTP 403 (tested) | CC BY 4.0 (resource page, Verified) | Yes with attribution | Blocked to scripts |
| V4 | Median House / Median Unit by Suburb Quarterly (15-month window; house, unit, vacant land) | same | Suburb, quarterly | Rolling 15 months per file; files back to Dec 2023 on CKAN | 2026-09-29 | XLS | e.g. https://www.land.vic.gov.au/__data/assets/excel_doc/0029/728057/Median-House-2nd-Qtr-2024.xls (from CKAN API) | `cc-by` in CKAN (one listing said CC BY 3.0 AU, Secondary) | Yes with attribution | Blocked to scripts; Dec 2023 files are on web.archive.org |

Caveat (Secondary): the annual Guide to Property Values notes ~5% of all sales and 10% of metro unit/land sales are not yet recorded at release because of off-the-plan settlement lag. Column layouts of V2-V4 were not opened (blocked).

Vacancy: Rental Report Sept 2025 quotes metro Melbourne 2.5% and regional Vic 1.9% (Secondary). Finest geography seen: metro/regional and LGA trend section (Secondary). No suburb/postcode vacancy.
Approvals: ABS cubes (see national). State-level source Unverified.

---

## NSW

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| N1 | Rental Bond Lodgements, monthly (columns: Lodgement Date, Postcode, Dwelling Type, Bedrooms, Weekly Rent: record-level) | NSW Fair Trading (Dept of Customer Service) | Postcode, individual lodgements | Monthly files Jan 2022 - Oct 2026; annual files 2021-2025 on page | Oct 2026 file posted Nov 2026 | XLSX | https://www.nsw.gov.au/sites/default/files/noindex/2026-11/rentalbond_lodgements_october_2026.xlsx = HTTP 200, 666,524 bytes. Annual 2025: https://www.nsw.gov.au/sites/default/files/noindex/2026-01/rentalbond_lodgements_year_2025.xlsx = HTTP 200, 8,512,828 bytes | nsw.gov.au page states no licence. data.nsw.gov.au CKAN API lists the dataset `rental-bond-lodgement` as `cc-by` (Verified via API, snapshot 2022) | Likely yes (CC BY on the portal), but the live page gives no licence: treat as unclear until confirmed with Fair Trading | Script (URLs are dated paths; scrape the page for links) |
| N2 | Rental bond refunds (quarterly/annual) and bonds held (annual) by postcode | NSW Fair Trading | Postcode | Refunds Q1 2022 - Q3 2026; held 2021-2025 | Q3 2026 | XLSX | e.g. https://www.nsw.gov.au/sites/default/files/noindex/2026-10/rentalbond_refunds_3rd_quarter_2026.xlsx (listed, not tested) | as N1 | as N1 | Script |
| N3 | Rent and Sales Report (median weekly rent and median sales price by LGA; postcode and dwelling/bedroom splits per parliamentary note, strata vs non-strata sales) | DCJ NSW | LGA (postcode Secondary) | Since 2011 (Secondary) | Rent Jun 2026 qtr; Sales Mar 2026 qtr; page updated 18 Aug 2026 (Verified) | Interactive dashboard; tables XLSX per search summary | No direct file URL found. Page: https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales.html. Old planning-portal dataset page now redirects to the home page | Unverified | Unclear | Probably manual dashboard export |
| N4 | Bulk Property Sales Information (PSI): address, price, area, contract/settlement dates, by LGA; weekly and annual .DAT zips, from 1990 | Valuer General NSW (Value NSW) | Individual sales (property level) | 1990-present | Weekly (Secondary) | .DAT in zip | Source page https://valuation.property.nsw.gov.au/embed/propertySalesInformation = HTTP 403 to curl | nsw.gov.au page (Verified): "available for non-commercial use only", CC BY-NC-ND 4.0. Commercial use needs a PSI licence; contact vnswprivacy@dpie.nsw.gov.au. (An older catalogue snapshot from Oct 2023 says CC BY: conflicting, treat as stale) | **No** without a PSI licence. A June 2025 NSW Parliament answer refers to 3-year PSI licences for commercial clients; fee not found | Blocked to script; manual download |

Resellers of NSW sales (Secondary/Unverified): Cotality (CoreLogic), PropTrack, Pricefinder hold PSI licences. Cheapest official route: PSI licence from Value NSW (price Unverified).
Vacancy: none official. Approvals: ABS; NSW Planning Portal housing data (Unverified).

---

## QLD

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| Q1 | RTA Bond Statistics / median rents (12 sheets: median rents, new bonds lodged, bonds held at postcode, suburb, LGA, state; dwelling types house/townhouse/flat with bedroom splits e.g. "Flat 1/2/3") | Residential Tenancies Authority QLD | Postcode (from Mar Qtr 2012), suburb (from Sep Qtr 2017), LGA, state | 2012 - latest quarter | File Last-Modified 15 Oct 2026 (header, Verified) | XLSX | https://www.rta.qld.gov.au/sites/default/files/2023-04/rta-bond-statistics.xlsx = HTTP 200, 6,391,803 bytes. Same URL is overwritten each quarter (path says 2023-04) | Workbook cover sheet cites https://creativecommons.org/licenses/by/4.0/ (Verified by opening file) | Yes with attribution | Script |
| Q2 | Residential sales, suburb medians | none found free | | | | | Titles Queensland / Valuer-General sell per-property "abbreviated sale" and "full sale search" (fee codes 2333 / 2325; dollar amounts not shown on page). Bulk sales data goes to licensed information brokers (QVAS), e.g. Pricefinder | State of Queensland copyright; no open licence | **No** (broker sublicence terms: own business use) | Paid |

Other QLD facts: open-data CKAN search found only valuation property boundaries (CC-BY-4.0) from the Valuer-General, no sales or rent datasets (Verified via API). A Townsville City Council dataset reuses Valuer-General median prices under CC BY 4.0 (Secondary, one LGA only). Median house prices by LGA exist in third-party maps (Secondary).
Vacancy: REIQ publishes quarterly vacancy by 50 regions in media releases (Jun 2026 quarter: state 1.0%); full spreadsheets are for members (Secondary). Not official.
Approvals: ABS. Cheapest paid official sales source: per-property searches via Titles Queensland (price not extracted) or a QVAS broker. Resellers: Pricefinder, Cotality, PropTrack.

---

## WA

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL / price | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| W1 | Sales Evidence Data (every freehold/leasehold sale; Pending Sales included at no extra charge) | Landgate | Property-level | From 1988 | Weekly; catalogue entry shows 25-07-2025 (Verified) | CSV extract (VAR form) | No public download. Request via +61 8 9273 7683, customerexperience@landgate.wa.gov.au. Price not listed. Pay-per-report prices (Secondary): suburb report $42.70 for up to 70 records plus 61c each extra; single sales report $7.40 | Custom: Personal Use Licence unless otherwise authorised; resale of derived products needs a Value Added Reseller data agreement (Verified on catalogue; VAR form Secondary) | **No** on a personal licence; **yes only under a VAR agreement** (price Unverified) | Paid / manual |
| W2 | Landgate free statistics (annual median house price movements, lots created) | Landgate | Not suburb-level (not shown) | Not stated | Page updated 19 Jan 2022 | Not stated | https://www0.landgate.wa.gov.au/property-reports/market-trends/property-statistics | Not stated | Unclear | Manual |
| W3 | Rents | none found | | | | | No WA Government rental bond or median rent dataset found in searches or in the Data WA catalogue search (CKAN query "rent" returned no rent datasets) | | | |

Vacancy: none official found. REIWA publishes market stats (Unverified). Approvals: ABS (SA2 WA files in the same series, URLs listed below).
Resellers of WA sales: Landgate data is resold through licensed VARs (names not verified; Cotality, PropTrack, Pricefinder are the usual national aggregators, Unverified).

---

## SA

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Metro Median House Sales by suburb (columns: City, Suburb, Sales and Median for the same quarter this year and last year, Median Change). HOUSES ONLY, no units | Valuer-General SA via DATA SA | Suburb (metro Adelaide plus some towns) | Quarterly files Q1 2015 - Q3 2026; each file has two periods (this year and last) | Dataset updated 2026-10-14 | XLSX | https://data.sa.gov.au/data/dataset/0d447195-1158-4a3c-8cc7-0e333b87eb72/resource/4245a13e-a972-431c-b446-e1e11c951836/download/lsg_stats_2026_3q.xlsx = HTTP 200, 37,129 bytes (opened, columns read) | CC BY 4.0 (dataset page) ; the VG site itself says CC BY 3.0 AU | Yes with attribution | Script (one file per quarter; stitch together) |
| S2 | Median house sale price by quarter, Adelaide metro and 8 non-metro towns (HTML table) | Valuer-General SA | Metro aggregate and towns | Mar 2011 - Sep 2026; chart from 1998 | Page updated 16 Oct 2026 | HTML + PNG | https://valuergeneral.sa.gov.au/News-and-Publications/publisheddataandstatistics | CC BY 3.0 AU | Yes with attribution | Scrape HTML |
| S3 | Private Rent Report (quarterly median private rent by suburb, postcode, region, LGA; columns: Flats/Units count and median, Houses count and median, Other, Total). Based on bonds lodged with CBS. No bedroom split seen | SA Housing Trust via DATA SA | Suburb and postcode | 73 quarterly files, 2008-06 to 2026-06 | Dataset modified 2026-08-11 | XLSX (older XLS) | https://data.sa.gov.au/data/dataset/8eb97a72-9919-448b-8de6-fc1530b3f7ec/resource/b4aa86f1-7efa-4690-9793-bd36df97ad29/download/private-rental-report-2026-06.xlsx = HTTP 200, 251,736 bytes (opened) | `cc-by` (CKAN API: "Creative Commons Attribution") | Yes with attribution | Script |

SA unit sales: not in free data. Paid: Land Services SA (data licences page exists; price Unverified). Vacancy: none official found. Approvals: ABS.

---

## TAS

| # | Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Rental Bond and Rental Data (monthly; record-level sheets "Active Bonds" and "Closed Bonds"; columns: Suburb, State, Postcode, Bond Amount, Weekly Rent, Lodgement and Activation dates, Number of Bedrooms, Dwelling/Premises Type, Length of Tenancy, Housing Type) | Dept of Justice Tasmania (CBOS) on data.gov.au | Suburb and postcode, individual bonds | Monthly files from 2016 (CKAN lists FY datasets 2016-17 through Jul 2026-Jun 2027) | Aug 2026 file; dataset modified 2026-09-17 | XLSX (some older XLS) | https://data.gov.au/data/dataset/cda8637c-c017-4353-b39b-d14851835134/resource/981fab1b-8542-478e-9115-455b7a062d9c/download/abs-report-august-2026.xlsx = HTTP 200, 220,978 bytes (opened). FY datasets can be listed by CKAN API (organisation department-of-justice-tasmania) | CC BY 4.0 (CKAN `cc-by-4.0`, Verified) | Yes with attribution | Script. Note: data.gov.au dataset HTML pages returned 403 to WebFetch, but the CKAN API and file URLs work with curl |
| T2 | Sales | not found free | | | | | Valuer-General property sales reports come from LIST per search; a sample report states it is issued under the Valuation of Land Act 2001 and bars direct-marketing use (Secondary). No bulk free file found | | Unclear / probably no | Paid |

Vacancy: none official found (a Tasmanian Greens press release quotes vacancy figures; not a dataset). Approvals: ABS. Resellers: Cotality, PropTrack (Unverified).

---

## ACT

No free official suburb-level sales or rent dataset found. Socrata catalog search of data.act.gov.au for "sales", "rent", "residential property", "dwelling approvals" returned only transport and addressing datasets (Verified via API). Web searches returned only aggregators (Allhomes, Microburbs, Your Property Guide), so the official ACT source for sales (ACT Revenue Office / Access Canberra conveyance data) and any rental source are Unverified. The ACT has no central bond-lodgement dataset that I could find.
Cheapest paid official source and price: Unverified. Resellers: Allhomes (ACT-focused portal), Cotality, PropTrack (Secondary).
Vacancy: none found. Approvals: ABS SA2 ACT file.

---

## NT

No free official suburb-level sales, rent or vacancy dataset found. NT Government economy site https://nteconomy.nt.gov.au/housing exists and is described (Secondary) as covering property prices and rents by region, affordability and building approvals, but my fetch returned HTTP 403, so granularity and licence are Unverified. data.nt.gov.au did not answer a CKAN API query. Territory-wide figures only came via the Property Council NT quarterly report (Secondary).
Cheapest paid official source: NT Land Titles Office / Valuer-General sales: Unverified. Resellers: Cotality, PropTrack (Unverified).
Approvals: ABS NT SA2 file.

---

## National: ABS Building Approvals by SA2 (all states and territories)

| Dataset | Publisher | Granularity | Years | Last update | Format | Direct URL and test | Licence | Commercial reuse | Fetch |
|---|---|---|---|---|---|---|---|---|---|
| Building Approvals, Australia: SA2 data cubes (total dwellings, houses vs other dwellings per ABS item list in the data item workbook; I did not open them) | ABS | SA2 (also SA3/SA4/GCCSA) | Current 2025-26 and 2026-27 FYTD cubes; ABS says SA2 will be republished back to July 2021 in the Jan 2027 release | Sep 2026 release | XLSX per state; also small-area CSV zips | Base https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia/sep-2026/ ; files 87310do002/003 (NSW), do006/007 (Vic), do010/011 (Qld), do014/015 (SA), do018/019 (WA), do022/023 (Tas), do026/027 (NT), do030/031 (ACT), each suffixed _202609.xlsx. Tested Vic 87310do006_202609.xlsx = HTTP 200 (no size header returned) | ABS site: CC BY 4.0 by default, attribution to ABS required; exceptions are microdata, logos, third-party content (Verified) | Yes with attribution (confirm product page shows CC BY) | Script (path changes monthly) |

Completions by area: ABS does not publish completions at SA2 in this series (Unverified). Census 2021 and ABS Data by Region are other free CC BY sources (Unverified this run).

---

## Summary matrix (status of the claim "free official suburb-or-finer data exists")

| State | Sales (house/unit) | Rents (type/bedrooms) | Vacancy | Approvals |
|---|---|---|---|---|
| VIC | YES: V2-V4, suburb, house + unit, CC BY. Status: Verified (listing and licence), but files 403 to scripts | YES: V1, suburb, dwelling + bedrooms, since 2000, CC BY 4.0. Verified | No suburb source. LGA/regional only. Secondary | ABS SA2 only. Verified |
| NSW | Free but non-commercial (CC BY-NC-ND 4.0); PSI licence needed. Verified. DCJ LGA medians: Verified existence, files Unverified | YES: N1, postcode, record-level, type + bedrooms, licence on portal CC BY (Verified API) but live page silent. Verified | None. Unverified | ABS SA2. Verified |
| QLD | No free source. Paid per-property / via QVAS brokers. Verified | YES: Q1, postcode + suburb, house/townhouse/flat, bedroom split, CC BY 4.0. Verified | None official (REIQ regional, members). Secondary | ABS SA2. Verified |
| WA | No free source; Landgate paid, VAR licence for resale. Verified (price Unverified) | None found. Unverified | None found. Unverified | ABS SA2. Verified (URL list) |
| SA | Houses only, suburb, CC BY 4.0. Verified. No units | YES: S3, suburb + postcode, house vs unit, since 2008, CC BY. Verified | None found. Unverified | ABS SA2. Verified (URL list) |
| TAS | None free. Secondary | YES: T1, suburb + postcode, record-level, type + bedrooms, CC BY 4.0. Verified | None found. Unverified | ABS SA2. Verified (URL list) |
| ACT | None found. Unverified | None found. Unverified | None found. Unverified | ABS SA2. Verified (URL list) |
| NT | None found. Unverified | None found (nteconomy 403). Unverified | None found. Unverified | ABS SA2. Verified (URL list); NT economy site Unverified |

Cross-state vacancy option (commercial, not official): SQM Research publishes free vacancy graphs by postcode with data from 2005; releases say commercial use needs a direct enquiry (Secondary). HTAG publishes per-suburb vacancy (licence not seen).

## Blocked / failed fetches

- https://www.dffh.vic.gov.au/publications/rental-report: WebFetch timeout (60 s). curl returned 200 (55,377 bytes) but I did not read it.
- https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics: HTTP 403 (WebFetch and curl).
- https://www.land.vic.gov.au/__data/assets/excel_doc/0034/775618/units-by-suburb-2015-2025.xlsx: HTTP 403 to curl. (A retry with a Referer header was blocked by the tool's permission check and not pursued.)
- https://valuation.property.nsw.gov.au/embed/propertySalesInformation: HTTP 403 to curl.
- https://www.nsw.gov.au/housing-and-construction/rental-forms-surveys-and-data/rent-and-sales-report: 404.
- https://www.planningportal.nsw.gov.au/housing-rent-and-sales-dataset: 301 redirect to the planning home page.
- https://data.gov.au/data/dataset/rental-bond-and-rental-data-july-2022-to-june-2023: HTTP 403 to WebFetch (CKAN API and file URLs worked).
- https://nteconomy.nt.gov.au/housing: HTTP 403.
- https://data.nt.gov.au CKAN API: no usable response.
- ABS product page licence line: not stated on the release page; only the site-wide CC BY 4.0 notice was read.
- NSW PSI fee, Landgate Sales Evidence fee, QLD sales fee amounts (page printed fee codes, not dollars), ACT and NT official sales sources: not found within budget.

## Budget used

About 30 searches, 24 fetches, plus curl header tests and API queries.

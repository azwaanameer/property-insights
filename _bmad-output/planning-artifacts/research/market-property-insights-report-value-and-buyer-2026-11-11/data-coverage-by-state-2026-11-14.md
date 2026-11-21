# Data coverage by state and launch tiers (2026-11-14)

Built from digests H1 (sales/rent), H2 (growth drivers), H3 (persona data and rules), H4 (third-party licences) and files downloaded on 2026-11-14 into `data/raw/` (gitignored). Status labels follow the digests: Verified / Secondary / Unverified. The tiers are my judgement, not a measurement.

## What is on disk

| Folder | Content | Licence |
|---|---|---|
| data/raw/abs/census2021, census2016 | Census General Community Profile, suburb level, all 8 jurisdictions | CC BY 4.0 |
| data/raw/abs/api | SA2 population 2011-2025, SEIFA 2021 (SA2, SAL), SEIFA 2016 (SSC), monthly SA2 building approvals from 2021-07 | CC BY 4.0 |
| data/raw/abs/approvals | ABS building approvals SA2 cubes, all states | CC BY 4.0 |
| data/raw/qld | RTA median rents (postcode since 2012, suburb since 2017; house/townhouse/flat) | CC BY 4.0 (cover sheet) |
| data/raw/nsw/lodgements | Rental bond lodgements, record level, 2021 to Oct 2026 | CC BY on data.nsw.gov.au portal; live page states none: unconfirmed |
| data/raw/sa/median, sa/rent | House median sales by suburb (47 quarterly files); private rent report by suburb (73 quarterly files from 2008) | CC BY |
| data/raw/tas | Rental bond records 2016 to Jun 2026 (Jul 2024 to Jun 2025 dataset not found yet) | CC BY 4.0 |
| data/raw/macro | RBA cash rate and rate tables, ABS lending indicators, ABS CPI | CC BY 4.0; RBA cash rate series wording needs a check |
| data/raw/dffh, vgv | Victoria rents and unit medians (earlier session) | CC BY 4.0 |

## Coverage matrix

| State | Prices (house / unit) | Rents | Census + SEIFA + population + approvals | Transit data | Crime (suburb) | Duty and land tax (rules) |
|---|---|---|---|---|---|---|
| VIC | Yes, both, CC BY (house files need browser download) | Yes, since 2000 | Yes | GTFS (CC BY) | LGA only | Verified |
| SA | Houses only | Yes, house vs unit, since 2008 | Yes | GTFS | Suburb CSVs | Snippets |
| NSW | Licence needed (non-commercial only) | Yes, postcode | Yes | Key needed | Suburb (BOCSAR) | Verified |
| QLD | None free (brokers) | Yes, suburb | Yes | SEQ GTFS | LGA/division | Verified |
| TAS | None free | Yes, suburb, record level | Yes | Blocked | Not searched | Snippets |
| WA | Landgate paid, reseller agreement | None | Yes | Perth GTFS (licence silent) | Police district | Verified (FHOG) |
| ACT | None found | None | Yes | Registration | 403 | Verified |
| NT | None found | None | Yes | Darwin GTFS | Not searched | Not confirmed |

## Launch tiers (proposal)

- **Tier A, launch: VIC.** The only state with house and unit prices, rents, and a backtested rating.
- **Tier B, near launch: SA.** House prices and rents by dwelling type allow a partial backtest (houses only). Units are not covered.
- **Tier C, rating without price history: NSW, QLD, TAS.** Rents and Census support a conditions rating, which can be backtested only against rent growth. Price pages stay blank until a sales licence is secured. NSW and QLD are the largest markets, so the sales licence matters most there.
- **Tier D, hold: WA, ACT, NT.** No free rents or prices. Census and approvals alone are too thin.

## Persona fit (sketch)

- **Mortgage broker:** duty, land tax and grants are rule pages, available for every state (some from snippets only). Does not need price history.
- **Investor:** needs yield, so rents plus prices. Fully served only in VIC; partially in SA.
- **Buyer's agent:** needs sales comps. Free building comps exist only in VIC.
- **Short-stay operator:** needs AirDNA comps (any state) plus local rules. Rules are verified for VIC and NSW only.

## Not backtested outside Victoria

Our backtest used Victorian prices. A rating for any other state is untested for price outcomes until price history exists there. Rent-growth outcomes are available for NSW, QLD, SA and TAS and can serve as a weaker test.

## Needs the user, by priority

1. Victoria: houses-by-suburb and units-by-suburb 2015-2025 xlsx from land.vic.gov.au (403 to scripts).
2. Written permission requests: Microburbs (Approved Purpose for paid reports), Value NSW (PSI licence and fee), Landgate (reseller agreement and fee), ACARA (ICSEA), SQM (vacancy).
3. Microburbs API key (for a pinned-version test of QLD/WA/TAS fields only after permission is in writing).
4. Browser downloads: Victoria in Future 2023, NSW 2024 projections, QLD QGSO 2025 projections.
5. Registrations: NSW Open Data Hub key (GTFS), WA SLIP account, ACT GTFS access, TAS GTFS page.
6. Infrastructure: ask Infrastructure Australia for its priority list as a spreadsheet; open the Victorian Infrastructure Pipeline xlsx and the QLD QTRIP CSV and check for locations and dates.

## Known gaps

No free suburb vacancy anywhere. No machine-readable project data for Brisbane 2032, Sydney Metro, Western Sydney Airport, METRONET or Canberra light rail. No TAS, ACT or NT sales. Flood layers patchy. See H1-H4 for sources and evidence labels.

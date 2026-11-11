# Import: Domain Developer API (specs and FAQ) and our price-driver analysis

## A. Domain public API specifications (primary, retrieved 2026-11-11)
Provenance: https://developer.domain.com.au/static/latest/media/v2/openapi.json (25 paths) and .../v1/openapi.json (87 paths); saved at data/raw/domain/. Publisher: Domain Group.

- **No endpoint named building, strata or owners corporation exists in either spec.** Domain's website Building Profile ("Powered by Domain Insight") has no matching public endpoint.
- v1 endpoints relevant to an investor report: `/v1/properties/{id}`, `/v1/properties/{propertyId}/priceEstimate`, `/v1/properties/{propertyId}/rentalEstimate`, `/v1/properties/salesHistory`, `/v1/properties/listingHistory`, `/v1/avm/{propertyId}` and `/v1/avmHistory/{propertyId}`, `/v1/propertyReports`, `/v1/propertyenrichment`, `/v1/listingSearch/residential/searchSold`, `/v1/listingSearch/residential/search`, `/v1/suburbHistorical/{state}/{suburb}/{postcode}`, `/v1/suburbSummary/...`, `/v1/suburbPerformanceStatistics`, `/v1/propertyradar/portfolio` (portfolio management).
- v2 endpoints: `/v2/suburbPerformanceStatistics/{state}/{suburb}/{postcode}` (params: propertyCategory, bedrooms, periodSize, startingPeriodRelativeToCurrent, totalPeriods) returns a monthly series with medianSoldPrice, numberSold, highest/lowest and 5th/25th/75th/95th percentile sold price, medianSaleListingPrice, numberSaleListing, auction numbers, daysOnMarket, discountPercentage, medianRentListingPrice, numberRentListing, meanRentYield. `/v2/demographics/{state}/{suburb}/{postcode}`; `/v2/property/features` (pool, gym, spa, balcony, study, intercom and more, by address); `/v2/properties/search/like/{searchType}` (comparable properties by bedrooms, bathrooms, car spaces, radius, with event date and price); `/v2/property/zoning-perils` (bushfire, flood, heritage, zoning, permitted use); `/v2/schools/...`; `/v2/salesResults/saturday` (auction clearance by capital city).

## B. Domain Developer Portal FAQ and API list (primary, retrieved 2026-11-11)
Provenance: https://developer.domain.com.au/docs/latest/support/faq and .../apis (saved as text in data/raw/domain/faq.txt and apis.txt). The Terms and Conditions page text did not load (dynamic); not read.
- Registration needs a corporate email address; personal or free email accounts cannot be used.
- Packages (listed on the APIs page): property and address search; agents and listings; current price estimate for any property; auction results, property datasets, market performance and demographic stats; property enrichment; a comprehensive property-data package; PropertyRadar portfolios; rental estimates; schools; webhooks. Access is "agreed with your account manager"; "each API option has several available pricing tiers depending on your usage requirements". No prices published.
- Go-live conditions (FAQ): display the "powered by Domain" logo; send stats back to Domain; let users view the original listing with a UTM tag; **contacting the agent must not be behind a paywall or login; no price estimate data may be behind a paywall.** The FAQ warns against storing listing data ("check out our terms of use, specifically the bit about storing Listings data").

## C. Our price-driver analysis (project computation, this run)
Provenance: scripts/23-price-drivers.mjs over data/rp_harvest.json (realestate.com.au sold listings via the RapidAPI wrapper, retrieved 2026-11-11; newest 150 sales per suburb, six inner-Melbourne suburbs). Method: ordinary least squares on log(sale price), suburb fixed effects, apartments with a parseable unit number. 599 of 900 sales used; R-squared 0.743; typical unexplained spread about 19%.
| Driver (all else equal) | Effect on price | Std error |
|---|---|---|
| 2 bed vs 1 bed | +30.3% | 2.1 |
| 3 bed vs 1 bed | +100.0% | 4.1 |
| 2 or more baths vs 1 | +24.7% | 2.1 |
| Has a car space | +23.7% | 2.1 |
| Floor 10-19 vs 1-9 | -2.9% | 2.1 |
| Floor 20-29 | -0.9% | 2.7 |
| Floor 30+ | +6.7% | 2.8 |
| Suburb vs Melbourne CBD: Docklands +8.7% (2.4); Port Melbourne +21.9% (3.1); South Yarra +2.6% (3.0); Southbank -1.1% (2.5); St Kilda -0.7% (3.2) | | |
Pooled median prices: 1 bed 1 bath no car $355,000 (n=109); 1/1 with car $414,250 (110); 2/1 no car $435,000 (38); 2/1 with car $566,000 (127); 2/2+ no car $505,000 (20); 2/2+ with car $670,000 (158); 3/2+ with car $1,010,000 (37).
Limits: association not causation; no building quality, view, age or condition; small cells for no-car layouts; sales window differs by suburb.

## D. Same-building competition (computed from the Domain Building Profile paste, imports/domain-building-profile-628-flinders-2026-11-11.md)
Of 21 for-sale entries listed in the paste, 7 are 2 bed / 1 bath / no car (units 2514, 1914, 3617, 1017, 2215, 917, 416), the same layout as unit 310: 33% of current competing listings. Visible asking ranges for that layout: $370,000-$390,000 (917, "Offers Welcome"), $420,000-$450,000 (2514), $485,000-$525,000 (1017), $510,000-$540,000 (1914); 2215 "Repriced to sell". Domain's newest comparable sale was $445,000 (unit 413, 9 Nov 2026).

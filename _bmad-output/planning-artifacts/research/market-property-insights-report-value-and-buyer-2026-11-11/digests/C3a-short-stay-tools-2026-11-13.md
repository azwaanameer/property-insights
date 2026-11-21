# C3a Short-stay analytics and income-estimate tools (AU apartments)

Researched 2026-11-13. Budget used: 12 searches, 8 fetches. Currency is USD unless stated. Evidence tags: V = Verified (primary page read via fetch), S = Secondary (search-result summary or third-party), U = Unverified.

## Comparison table

| Tool | Outputs | Price + date | Free tier | AU coverage | Accuracy evidence | Status |
|---|---|---|---|---|---|---|
| AirDNA (Rentalizer, MarketMinder, API) | Per-address Rentalizer (annual revenue, occupancy, ADR), comps and custom comp sets (paid), market pages with revenue/ADR/occupancy/supply, future demand, Market Score 40-100, AI "Rentalizer Agent" report | Market Research US$34/mo billed annually (US$400/yr) or US$125/mo monthly; Adapt dynamic pricing US$20/listing/mo; Property Manager and Enterprise custom (all seen 2026-11-13 via search summaries of airdna.co/pricing). Old per-market MarketMinder pricing: sources conflict. API: sales-led, annual contract, no public price (apidocs.airdna.co exists) | Free account: Rentalizer for any address, market browsing; limits unclear (blog says 5 Rentalizer Agent reports on Research/Host, 25 on Property Manager) | Strong: ~292 AU markets, 8 states, Melbourne market pages (airdna.co/vacation-rental-data/app/au/victoria/melbourne). AirDNA Melbourne figures inconsistent across its own pages (ADR A$/US$134.8 vs 161 vs 184; active listings 19.2k vs 19.9k vs 33.3k) | Self-claimed 95-99% vs Airbnb SEC filings (aggregate market level, not per-listing). No independent audit found. Anecdotes (BiggerPockets, Reddit) of large per-address misses, esp. thin markets. Calendar-inference means blocked dates can read as bookings | S (pricing page fetch returned HTTP 403; claims from search summaries) |
| Airbtics | Calculator: annual revenue, nightly rate, occupancy, comps on map (3 yrs monthly history per comp), cash flow, cash-on-cash, PDF/Excel export; AU market reports; Melbourne market page | Pricing page lists Scale plan US$295/mo (annual figure "$750" ambiguous); Pro and Expert prices not found. RapidAPI income-prediction API: Basic $0 (1 report/mo), Pro $49 (50), Ultra $199, Mega $1,000 per month. Enterprise from US$500/mo minimum (competitor claim). Seen 2026-11-13 | Free plan to explore markets worldwide; free calculator signup; limits not stated | Yes: AU state/city pages (Melbourne, Perth, Wollongong, Ipswich), 2025 AU market report. Melbourne avg stated as A$60K/yr on one page and $38K on another (internal inconsistency) | Self-claims 96-97% accuracy, tracks 20M+ listings. Own test: 4 calculators vs owner's 2 properties (Seoul +0.4%, Kuala Lumpur -3.3%); n=2, self-run, not AU. No independent test | V for calculator page (fetched); S for pricing and accuracy |
| AirROI | Calculator: revenue at 25/50/75/90th percentiles, occupancy, revenue per booked night, up to 50 comps within 2 miles; market metrics (occupancy, ADR, RevPAR, seasonality, pacing); AU market and suburb pages (e.g. South Melbourne ADR $163, 18 listings, Dec 2025) | API: pay-as-you-go from $0.01/call, no minimums, currency not stated; per-endpoint pricing not seen. Endpoints: /calculator/estimate, /listings/comparables, 13 market endpoints. Seen 2026-11-13 | Calculator free, no signup, 190+ countries, local currency; US$10 API starter credit, non-expiring | Claims 190+ countries; AU suburb pages exist (Melbourne, West Perth, Busselton); calculator/API pages do not name Australia | Claims "95%+ revenue prediction accuracy" with no method. Methodology page itself states no backtest of predicted vs actual, no error metric. Notes AirDNA vs Rabbu 2x gap at one US address | V (api and methodology pages fetched) |
| Mashvisor | Property-level long-term and short-term income estimate, occupancy, rental comps (Excel exports), ROI, opportunity scores; nightly rate not explicit | Lite US$49.99/mo, Standard US$74.99/mo, Professional US$99.99/mo (all billed annually; quarterly higher), Enterprise custom incl. API/bulk data; vacation rental management Starter US$11/mo. No refunds. Fetched 2026-11-13 | No free trial of subscriptions (AI assistant trial only) | Page references only US ("95% of US markets"); AU not supported as far as stated | None found independently; Mashvisor markets against AirDNA accuracy | V (pricing page) for price/coverage |
| Rabbu | Free Airbnb revenue calculator per address; marketplace/analytics | Free calculator; paid tiers conflicting (one source: no pricing page as of Oct 2026) | Free calculator | US-only per its own calculator wording and third-party reviews. Not usable for Melbourne | Sahuarita AZ anecdote: AirDNA $39.6k vs Rabbu $20k. No audit | S (rabbu.com fetch returned HTTP 403) |
| BnBCalc (not requested, AU-relevant) | Per-address Melbourne analyses, market pages (Melbourne avg A$47K/yr; high A$87K, low A$17K) | Calculator US$30/mo or US$199/yr; Markets plan US$399/yr; 7-day trial; per-call API, no minimum (vendor pages, 2026) | 7-day trial | ~2,400 markets, 157 countries | None independent | S (vendor) |
| Collings GeeVee (AU property firm) | Free Melbourne STR estimator vs long-term rent comparison | Free | Free | Melbourne | Unknown method | S |
| Apify "Airbnb Revenue Calculator" (scraper actor) | Revenue/occupancy from public data, marketed as AirDNA alternative | Usage-based (not checked) | n/a | Global, unverified AU | None | U |

No Australia-specific commercial per-address STR income tool (equivalent to an AU property-data vendor) turned up in the searches. AirDNA is the dominant AU-covered source.

## Key observations for the report product
- Per-address short-stay estimates are cheap or free at consumer level: AirDNA free Rentalizer, AirROI free calculator (no signup), Airbtics free signup, Collings free Melbourne estimator. A paid report cannot differentiate on a raw revenue number.
- API access that could be resold or embedded: AirROI (US$0.01+/call, public), Airbtics via RapidAPI (US$49/mo for 50 reports) or enterprise (US$500/mo min, unverified), BnBCalc per-call. AirDNA API needs a sales contract (12-month term, 10% renewal uplift per a competitor comparison; unverified). Data-rights and resale terms were not checked here.
- Accuracy: every vendor figure (94.9-99%) is self-reported at aggregate level. No independent per-address backtest found for any tool. Cross-tool spread in Melbourne is wide (market averages from about A$38K to A$87K/yr depending on source and definition). A report should show ranges and label them modelled, not a point forecast.
- Definitional traps: occupancy treats blocked nights differently, gross includes cleaning fees or not, platform scope (Airbnb only vs Airbnb+Vrbo+Booking.com), and entire-home vs whole-market mixes.
- Regulatory (not covered by these tools): none of the sources assessed how Victoria's short-stay levy or council/owners-corporation rules change returns.

## Sources (accessed 2026-11-13)
- https://airroi.com/api (fetched, V)
- https://www.airroi.com/calculator/methodology (fetched, V)
- https://www.mashvisor.com/pricing (fetched, V)
- https://airbtics.com/airbnb-calculator (fetched, V)
- https://www.airdna.co/pricing (fetch 403; search summary only, S)
- https://www.airdna.co/airbnb-calculator ; https://www.airdna.co/vacation-rental-data/app/au ; https://www.airdna.co/vacation-rental-data/app/au/victoria/melbourne/overview (search results, S)
- https://airdna.co/airdna-accuracy (search result, S)
- https://apidocs.airdna.co/ (search result only, S)
- https://airbtics.com/product-pricing ; https://help.airbtics.com/article/airbtics-subscription-plans ; https://help.airbtics.com/article/airbtics-data-accuracy (redirect to tawk.help, not fetched, S)
- https://rapidapi.com/airbtics-airbtics-default/api/airbnb-income-prediction/pricing (search result, S)
- https://airbtics.com/annual-airbnb-revenue-in-melbourne-australia ; https://airbtics.com/short-term-rental-market-report-2025-australia (search, S)
- https://rabbu.com/airbnb-calculator (fetch 403, S)
- https://www.bnbcalc.com/markets/au/melbourne ; https://www.bnbcalc.com/bnbcalc-vs-rabbu ; https://www.bnbcalc.com/bnbcalc-vs-airdna-api (vendor, S)
- https://www.collings.com.au/airbnb-profit-calculator-australia/ (search, S)
- https://airroi.com/airbnb-data/australia/western-australia/west-perth ; https://airroi.com/report/world/australia/victoria/south-melbourne (search, S)
- https://www.biggerpockets.com/forums/530/topics/1103430-is-airdna-data-legit (anecdotal, S)
- https://www.hometime.io/blog/get-accurate-airbnb-roi-estimates (competitor opinion, S)

## Unverified or conflicting items
- AirDNA current prices (US$34/mo annual, US$125 monthly, Adapt US$20) come from search summaries; the pricing page returned 403 and its metadata may be stale.
- AirDNA MarketMinder: three sources disagree (sales-led; US$20-100+/market; discontinued in favour of flat plans).
- AirDNA API price, contract terms (12 months, 10% uplift): vendor-comparison blog only.
- Airbtics Pro/Expert prices and the Scale "$750" figure; Airbtics enterprise US$500/mo minimum.
- AirROI API per-endpoint price and currency; AU coverage of calculator/API not stated on fetched pages.
- Rabbu pricing (free vs paid) conflicting; AU exclusion rests on its own "any address in the United States" wording plus competitor reviews.
- Mashvisor AU coverage: pricing page mentions US only; a 2024 Airbtics article claims Mashvisor is US-only.
- Airbtics Melbourne averages (A$60K vs $38K) and AirDNA Melbourne ADR/listing counts are internally inconsistent; currency (USD vs AUD) of AirDNA AU pages not confirmed.
- No independent per-address accuracy test found for any tool; the AirDNA and Rabbu 2x gap is a single Reddit anecdote.

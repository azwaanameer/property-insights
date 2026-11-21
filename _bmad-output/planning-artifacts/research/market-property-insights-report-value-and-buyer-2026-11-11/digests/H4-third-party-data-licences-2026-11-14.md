# H4 Third-party suburb data licences for non-VIC states (accessed 2026-11-14)

Labels: **Verified** = page fetched this run; **Secondary** = search-result summary only (page not fetched); **Unverified** = not confirmed. Fetch tool returns a model-summarised page, so quotes are "as returned by the fetch tool"; re-read the source before relying on a clause in a contract decision.

## Bottom line

1. No provider checked offers a published, off-the-shelf licence that clearly allows a paid, PDF report (a "new product" delivered to a buyer) built on their suburb data. Every one needs a written agreement or "Approved Purpose" conversation.
2. Microburbs is the only one with public self-serve pricing AND readable API terms. Its terms (updated 22 Oct 2026) allow 30-day storage but restrict display to "authenticated users within your application", bar redistribution and derivative works "outside the Approved Purpose", and require attribution. A PDF handed to a buyer is a grey area; get the Approved Purpose in writing.
3. Cotality, PropTrack, Pricefinder, Domain: quote-only, contract-gated; known clauses bar on-supply, display to third parties, derivative works, and storage outside Australia (clause numbers are Domain's, via a secondary source).
4. Government sales data (WA Landgate, QLD) is licensed to resellers, not open. WA has a real Value Added Reseller (VAR) route that expressly permits derived products. QLD is via brokers. NSW bulk sales are CC BY (Secondary).
5. Accuracy evidence: only Microburbs and HtAG publish any, and it is self-published, not independent.

## Comparison table

| Provider | Suburb fields (status) | Price / tier / minimum | Licence on reuse in a paid derived product | Accuracy evidence |
|---|---|---|---|---|
| Microburbs API | Median house and unit price (latest only; series on a separate endpoint; time series from 2000), gross yield, vacancy, stock on market, months of supply, growth measures, "growth forecasts", rents, demographics, AVM with confidence interval. Australia-wide; core suburb metrics weekly. **Verified** | Prepaid credit, per call in AUD cents ex GST, no monthly fee, no minimum commitment (FAQ). Verified example: 6c/call for median sale price. Search summary (Secondary): 5c to 60c per endpoint, street forecasts 60c. Custom rates by contact. | 30-day storage allowed; display only to authenticated users; no resale/redistribution; derivative works only inside written Approved Purpose; attribution on every screen. **Verified** (see clauses) | Self-published track record and back-test (see below). **Verified** that it is self-published; no independent audit found |
| Cotality (ex CoreLogic) | Market Trends dataset: sales volume, median price, time on market at suburb level; API packages incl. price/rent estimates, suburb stats. **Secondary** | Not published; contract, trial needs ABN (13labs article 29 Jul 2026, **Verified** as fetched but it is a third-party article) | Third Party Restrictions v6 (from 1 July 2025) pass through state limits: see clauses. 13labs: end user terms bar reselling/sublicensing "for profit", scrapers, and storage outside Australia. **Verified** (restrictions page); the 13labs claims are Secondary | None found |
| PropTrack (REA) | Suburb/postcode demographics, supply and demand, historic sale and rent series. **Secondary** (13labs) | Monthly subscription typical, no figures, sales-gated; no free tier | Not found. PropTrack disclaimer page notes some sales data is under licence from NSW Valuer General, so third-party limits likely flow through. **Secondary/Unverified** | None found |
| Pricefinder | Suburb statistics, suburb/postcode/street endpoints. **Secondary** | API quoted per deal; web seats $175+GST/mo (not API). Developer page states "the APIs are not available for commercialisation" (13labs quote) | Domain API terms reportedly apply. Secondary | None found |
| Domain Developer API | Suburb performance by state/suburb/postcode; fields (v1 page, **Verified**): medianSoldPrice, numberSold, percentiles, medianSaleListingPrice, auction counts, daysOnMarket, discountPercentage, medianRentListingPrice; series by year/month by property category. v1 endpoint deprecated; v2 recommended | Not published; per-contract Product Schedule, ex GST, 28 days notice of price change (13labs, Secondary). Self-serve key but paid | Clauses 7.6(d) no "licensing, selling, renting, leasing, transferring, distributing, displaying, disclosing" to third parties; 7.6(g) no derivative works; 16.5 delete cached data at termination; 7.6(j) no storage outside Australia; 7.6(k) no direct marketing. **Secondary** (13labs quoting Domain terms; Domain terms page not retrieved) | None found |
| SQM Research | Postcode Snapshot (**Verified**): locality ratings, days on market, stock on market, vacancy rates, gross implied yield, asking prices/vendor sentiment, asking rents, demographics. Vacancy series back to 2005 (Secondary). No API found | Postcode Snapshot page: $49.95 one report/postcode, $99.95/mo unlimited postcodes (a search summary showed $39.95 / $79.95, so prices vary by page; Property Explorer ~$128.70/mo Secondary). "Custom Data Request" exists | "Content is provided 'AS IS' for your personal, non-commercial use or internal business purpose only"; "Copying, republishing, distributing, or otherwise commercially exploiting any Content ... requires express prior written permission"; systematically retrieving data to compile a database prohibited. **Verified** | Not found (SQM Ratings accuracy not checked) |
| HtAG Analytics API | 15,000+ localities, 537 LGAs, suburb dataset; 87 endpoints (Secondary) | Pay-per-row, no subscription; rates at developer.htagai.com/pricing (not fetched); tiers repriced 30% lower June 2026 (Secondary) | Terms Part C governs API; usage-rights clauses not retrieved (htag.com.au/terms-and-conditions returned only in search; 403 on another HtAG page). **Unverified** | Publishes "Evidence Portal" of past predictions and a back-testing explainer (Secondary; not fetched) |
| Landgate (WA) sales evidence | Sales price/date, parcel, bedrooms/bathrooms, building attributes; history from 1988; whole state or Perth Metro; weekly/fortnightly updates. **Verified** | No price published; contact Customer Experience (+61 8 9273 7683). Options: one-off extract, subscription, VAR agreement | VAR - Data Agreement allows a VAR to "create and on-provide products derived from Landgate data", internal and external use. Commercial VAR covers "new products for customers" by adding value. Fees not stated. **Verified** (licensing page). VAR FAQ PDF could not be parsed. Note Cotality's WA clause: "will not sell, license ... or derive revenue from the VA Data" applies to Cotality customers, not to a direct Landgate licensee | None |
| QLD sales/valuation data | Property-level sales searches at fee codes (2333, 2325), maps via brokers (QVAS). Dollar fees not shown. **Verified** | Per-search fees; bulk via participating brokers, "different pricing models" | State page gives no reuse terms. Cotality's QLD clause (via its customers): use "in the ordinary course of its business" and "not a business acting as a reseller of any products derived from or based on the Licensed Data". **Verified** (Cotality page) | None |
| NSW Valuer General bulk sales | Property sales from 1990, weekly, .DAT. | Free | Creative Commons Attribution (catalogue entry). **Secondary** (search summary; not fetched). Cotality's NSW clause bars commercialising "in the form obtained from VGNSW" |  n/a |
| ABS | Capital city / rest-of-state indexes only, not suburbs. Source data supplied to ABS by CoreLogic (Secondary) | Free | Free dissemination; open licence not confirmed (Unverified) | n/a |
| ACT / NT / TAS | ACT Treasury quarterly dwelling price reports; NT site gives capital city medians from REIA; nothing found for TAS. No official suburb median set found. **Secondary** | n/a | n/a | n/a |

## Clause quotes

### Microburbs API Terms and Conditions
URL: https://www.microburbs.com.au/api-terms ; accessed 2026-11-14 ; page states "Last updated 22 October 2026". **Verified.**
- 6.3 "You may store Data for up to 30 days."
- 6.1 "Data returned by the API must be displayed only to authenticated users within your application."
- 6.2 "You may not resell the Data, pipe or stream it to a third party," and "or otherwise make it available to anyone outside your own authenticated users."
- 2.2 prohibits to "pipe, stream, or otherwise redistribute the Data to any third party", to "sublicence, sell, rent, lease, transfer, assign, distribute", to "create derivative works based on the API or the Data" and use "outside the scope of the Approved Purpose".
- Definition of derivative work: "any modification, adaptation, or transformation of the API or Data that creates a new product or service".
- Definition: Approved Purpose is "the intended use case for the API as agreed upon in writing between Microburbs and the Client."
- 2.3 attribution "on each page, screen, or view of the Client's products or services", visible "without requiring them to expand, hover over", with a hyperlink to microburbs.com.au.
- 10.3 "The Client shall not use Microburbs' Brand Features without prior written consent."
- 13.4 on termination, "delete or destroy all copies of the Data".
- Not found: any clause on commercial use, competing products, white-label or "reports".
- Version conflict: a search summary (Secondary) of the same URL said "last updated 29 April 2025" with "No caching or redistribution. Call the API each time a user requests data. Do not cache, store, or resell the responses." The fetched page (22 Oct 2026) is looser. A PDF edition (https://www.microburbs.com.au/microburbs-api-terms-and-conditions.pdf) was not fetched. Terms change without notice; pin the version in any agreement.

### Microburbs website terms
URL: https://www.microburbs.com.au/terms ; no date shown ; **Verified.** "Content is copyright-protected and unauthorised copying or use is prohibited." "Building offline databases from the data is strictly forbidden." "Large-scale report downloading beyond individual suburb evaluation is prohibited." "If you need our data in bulk, use the Microburbs API instead." "You may not use any automated program to access our service."

### Microburbs pricing and white-label
- https://microburbs.com.au/faqs **Verified**: "It is pay as you go - there is no plan to sign up to, no monthly fee and no minimum commitment." "Calls stop when the balance hits zero." White-labelling there refers to Microburbs' own reports on annual Buyer's Agent plans, not API data.
- https://www.microburbs.com.au/developers/api-docs/pricing and /api-access **Verified**: prepaid credit, per call, AUD cents ex GST; rate table failed to render ("Loading...") so the full price list is not confirmed. "Enterprise solutions" and a white-label option are mentioned with no terms.
- https://www.microburbs.com.au/developers/api-docs/suburbs-market-median-sale-price **Verified**: 6c per call, latest house and unit median only, separate as_of dates, unit figure can be stale in thin suburbs.

### Cotality Third Party Restrictions
URL: https://www.cotality.com/au/legal/third-party-restrictions ; "Version 6 ... current as and from 1 July 2025", page modified 8 July 2025 ; accessed 2026-11-14 ; **Verified.**
- VIC cl 2.4(b): "reproduce, sell, disclose, repackage or on-supply the Licensed Material other than in the form in which it is provided".
- WA cl 2.1(a): "will not sell, license, hire, let, trade or expose for sale or derive revenue from the VA Data or part thereof;". WA cl 2.2(b): "no location information, or part thereof, may be reproduced, distributed, commercialised or re-used for any other purpose".
- QLD cl 2.3(d): "it will only use the Qld Data received from Cotality for its own personal use or in the ordinary course of its business" and "it is not a business acting as a reseller of any products derived from or based on the Licensed Data."
- QLD cl 2.8: must not Access or Use "(such as systematic or bulk Downloads)" to search by name. QLD cl 2.10 and VIC cl 2.10: destroy all Licensed Material on expiry or termination.
- NSW cl 2.14(a)(i): "commercialise or otherwise exploit the Property Sales Information in the form obtained from VGNSW".
- SA cl 2.13(c): "must not be used for the purposes of compiling contact lists".
- Reading: Cotality aggregates state data under state-specific resale bans. Re-supplying that data (even aggregated) in a paid report is likely to need a bespoke Cotality commercial licence. **Unverified** whether Cotality will grant one for a small product.

### Domain (secondary quotation)
Source: https://www.13labs.au/guides/australian-property-data-apis-compared (article dated 29 July 2026; fetched; **Secondary** for Domain's own terms). 7.6(d) bars "licensing, selling, renting, leasing, transferring, distributing, displaying, disclosing" the API products to third parties. 7.6(g) bars copying, modifying or creating derivative works. 7.6(j) "do not access, use or store the API products, or make the API data available, outside of Australia". 16.5 delete cached data at termination. The Domain terms themselves were not found by search.

### SQM Research
URL: https://sqmresearch.com.au/postcodesnapshot.php ; accessed 2026-11-14 ; **Verified** (fetch summary): "AS IS" for "personal, non-commercial use or internal business purpose only"; non-exclusive, non-transferable, revocable licence; "Copying, republishing, distributing, or otherwise commercially exploiting any Content or Marks requires express prior written permission"; systematic retrieval to compile a database prohibited. Marketing copy says users can "provide to your clients" the report, which conflicts with the internal-use limit; ask SQM in writing. https://sqmresearch.com.au/main_mypropertyreport.php (**Verified**): My Property Report $59.95, "ideal to either keep for personal use"; no API mentioned.

### Landgate
- https://landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/sales-evidence-data **Verified**: sales from 1988; options one-off extract or "Enter into a business agreement with us and become a value added reseller"; owner-name tenure data "subject to strict licensing conditions"; no price listed.
- https://prod013.landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/licensing/ **Verified**: "VAR - Data Agreement: Allows a VAR to 'create and on-provide products derived from Landgate data.'" Internal and external use. Commercial VAR: new products for customers. SPUR Start-up VAR: limited to development, testing and limited commercialisation. Transaction licence: internal business use only. Publication licence required for external use. Fees not on this page.
- Search summary (Secondary): a separate higher fee tier for VARs with Sub-VARs; $0 and $1 consideration and valuer-adjudicated records excluded; pending sales must not be portrayed as sales.

## Accuracy evidence

- Microburbs, https://www.microburbs.com.au/p/suburb-forecast-track-record **Verified** (self-published): calls July 2023 to June 2025, 22 of 24 months measured. Top-1 pick grew 28% vs 9% for the country (18 of 21 calls beat the country); top-3 24% (52 of 63); top-5 21% (82 of 106); top-10 18% (154 of 209, 55 finished behind); random suburb 9%. Own caveats: "It is an edge, not a guarantee"; thin-data suburbs; sources disagree (HtAG 3.1% vs Microburbs 12.6% for Mount Druitt). No independent verification. Search summary (Secondary) flagged inconsistent headline figures across Microburbs pages (78% hit rate vs 85% 15-year vs 79% across 876,000 calls; 2013 to 2024 back-test across 132 monthly rounds, top-5 beating average by about 7 points over two years; test years mostly rising markets). Note the verified page measures relative ranking against the country, not absolute price error.
- HtAG: publishes an Evidence Portal and back-testing explainer (Secondary only; htag.com.au/are-property-forecasts-accurate returned 403).
- Cotality, PropTrack, Domain, Pricefinder, SQM: no published suburb forecast accuracy found in this run.

## How other suburb-rating products source and describe data (all Secondary; none fetched)

- Suburbtrends: no methodology page found. Third-party coverage says it is "a data consulting firm", uses SA3-level median price time series and SA2-level market trends combined with income and employment data, and used ChatGPT in a Build-to-Rent ranking. Accuracy claims are self-reported; no error-correction process published. One "deep research" page sat on a squarespace subdomain, authenticity unconfirmed.
- Hotspotting: no methodology page found. Its "top picks" page appears to summarise the realestate.com.au Hot 100, which is expert-nominated with PropTrack data. Hotspotting's own index method not found.
- Smart Property Investment FAST 50: shortlist from 15-expert panel, then "leveraging housing data from the SPI suburb search feature"; underlying dataset not named. Reliability evidence not published.
- Property Update: no methodology found; lists Cotality as a research source in a reader guide, which is not a statement of its own sourcing.
- Property Investment Professionals (monthly top 10): median and yield from Cotality via Your Investment Property, vacancy from SQM postcodes; screen SQM vacancy at or below 1.5% and gross yield at or above 4.3%; own 0-100 score. Shows that Cotality plus SQM is the common stack.
- Your Property Guide has a methodology page (https://www.yourpropertyguide.com.au/methodology), found in search but not fetched.
- Pattern: rating products mostly publish expert-shortlist or screen rules, not out-of-sample accuracy.

## Blocked or failed fetches

- sqmresearch.com.au/buychartdata.php, /products.php, /terms.php, /terms_median.php: HTTP 404 (despite appearing in search results).
- https://www.microburbs.com.au/developers/api-terms: returned a sign-in page (correct URL is /api-terms).
- Microburbs pricing and api-access rate table: did not render ("Loading...").
- https://www.htag.com.au/are-property-forecasts-accurate/: HTTP 403.
- Landgate VAR FAQ PDF: compressed PDF, text not extractable (copy saved at C:\Users\azwaa\.claude\projects\c--Users-azwaa-Documents-Ventures-Inexis-repos-property-insights\6e229272-ca83-4d82-bce4-51ed95cd17d8\tool-results\webfetch-1794614352382-u3ftvb.pdf).
- Domain API Terms and Conditions text: not found by search; Domain suburb page v2 listed no fields.
- Fetch budget (25) used; HtAG terms, developer.htagai.com/pricing, Pricefinder and PropTrack developer pages, Cotality display guidelines, Domain terms, ABS licence, TAS/ACT/NT sources, NSW CC BY page, Property Update, Hotspotting and Suburbtrends official pages were not fetched.

## Gaps and next steps

1. Email Microburbs (david@microburbs.com.au per its FAQ) asking for a written Approved Purpose covering: suburb-level figures embedded in a paid PDF sold to an individual buyer; whether a delivered PDF counts as display to an "authenticated user"; storage beyond 30 days for pre-built suburb packs; attribution format inside a PDF.
2. Ask SQM in writing if Postcode Snapshot data may be reproduced in a sold report (their marketing and terms conflict).
3. Landgate VAR is the clearest legal route for WA; get the fee schedule and whether sales evidence is covered by the VAR Data Agreement.
4. QLD: no open suburb median source found; options are broker (QVAS) products or Microburbs-style intermediaries; ask whether a broker licence allows derived reports.
5. Not confirmed: current Microburbs per-endpoint rate card, HtAG per-row rates and terms, any independent forecast audit, free official suburb data for TAS/ACT/NT, ABS open licence wording.
6. Cost sanity (Verified inputs only): at 6c for a median call, a suburb summary needing about 5 endpoint calls at 5c to 15c each is well under a dollar of data cost per report if the Secondary price examples hold; the binding constraint is licence, not price.

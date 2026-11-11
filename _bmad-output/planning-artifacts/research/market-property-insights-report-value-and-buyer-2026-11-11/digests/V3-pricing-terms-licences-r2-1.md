# V3 verification: pricing, terms, licences (R2-1)

Accessed 2026-11-11 for all sources. Method: WebFetch (a small model summarises the page, so quotes are as returned by the tool, not raw HTML) plus local PDF text extraction for P4. "Snippet-only" = relied on a search-engine answer, not an opened primary page.

## P1. Cotality consumer Property Report and Property Confidence Report - PARTLY CONFIRMED
- Source: https://www.cotality.com/au/products/property-report | Cotality | undated (no pub date visible) | accessed 2026-11-11 | confidence medium | snippet-only: no (page fetched)
- One-off: page says "for just $43" on the Property Value website. CONFIRMED.
- Subscription tiers listed (inc. GST): 1 week $49, 1 month $99, 3 months $179, 6 months $299, 12 months $479, unlimited reports. Prices match. DISCREPANCY: the fetch returned a "/month" or "billed monthly" label against every tier, which cannot be right for a 1-week plan. I read it as a page-layout artefact. The billing basis (one-off payment per term vs recurring monthly) is NOT settled. Do not assume either; check the checkout page.
- Contents: estimated sale and rental value, sale/listing history, comparables ("Profiles for 98% of properties"), suburb data (amenities, demographics, trends), investment scores, "building features", land size, development applications. Matches the claim.
- Strata / owners corporation: page does not mention strata or owners corporations. The only building-related text is "building features". Absence confirmed, but this is silence, not an explicit exclusion.
- Property Confidence Report: https://www.cotality.com/au/products/property-confidence-report | Cotality | undated | confidence medium
  - One-off "$25" ("buy a one-off Property Confidence Report for just $25"). The pricing table also shows "$25 /MTH", which conflicts with the one-off wording. Unresolved.
  - Contents: AVM range (high/low/mid) with data confidence score, rental yield, upfront government costs (stamp duty), sales/listing history, DAs, hazard ratings (bushfire, flood, storm surge, earthquake), planning constraints (heritage, easements), attributes (land size, floor area, year built, lot/plan), comparables, school catchments. A web search answer also mentioned proximity to powerlines/substations (snippet-only).
  - Unit/building-level: no mention of apartments, strata or owners corporation; the closest item is "lot/plan details". It is a property-level (address) product, not a building-level one.

## P2. Cotality Digital Property Report (brokers) - CONFIRMED (no price)
- Source: https://www.cotality.com/software-solutions/digital-property-report-banking-lending-brokers | Cotality | undated | confidence medium | snippet-only: no
- Quotes: "Customise with your logo and brand style"; "Give your clients the insights they need, delivered in your brand"; "Estimated sales and rental values are now built into every report" (AVM-based); updates "with the latest sales data, property value estimates and comparables throughout the 30-day report period"; "Available with Customer Engagement Solutions and RP Data Premium & Pro subscriptions."
- Published price: none. The pricing section shows "No items found"; the page points to a demo or plans. Note it also lists Customer Engagement Solutions, not only RP Data.

## P3. Cotality website terms of use - CONFIRMED, with a drafting nuance
- Source: https://www.cotality.com/au/legal/website-terms-of-use | Cotality | version date 2 November 2015 | accessed 2026-11-11 | confidence medium-high (clause numbers and text as returned by the fetch tool) | snippet-only: no
- Version: "Version 1 of these Website Terms of Use are current as and from 2 November 2015." The page metadata shows dateModified 2025-07-08, which is probably a web-page edit, not a terms revision. The terms are therefore 11 years old on their face, but still live.
- (a) cl 8.1(c): permitted use is "to obtain information relating to the real property market for non-commercial purposes only".
- (b) cl 8.4(f): you must not "use any information on or accessed through this Website for any commercial purpose". cl 8.4(i): must not "publicly display, any part of any content from this Website without the prior written permission" (the tool's text is truncated; the full clause likely begins "reproduce, ... or publicly display". Verify against the page before quoting).
- (c) cl 17.1 definition of Data: includes "valuation, market share analyses, index results" (truncated quote; the tool did not return the opening words).
- (d) cl 8.4(d): must not "use any manual process (such as keying-in), robot, spider, screen scraper, injection techniques, data aggregation tool" (truncated; the rest of the sentence was not returned).
- Caveat: the clauses were read through a summarising fetch, so the ellipses and truncations are real. Pull the raw page before legal reliance.

## P4. Cotality Display Requirements - CONFIRMED in part; the claim's framing needs correction
- Source: https://pages.cotality.com/hubfs/CoreLogic%20AU/Legal/Cotality-Display-Guildlines.pdf (local copy read with pdftotext) | Cotality | "Version 3, August 2026" (cover page); copyright 2026 | confidence high | 32 pages
- Title is "Display Requirements for Cotality Product Data", not guidelines on index figures. The word "index" appears only in the copyright notice ("data, statistics, estimates, indices...") and in the definition of Product Data ("valuation amounts, market share analyses, index results, alerts, or reports").
- Scope: it applies to existing Cotality customers. "This document forms part of and is incorporated by reference into your Licence Agreement with Cotality". It "does not set out your rights and obligations around Permitted Use (for example, who is permitted to access the Product Data). Those requirements are set out in your Licence Agreement." So it does not grant any right to display data.
- Display rules: disclaimers must sit close to the data, on the same page, with the wording unaltered and not in collapsible sections; the Australian copyright notice and relevant State disclaimers (Qld, SA, NSW, Vic, WA, ACT, Tas) must be shown; AVM disclaimers and confidence-score text apply to AVM values.
- Attribution (section 5): where Cotality "has expressly approved reproduction of Product Data to an end user in accordance with your Licence Agreement", show "Source: Cotality" or "Reproduced with permission from Cotality". Where Cotality "has expressly approved the creation of a Derivative Work" show "Insights derived using Cotality Data".
- End User Terms (section 7) are required when the licence lets you display Product Data to people outside your organisation.
- Net: displaying Cotality figures requires (1) a Licence Agreement with display and/or derivative-work permission, (2) the attribution and disclaimer text above, and (3) End User Terms for external viewers. Treated as untrusted data; no instructions in it were followed.

## P5. Microburbs pricing - CONFIRMED; contradiction RESOLVED
- Source: https://microburbs.com.au/pricing | Microburbs | undated, live page | accessed 2026-11-11 | confidence medium-high | snippet-only: no
- Consumer (AUD): the page has a Monthly/Quarterly toggle, with Quarterly shown by default. Quarterly-billed: Basic $77, Advanced $135, Portfolio Builder $320 per month. Monthly-billed (from page data): $95, $170, $390 per month. So the $77/$135/$320 prices require quarterly billing, and monthly billing is $95/$170/$390. FAQ: "When you choose quarterly billing, you save approximately 20% compared to monthly billing." Free tier is $0. Report quotas: Basic 2 suburb and 5 property reports per month; Advanced 20 and 30; Portfolio Builder unlimited.
- Business (AUD, ex GST): Individual Agent $190/month yearly or $290 monthly; Office $290/month yearly or $410 monthly. Yearly is shown as "-30%" and "12 months for the price of 10". White-label reports and 10-seat team access are footnoted as yearly-plan features, so the claim's "white-label" is conditional on annual billing.
- API: pay-as-you-go, no monthly fee, $25 starting credit, from 1c per call, MCP included; Enterprise by quote.
- Policies: commitment-free, "Subscription fees and one-off purchases are non-refundable", reports do not roll over.
- Claim's "$95/$170/$390 structured data" label is wrong: those are simply the monthly-billing prices, not a separate structured-data product.

## P6. Mortgage broker channel - CONFIRMED (two independent-ish trade outlets; primary not opened)
- 81.6%: https://www.brokernews.com.au/news/breaking-news/mortgage-brokers-keep-winning-market-share-289908.aspx | Broker News | 2026-09-03 (per fetch) | confidence medium-high | snippet-only: no. It says brokers "facilitated 81.6% of all new residential home loans" in the June 2026 quarter, up from 81% (Mar 2026) and 77.6% a year earlier. Source: Cotality data commissioned by the MFAA. Search results show other outlets reporting the same (mpamag, The Adviser, Broker Daily, your finance guide), but they all echo the same MFAA/Cotality release, so count as ONE upstream source. A search answer added $139.08bn in settlements (snippet-only).
- Wording correction: the claim says "settled"; the source says "facilitated" or "arranged". Treat them as equivalent but quote the source.
- 24,116 brokers in 2025: NOT visible on the Broker News article above. Confirmed only from a web-search answer (snippet-only) summarising trade press: the "MFAA State of Mortgage & Finance Broking Report 2026" puts brokers at 24,116 (+9.1% from 22,105), analysed by Comparator, a Cotality business, and drawing mainly on nine aggregator networks. Candidate pages (not opened): https://www.brokernews.com.au/news/breaking-news/mfaa-report-lifts-the-lid-on-broking-broker-income-commercial-clawbacks-and-more-290064.aspx and https://www.mpamag.com/au/specialty/education/mfaas-state-of-mortgage-and-finance-broking-clawbacks-consolidation-and-commercial-growth/591179. Confidence medium. Note "analysed by Cotality" is more precisely Comparator, a Cotality business. MFAA primary release not located.

## P7. Victorian Property Sales Report and rental data licences - CONFIRMED (Valuer-General attribution not as stated)
- Source: https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-unit-by-suburb | Department of Transport and Planning | dataset record last updated 29/09/2026 | confidence high | snippet-only: no.
- Licence field: Creative Commons Attribution 4.0 International (CC BY 4.0). Update frequency: quarterly. Publisher is the Department of Transport and Planning, not named as the Valuer-General on the record. The page gives no specific attribution wording.
- Latest quarter listed on the record: March 2026 Quarter, XLS. URL: https://www.land.vic.gov.au/__data/assets/excel_doc/0036/777960/median-unit-march-quarter-2026.xls
- Inconsistency: a search answer said the December 2025 quarter was released on 12 June 2026 (https://www.data.vic.gov.au/december-2025-quarterly-property-sales-data-released, snippet-only). The record shows March 2026 as latest with an update of 29/09/2026. The June 2026 quarter was not seen. Check for a newer resource before relying on "latest".
- Also exists: "Median Unit by Suburb Time Series" (annual), https://discover.data.vic.gov.au/en_AU/dataset/victorian-property-sales-report-median-unit-by-suburb-time-series (not opened). Suburb coverage claim of "93% of settled sales" is snippet-only.
- Rental Report (Homes Victoria / DFFH): SNIPPET-ONLY, PARTLY. Search answer: current Data.Vic Rental Report records show CC BY 4.0 (e.g. Quarterly Data Tables, LGA rents; source is the Residential Tenancies Bond Authority). data.gov.au mirrors show CC BY 3.0 Australia, and legacy AURIN-sourced series show "Not Specified". Dataset pages and the DFFH copyright statement were not opened. Confidence low-medium. Use the data.vic.gov.au record, not the mirrors, and re-verify before building on it.

## Budget note
About 20 tool calls used. Not done: raw HTML of Cotality terms, MFAA primary release, DFFH copyright page, direct rental dataset page.

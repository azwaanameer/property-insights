# D6 Rights and Risk: digest r1-1 (accessed 2026-11-11)

Scope: web research only. Not legal advice; reports what published sources say, for a lawyer to review.

IMPORTANT EVIDENCE CAVEAT: The 20-call budget was spent with roughly half the primary-source fetches blocked (REA terms 404, Domain terms 403, DEECA licensing 403, GTLaw 403, ACMA timeout). Several findings below therefore rest on the search tool's summary of a page, not on a page I read in full. Each is labelled "search-summary" in its confidence field. Treat those as leads to verify, not as quoted clause text. No REA or Domain clause text was retrieved.

## (a) Findings

### Q1. REA and Domain terms; official APIs

1. REA terms of use: NOT RETRIEVED. https://www.realestate.com.au/terms-of-use/ returned 404; a search did not surface REA's own terms. No quote available. | REA Group | n/a | accessed 2026-11-11 | confidence: none (gap) | class: terms
2. Domain terms: NOT RETRIEVED. https://www.domain.com.au/group/terms-of-use/ and https://www.domain.com.au/group/conditions-of-use/ both returned 403. The conditions URL exists (confirmed by search listing) but no clause text was read. | Domain Group | n/a | accessed 2026-11-11 | confidence: none (gap) | class: terms
3. Domain Developer API and PropTrack/REA data licence terms: NOT FOUND. A search returned only unrelated API terms (Vercel, Webflow, Ahrefs). Do not infer anything about Domain/PropTrack display or redistribution rights. | n/a | n/a | accessed 2026-11-11 | confidence: none (gap) | class: terms
4. Comparator only: Cotality (formerly RP Data) website terms prohibit "any manual process (such as keying-in), robot, spider, screen scraper, injection techniques, data aggregation tool or ... automated process (Scraping Process) to data mine, scrape, crawl, email harvest, aggregate, copy". Shows that Australian property-data vendors expressly ban aggregation by manual or automated means. | https://www.cotality.com/au/legal/website-terms-of-use | Cotality | undated | accessed 2026-11-11 | confidence: medium-low (search-summary snippet, not page-read) | class: terms
5. Comparator: PropTrack's Victorian Property Sales Report disclaimer reportedly states the State of Victoria owns copyright in the Property Sales Data. | https://www.proptrack.com.au/?p=3260 | PropTrack | undated | accessed 2026-11-11 | confidence: low (search-summary, third-party reseller) | class: terms

### Q2. Scraping: enforcement and Australian law

6. REA Group sued Domain in the Federal Court (as reported) alleging Domain scraped 181 exclusive REA listings into its Pricefinder and Insight Business platforms; REA claims IP in listing photos and floorplans. Domain says it obtained data via "legitimate contractual arrangements" and removed the 181 listings. REA statement: "Domain has systematically sourced content from a very large number of realestate.com.au listings without permission." No ruling reported; status as of 2026-11-11 unconfirmed. This is the only Australian listing-site scraping action found, and it is portal v portal (not portal v small scraper). | https://www.onlinemarketplaces.com/articles/rea-group-sues-domain-for-data-scraping-and-copyright-infringement/ | Online Marketplaces (trade press) | 2024-12-03 | accessed 2026-11-11 | confidence: medium (page read; trade press quoting AFR; >12 months old, flagged) | class: case
7. Related, older precedent: a 2019 Federal Court of Australia judgment involved a photographer's copyright claim over photographs and floor plans that RP Data obtained from REA under data licence agreements; RP Data sought indemnity from REA. Relevance: copyright in listing photos/floorplans is a live claim by photographers and portals. | https://www.judgments.fedcourt.gov.au/judgments/Judgments/fca/single/2019/2019fca2075 | Federal Court of Australia | 2019 | accessed 2026-11-11 | confidence: low-medium (search-summary only, judgment not read) | class: case
8. Reported REA anti-scraping defences exist (technical countermeasures against scraping and credential stuffing). | https://www.itnews.com.au/news/rea-group-mutates-site-scraping-credential-stuffing-defences-537873 | iTnews | date not retrieved | accessed 2026-11-11 | confidence: low (title only) | class: guidance
9. Law-firm commentary (via search summary, firm pages not readable): breach of website terms prohibiting commercial scraping is the likeliest cause of action; one firm says this "has not been judicially considered in Australia"; clickwrap terms likely enforceable; one view is that scraping facts/data is "not likely to be breaching copyright" because data is not protected as such, while photos/original text are; Privacy Act applies where personal information is collected (OAIC Clearview AI determination cited); ACL misleading conduct and computer-offence provisions may also apply. Sources named: Mallesons (screen scraping article), GTLaw (screen-scraping-legal-or-not), Sprintlaw, LegalVision. The search tool itself flagged several results as low-quality (including "2026 regulatory update" claims with no official basis). | https://www.gtlaw.com.au/insights/screen-scraping-legal-or-not ; https://www.mallesons.com/au/en/insights/latest-thinking/screen-scraping.html | GTLaw; Mallesons | dates not retrieved (likely pre-2024; flag stale) | accessed 2026-11-11 | confidence: low-medium (search-summary) | class: guidance
10. RapidAPI/Apify wrappers: no Australian legal analysis, enforcement or litigation specific to marketplace-sold listing wrappers found. Absence of evidence only.

### Q3. Open government data licences

11. Many Vicmap datasets on data.vic.gov.au list "Creative Commons Attribution 4.0 International" (Vicmap Reference Tables, Vicmap Lite, Geomark Polygon, Admin Locality, Property Simplified). | https://discover.data.vic.gov.au/dataset/vicmap-lite ; https://discover.data.vic.gov.au/dataset/182c84cd-5568-40f7-8268-790a3135a47e | Victorian Government (DEECA) | undated | accessed 2026-11-11 | confidence: medium (search-summary of catalogue entries) | class: licence
12. Not all Vicmap is open. DEECA licensing page (summarised) says many but not all DEECA datasets are open under Creative Commons, and that Vicmap products "not currently implemented by the DataVic access policy" are purchased via official data service providers; its non-open licence "does not permit the data to be commercialised or on-sold". I could not read the page (403). Vicmap Property / Address / cadastre products relevant to apartments may fall in either bucket; check per dataset. | https://deeca.vic.gov.au/maps/spatial-data/licensing | DEECA | undated | accessed 2026-11-11 | confidence: low-medium (search-summary) | class: licence
13. Victorian Property Sales Report datasets (Valuer-General Victoria; yearly summary last updated 20/01/2026, median house by suburb last updated 10/09/2025) are listed CC BY 4.0; some data.gov.au copies list CC BY 3.0 Australia. Note these are aggregate medians by suburb, not unit-level sales. | https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-time-series ; https://data.gov.au/data/dataset/5777f0a4-baf4-4ed7-ae12-2903bd9047cf | Victorian Government / data.gov.au | 2025-2026 | accessed 2026-11-11 | confidence: medium (search-summary) | class: licence
14. Homes Victoria Rental Report, City of Melbourne open data, ABS licences: NOT CHECKED (budget). Unverified.

### Q4. Financial advice regulation

15. ASIC: "You must be authorised under an Australian financial services (AFS) licence to provide financial product advice." ASIC refers to RG 244 for the difference between factual information, general advice and personal advice; general advice requires a general advice warning. | https://asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/ | ASIC | undated (footer 2026) | accessed 2026-11-11 | confidence: high (page read) | class: regulatory
16. ASIC 13-304MR: advising someone to set up or use an SMSF to buy property is financial product advice ("making a recommendation or a statement of opinion"); an interest in an SMSF is a financial product; without an AFS licence a person "can only provide factual information" on SMSFs; real estate agents "may not realise" they are giving financial product advice. | https://asic.gov.au/about-asic/news-centre/find-a-media-release/2013-releases/13-304mr-asic-warns-real-estate-industry-about-recommending-property-investment-through-smsfs/ | ASIC | 2013 (inferred from release number; >12 months, flagged) | accessed 2026-11-11 | confidence: high on content, stale on date | class: regulatory
17. Search-summary of ASIC position: direct real property is not a financial product under the Corporations Act, so advice on buying real estate itself is generally outside AFSL; the trigger is financial products (SMSF interests, managed investment schemes, unlisted property schemes). That sentence's origin is the search tool's paraphrase; I did not read the underlying ASIC text for it. | (derived from search results listing ASIC REP 6, RG 46, MoneySmart property schemes) | ASIC | various | accessed 2026-11-11 | confidence: low-medium | class: regulatory
18. ASIC RG 46 (unlisted property schemes) published 5 March 2026 exists (six benchmarks, eight disclosure principles); relevant only if the product touches schemes. ASIC REP 6 covers financial advising by real estate agents. Not read. | https://download.asic.gov.au/media/xzgfnqqv/rg46-published-05-march-2026.pdf ; https://www.asic.gov.au/regulatory-resources/find-a-document/reports/rep-6-technical-paper-on-financial-advising-activities-of-real-estate-agents/ | ASIC | 2026-03-05 / undated | accessed 2026-11-11 | confidence: low (titles only) | class: regulatory
19. ACL misleading or deceptive conduct on forecasts (s18 ACL, ACCC guidance on future representations / reasonable grounds): NOT SEARCHED; no evidence retrieved. ASIC info sheets on "property spruikers": only a consumer.gov.au spruiker warning surfaced in results (not read). INFO 225 is digital assets, not property (a wrong guess corrected).

### Q5. Victorian valuation and licensing

20. Consumer Affairs Victoria (via search-summary): anyone buying, selling or leasing property on behalf of another must hold an estate agent's licence or be an authorised representative. CAV describes an agent's estimated selling price as based on three comparable properties and "not a valuation or a guaranteed selling price". CAV published comparable-property guidelines on underquoting. These concern agents quoting prices on listings, not a third-party analytics vendor. | https://www.consumer.vic.gov.au/housing-and-accommodation/buying-and-selling-property/selling-property/selling-property-with-or-without-an-agent ; https://www.consumer.vic.gov.au/latest-news/tackling-underquoting-through-new-comparable-property-guidelines | Consumer Affairs Victoria | undated | accessed 2026-11-11 | confidence: low-medium (search-summary) | class: regulatory
21. Valuers Act 2016 (Vic) and whether an AVM or "estimated value" needs registration: NOT FOUND. The search returned only estate-agent material. Gap.

### Q6. Outbound calling to agents

22. Spam Act, Do Not Call Register (Australia), Privacy Act/APPs on agent contact details: NOT FOUND. The one search returned only US/Canada results; an ACMA fetch timed out. No Australian evidence retrieved. Unverified.

## (b) Leads worth chasing

- REA and Domain terms: read via browser or a cached copy; also check robots.txt for both. Try REA "Website Terms of Use" under realestate.com.au/terms-and-conditions or REA Group legal pages.
- Search for REA v Domain Federal Court docket (VID number) and any 2025-26 outcome; AFR coverage.
- Domain Developers portal (developer.domain.com.au) API terms; PropTrack API/data licence pages.
- Mallesons and GTLaw screen-scraping articles; Sprintlaw and LegalVision are low-tier.
- DEECA licensing page and the Vicmap Property dataset licence field on data.vic.gov.au; Victorian Valuer-General "sales data" (unit-level) availability and licence.
- ASIC RG 36, RG 244, REP 6; ASIC info sheet on "property investment seminars/spruikers"; ASIC statements on "AVM" or forecasts.
- Valuers Act 2016 (Vic) and Estate Agents Act 1980 (Vic) text on legislation.vic.gov.au; Estate Agents Act s47/s47A (statement of price/quoting).
- ACMA Do Not Call Register business-number rules; Spam Act 2003 conspicuous publication exemption; OAIC APP guidance on publicly available personal information and APP 3/7.
- ACCC "future representations" guidance (ACL s4 and s18).

## (c) Searched for and not found

- Clause text from REA terms (404) and Domain terms (403).
- Any Domain Developer API or PropTrack data licence terms.
- Any Australian enforcement against scrapers selling via RapidAPI/Apify.
- Any Australian court ruling that scraping a listing site's terms breaches contract.
- Homes Victoria Rental Report, City of Melbourne, ABS licence text.
- Valuers Act coverage of AVMs; any Victorian rule on non-agents producing "estimated value".
- ASIC statement specifically on "growth forecasts" or "yield analysis" being financial product advice.
- ACL forecast guidance.
- Australian DNCR, Spam Act, Privacy Act material on cold-calling agents.

## (d) Contradictions

- Copyright: one cited law-firm view says scraping facts is unlikely to breach copyright; another says scraping creative works does breach. These are consistent only if "data vs creative content (photos, descriptions)" is the line. REA's claim in the Domain case is over photos and floorplans, which fits that line. Unresolved in court.
- Vicmap: catalogue entries show CC BY 4.0 for many datasets, but DEECA's licensing page (summarised) says Vicmap products outside the DataVic policy cannot be commercialised or on-sold. Both can be true for different datasets; per-dataset verification needed.
- Valuer-General sales data: CC BY 4.0 on data.vic.gov.au, but PropTrack's disclaimer asserts State of Victoria copyright (not necessarily inconsistent: CC BY retains copyright with attribution). CC BY 3.0 vs 4.0 differs between copies.
- One search result attributed a Lawyers Weekly story ("nine in 10 buyers") to "November 2026"; this is an advertising-claims dispute, not a scraping case, and the date was not verified. Ignore for D6.

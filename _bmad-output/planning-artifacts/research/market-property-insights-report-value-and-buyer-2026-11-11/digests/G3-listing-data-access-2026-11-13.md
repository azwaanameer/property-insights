# G3 - How to legally obtain Australian for-sale listing data (and what it costs)

Access date for all sources: 2026-11-13. This reports what sources say; it is not legal advice.
Evidence labels: Verified = primary page read this session. Secondary = third-party/commentary page read or search snippet. Unverified = could not be read or only inferred.
Budget note: 12 searches and 12 WebFetch calls were used (2 fetches over the 10 budget, 2 of them blocked/404).

## Table

| # | Route | Allowed (per sources) | Prohibited / constrained | Price | Evidence |
|---|---|---|---|---|---|
| 1 | Domain Developer API (Agents & Listings, Properties & Locations, Property Enrichment, etc.; 13 packages) | Self-serve signup at developer.domain.com.au; sandbox + production keys; packages added after agreeing with account manager. Domain FAQ: "We encourage products and services to use Domain listings in their product." | Go-live conditions (FAQ): show "powered by Domain" logo, send stats back, provide a link to view original listing with Google UTM tag, keep agent contact and price-estimate data free of paywalls/logins. FAQ advises against storing listing data (~4,000 updates/day). Secondary (13labs, quoting T&Cs): cl 7.6(d) no licensing/selling to third parties, 7.6(g) no derivatives, 7.6(j) access/use/storage in Australia only, 7.6(k) no direct marketing, 16.5 cache temporary and delete on termination, 17.1 detail pages built on listing data must be no-indexed. Agency must authorise app for enquiry/stats data. | Not published. Plans grouped by industry or monthly call volume, "several pricing tiers" each; fees in a per-contract Product Schedule (AUD ex GST); T&Cs cap liability at AUD 5,000 (secondary). | FAQ and packages page: Verified. Clause numbers: Secondary. Full T&Cs page (domain.com.au/group/api-terms-and-conditions/): BLOCKED 403. |
| 2 | Listings Management API (Domain) | View/create/update listings; not self-serve, email api@domain.com.au for live access | Intended for agents/CRMs uploading listings, not for pulling market listings | Not published | Secondary (search snippet of developer docs) |
| 3 | realestate.com.au (REA Group) direct | No public data API. REAXML is a push feed for agents to upload listings, not a data-pull (secondary). | Terms said to prohibit scraping; robots.txt blocks sitemap access and disallows named AI crawlers; bot defences (Kasada/Cloudflare) in place (secondary). Actual REA terms page not read. | n/a | Terms: Unverified (customer-terms URL 404). Bot defences: Secondary (itnews snippet, Microburbs, 13labs). |
| 4 | PropTrack (REA Group) API | Legitimate route to REA-sourced data; endpoints include address matching, property summary, listings, transactions, valuations, market stats | Sales-gated; no self-serve keys, no free tier | Not published; subscription or consumption-based, tiered volume discounts (per its ACCC submission, via 13labs) | Secondary (13labs). PropTrack developer portal itself not read. |
| 5 | Cotality (ex CoreLogic, RP Data Pty Ltd) | Commercial API (claimed 600+ data points, 200+ filters, 24h refresh), AVM, Rental AVM, listing-related packages; Cotality has master licence deals with proptech (e.g. BuyersagentsOS, Elite Agent report) | End-user terms (per 13labs): no reselling, no incorporating data into other products, anti-scraping language (robots, spiders, screen scrapers, aggregation tools), return/destroy on termination; Display Guidelines PDF exists. Trial needs ABN and approval. | Not published; AU pricing page 404; quote per deal | Secondary (13labs, search snippets, eliteagent). Cotality terms/Display Guidelines found in search but not read. |
| 6 | Pricefinder / Domain Insight (CoStar Group) | Pricefinder says data is fed daily from Domain and Allhomes portals including current listings; Swagger API public | API licence points to Domain API terms; per 13labs requests mostly authenticate with the end user's own Pricefinder seat; API "not available for commercialisation"; Australia-only storage | Seat prices published: from AUD 90 + GST/month (investor tier, discounted from 175); API pricing not published | Secondary (13labs, Pricefinder snippet). CoStar acquisition of Domain completed 27 Aug 2025 (13labs; not independently verified). |
| 7 | Microburbs | Own scraped database of listings ("140,082 unique Buy listings"); API has 170+ endpoints, pay-as-you-go credits, free sandbox (9 sample suburbs); white-label reports option | API page shows no active for-sale listing endpoint (only stock on market, days on market); redistribution/caching/resale terms not shown on the page | Per-endpoint prices not rendered ("Loading") | Verified (own pages). Legal basis for its scraping not stated. |
| 8 | Allhomes, Homely, OpenAgent, Ratemyagent, View | No public listing data API or licence terms found. Homely has syndication/partner deals (REIWA, CRM integrations) and an Enquiries API used by InspectRealEstate. Allhomes is in the Domain group. | Access appears negotiated per deal | Not published | Secondary (search snippets only); partnership pages not read |
| 9 | Agency CRM / agency website feeds | Microburbs describes "off-market" listings sourced from agency own websites; Homely has agent-direct CRM feeds (VaultRE, Eagle). Agent-by-agent permission is the clean legal basis. | Each agency's site terms and photo/floorplan copyright (photographer/agent) still apply | n/a | Secondary |
| 10 | Open datasets | No open for-sale listings dataset found. Domain residential property data collection exists on researchdata.edu.au (academic access, not read). Sold/title data come from state Valuer-General and Geoscape G-NAF (as PropTrack sources). | Licence per dataset | Free to academic only (Unverified) | Unverified |
| 11 | Scraping portals (Apify/Scrapfly-type scrapers exist for Domain, REA, Homely) | Mallesons: could breach contract if terms prohibit commercial scraping, "not judicially considered in Australia"; clickwrap likely enforceable, browsewrap generally assumed not; no standalone database right; facts such as price generally not copyright but compilations/substantial part may be | Photos and floorplans are the live risk (REA v Domain claimed copyright in them); privacy (agent names, vendors), ACL, computer-access offences raised in commentary | Scraper tools cheap | Secondary (law-firm commentary; Mallesons most substantive) |
| 12 | User pastes a listing URL | No published Australian commentary specific to this found | Risk likely moves to the user's own access, but if the product fetches and displays the page it is automated access plus reproduction | n/a | Unverified (no source) |

## Key findings

1. There is no open, priced, self-serve route to for-sale listings. The only self-serve licensed route is the Domain Developer API (Agents & Listings), with fees negotiated by call volume and not published. REA has no equivalent; its listing data reaches third parties only via PropTrack (sales-gated) or negotiated deals.
2. Domain's go-live conditions (read on the FAQ) conflict with a paywalled report: agent contact and price-estimate data must stay free of paywalls or logins, listings need "powered by Domain" and a link back to the original with a UTM tag, and stats go back to Domain. Whether a listing snapshot inside a PDF counts as "display" or breaches caching/no-store rules is not answered on pages I could read; the full T&Cs (cl 7.6, 16.5, 17.1 per secondary source) were blocked. Needs a direct question to api@domain.com.au or the account manager.
3. The same secondary source reports Domain terms bar licensing, selling or exploiting API products for any third party, creating derivatives, and storing outside Australia. Together with "don't store listing data", a durable listing archive inside delivered reports looks hard under the standard terms; a live link-out with a lightweight cached card is the pattern the terms seem designed for.
4. Ownership changed: CoStar Group completed acquisition of Domain (27 Aug 2025, secondary). Terms and pricing for Domain API, Pricefinder and Insight may be revised; treat 2026 terms as unknown until read.
5. REA's only known enforcement here is REA v Domain (Federal Court, filed Dec 2024): alleged Domain copied 181 REA exclusive listings into Pricefinder and Insight Business, claiming copyright in photos and floorplans plus misleading conduct. Domain removed the listings; a July 2025 report (paywalled) says Domain resolved the case. Terms not disclosed. No case found against a small scraper or wrapper product, and none found of REA enforcing its terms of use against one. Earlier High Court Hardingham v REA/RP Data (2022) concerned agent-uploaded photo licensing, not scraping.
6. Cotality and PropTrack are enterprise data vendors with unpublished prices; Cotality's terms (per secondary source) forbid incorporating data into other products and mention screen-scrapers, so they are a data-enrichment route (AVM, sales, attributes), not a listings feed.
7. Competitors' practice: Microburbs scrapes Domain, View and Homely sitemaps itself (states a scrape date of 11 Feb 2026), excludes REA because robots.txt blocks it, and states no legal basis; its paid API page does not even expose for-sale listings. I found no evidence on how Hotspotting or Investor Kit source or link listings (searches returned nothing); this stays a gap.
8. Australian commentary says scraping is not per se illegal but risk is contract (untested), copyright in photos/floorplans and compilations, and privacy. Photos/floorplans and agent personal details are the highest-risk fields; price guide, beds/baths, address and status are facts with weaker copyright claims but are still caught by site terms/API licences. Lowest-risk design suggested by sources: link out to portal listing, show only fields obtained under a licence, and use no photos unless licensed.

## Sources (accessed 2026-11-13)

- Domain developer portal, API packages: https://developer.domain.com.au/docs/v2/apis/ (Verified)
- Domain developer FAQ: https://developer.domain.com.au/docs/v1/support/faq/ (Verified)
- Domain developer terms and policies pages (pointer pages only): https://developer.domain.com.au/docs/v2/support/terms ; https://developer.domain.com.au/docs/v2/support/policies (Verified, no substantive text)
- 13labs, Australian property data APIs compared: https://www.13labs.au/guides/australian-property-data-apis-compared (Secondary; source of clause numbers, PropTrack/Cotality/Pricefinder detail)
- Online Marketplaces, REA sues Domain (3 Dec 2024): https://www.onlinemarketplaces.com/articles/rea-group-sues-domain-for-data-scraping-and-copyright-infringement/ (Secondary)
- Lawyerly, Domain resolves REA Group's case over alleged data scraping (10 Jul 2025, paywalled): https://www.lawyerly.com.au/domain-resolves-rea-groups-case-over-alleged-data-scraping/ (Secondary)
- Microburbs listing coverage: https://www.microburbs.com.au/listing-coverage-blog (Verified, vendor's own account)
- Microburbs API: https://www.microburbs.com.au/api-access (Verified, vendor)
- Mallesons, screen scraping: https://www.mallesons.com/content/mallesons/au/en/insights/latest-thinking/screen-scraping (Secondary, search snippet)
- Sprintlaw / LegalVision scraping guides (marketing-grade commentary): https://sprintlaw.com.au/articles/is-web-scraping-legal-in-australia-essential-business-compliance-guide/ ; https://legalvision.com.au/scrape-data/ (Secondary, snippets)
- Cotality legal pages (found, not read): https://www.cotality.com/au/legal/end-user-terms ; https://pages.cotality.com/hubfs/CoreLogic%20AU/Legal/Cotality-Display-Guildlines.pdf
- Elite Agent, BuyersagentsOS / Cotality master licence: https://eliteagent.com/buyersagentsos-integrates-cotality-data-for-agents/ (Secondary, snippet)
- MinterEllison on Hardingham High Court: https://www.minterellison.com/articles/implied-ip-licences-high-court-rules-in-favour-of-realestate-com-au (Secondary, snippet)
- Pricefinder / Domain Insight pages (snippet only): https://www.pricefinder.com.au/?p=2867 ; https://insight.domain.com.au/solutions/pricefinder/
- Homely partnerships (snippets): https://www.onlinemarketplaces.com/articles/homely-and-reiwa-form-partnership-to-take-on-australian-big-two/

## Blocked / failed pages

- https://www.domain.com.au/group/conditions-of-use/ : 403
- https://www.domain.com.au/group/api-terms-and-conditions/ : 403 (the key document)
- https://www.realestate.com.au/customer-terms-of-use/ : 404 (guessed URL; REA terms never read)
- Microburbs per-endpoint price table: did not render

## Gaps

- Full Domain API T&Cs and Attribution/Usage policy text (caching duration, whether storing a snapshot in a delivered PDF is allowed, whether paid reports count as paywall breach, price per tier). Next step: ask api@domain.com.au / account manager; try Wayback copy of the T&Cs.
- REA Group website terms of use (actual wording on automated access) and PropTrack portal/listings endpoint terms and prices.
- Cotality listing-related package contents, Display Guidelines, prices.
- How Hotspotting, Investor Kit and other investor tools get or display listings (no evidence found).
- Final outcome and terms of REA v Domain settlement.
- Any Australian case or commentary on user-pasted URL workflows, and on use of listing data inside paid reports.
- Allhomes, OpenAgent, Ratemyagent, Homely, View data-licence programmes (no public terms).
- Unverified claim: CoStar completed Domain acquisition 27 Aug 2025; and 13labs clause numbers need checking against the primary T&Cs.

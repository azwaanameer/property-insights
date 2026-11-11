// Applies the citation-audit corrections (V4) to research.md. Each replacement must match exactly once or it is reported.
import { readFileSync, writeFileSync } from "node:fs";
const F = "_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/research.md";
let s = readFileSync(F, "utf8");
const miss = [];
const R = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) miss.push(`${n}x: ${a.slice(0, 70)}`); else s = s.replace(a, b); };

// Executive summary
R("Domain's free Building Profile for 628 Flinders St shows the building's sold prices, per-unit capital growth, rental yield on recent sales, the owner/renter split, how long owners have stayed, and every current listing [1]. That is most of sections 2 to 4 of our mock-up. It also matches our data: six of the six sales we could compare were identical on both portals [1].",
  "Domain's free Building Profile for 628 Flinders St (one 700-unit tower; a \"Log in\" link was visible, suggesting a logged-out view) shows the building's sold prices, per-unit capital growth, rental yield on recent sales, the owner/renter split, how long owners have stayed, and current listings [1]. By our internal comparison, that is most of sections 2 to 4 of our mock-up (not evidenced in this research). All six sales we could compare carry identical prices on both portals, with one date two weeks apart [41].");
R("The statutory certificate costs $166.48 to $299.63 [9], so nobody can undercut it, but a report can interpret it. A Victorian competitor (Cohabit) says it sells into this gap, though we could not confirm its Victorian product or price [11].",
  "The statutory certificate is capped at $166.48 to $299.63 [9], and the one manager checked charges exactly the cap [10], so a retrieval service has no markup room. A report could interpret the certificate. Cohabit says it has extended to Victoria and targets this gap, but that is vendor press only: we found no Victorian product page, date or price [11].");
R("No free tool we read shows this [1][3]. This is the data you already own.", "No free tool we read shows this [1][3]. We hold AirDNA data and a building register (project data, not part of this research).");
R("- **Short-stay operators and investors** (your own market): the data advantage is real and ours. *Demand evidence was not researched; this needs its own round.*",
  "- **Short-stay operators and investors** (your own market): no free tool we read shows short-stay income or building activity, and you hold that data. *Demand for it was not researched; this needs its own round.*");
R("but Cotality already gives brokers a branded client report inside tools they hold [6]", "but Cotality already gives brokers a branded client report inside RP Data Premium/Pro, which not all brokers hold [6]");
R("(Valuer-General quarterly unit medians, CC BY 4.0 [19]; Homes Victoria rents, loaded: Docklands 2-bed flat $800 a week, +6.7% on the year [38]). Cotality's growth figures cannot be reused without a licence [7][8]. **We found no suburb-level apartment forecast from any provider, and no evidence that forecasts are accurate. Do not publish projections yet.**",
  "(quarterly unit medians published by the Department of Transport and Planning from Valuer-General Victoria sales data, CC BY 4.0 [19]; Homes Victoria rents, loaded from the primary file: Docklands 2-bed flat $800 a week, +6.7% on the year [38]). Cotality's terms appear to require a licence to reuse its growth figures; confirm in writing [7][8]. **We found no suburb-level apartment forecast in the sources checked, and no independent evidence that forecasts are accurate. Do not publish projections yet.**");

// D1
R("45%/55% owner/renter split; owner tenure; 23 for-sale and the for-rent listings; 29 recent sold/rented | High (first-hand paste; a \"Log in\" link was visible, suggesting a logged-out view, unconfirmed) |",
  "45%/55% owner/renter split; owner tenure; 23 other for-sale listings plus for-rent and 29 more recent sold/rented entries | High for this building (first-hand paste; \"Log in\" link visible, logged-out view unconfirmed); other buildings not checked |");
R("**Data-quality finding for us:** our REA-via-wrapper harvest missed 4 of the 10 most recent sales Domain lists for this building (units 413, 1914, 3402, 1412). Domain's newest, 413 at $445,000 (9 Nov 2026), is below all five sales we used [1]. Our like-for-like median would fall from $510,000 to about $505,000 with it added.",
  "**Data-quality finding for us:** up to 4 of the 10 recent entries on Domain's list are absent from our REA-via-wrapper harvest (units 413, 1914, 3402, 1412). Three of them carry a price; 1914 shows no price and also sits in the for-sale list, so it may not be a completed sale [41]. Domain's newest priced sale, 413 at $445,000 (9 Nov 2026), is below the five like-for-like sales we used (lowest $495,888). Adding it would lower our median from $510,000 to about $505,000 (six values, tiny sample) [1][41].");

// D2 table and notes
R("| Cotality | Consumer Property Report; no strata or building content | $43 one-off; $49 a week to $479 a year [4] | Verified; billing basis of tiers unclear |",
  "| Cotality | Consumer Property Report; no strata or owners corporation content listed | $43 one-off; $49 a week to $479 a year [4] | Verified; billing basis of tiers unclear |");
R("| Microburbs | Agent/Office plans, white-label | $190 to $410 a month [12] | Verified |",
  "| Microburbs | Agent/Office plans, white-label (white-label on yearly plans) | $190 to $290 a month annual billing; $290 to $410 monthly billing, ex GST [12] | Verified |");
R("| Landchecker | Team plans | $62.50 / $200 per member per month [13] | Medium |", "| Landchecker | Team plans | $62.50 / $200 per member per month, annual billing, ex GST (list $82.50 / $240) [13] | Medium |");
R("| Owners corporation manager | Statutory OC certificate | $166.48 to $299.63 ex GST, set by regulation [9][10] | Verified |",
  "| Owners corporation manager | Statutory OC certificate | Maximum $166.48 to $299.63 ex GST, derived from fee units ($17.27 each); manager checked charges the maximum plus GST [9][10] | High |");
R("**Not checked:** SQM Research, Hotspotting, Propertyology, DSR Data, Suburb Trends, Archistar. Pricefinder pricing blocked.",
  "**Older vendor-sourced anchors (2024 to 2026, may be stale):** SQM Research $39.95 postcode report and $79.95 a month; Pricefinder about $99 a month; Cotality RP Data Lite $139 to $198 a month [32]. **Not checked:** Hotspotting, Propertyology, DSR Data, Suburb Trends, Archistar; Pricefinder's own plan page was blocked.");
R("they change manager registration and late-lodgement fees only, not certificates [40].", "per the notice, they change manager registration and late-lodgement fees and mention no certificate change (regulation text not read) [40].");

// D3
R("The official Consumer Affairs Victoria checklist does tell buyers to dig into minutes, sinking fund and levy history themselves [28].", "Official Consumer Affairs Victoria checklists tell buyers to dig into minutes, the sinking fund, levy history, proposed works and special levies themselves [28][34].");
R("an older Whirlpool post (each a single thread; low confidence) [29].", "an older Whirlpool post (snippet only; each a single thread; low confidence) [29][37].");
R("one Sydney strata lawyer estimates about 90% do (anecdotal, NSW, snippet-only) [30]", "a Sydney strata lawyer is quoted in a headline saying up to 90% do (anecdotal, NSW, headline only) [30]");

// D4
R("| Homes Victoria rent by suburb [38] | Suburb (moving annual) | Quarterly; June 2026 loaded | Free; CC BY 4.0 on DataVic; mirrors list CC BY 3.0 AU |",
  "| Homes Victoria rent by suburb [38] | Suburb (moving annual) | Quarterly; June 2026 loaded from the primary file | Free; CC BY 4.0 on the DataVic catalogue record [20]; some mirrors list CC BY 3.0 AU |");
R("| Valuer-General, median unit by suburb [19] | Suburb |", "| Median unit by suburb, from Valuer-General Victoria sales data (published by Dept of Transport and Planning) [19] | Suburb |");
R("| Free; **CC BY 4.0, verified on the DataVic record** |", "| Free; **CC BY 4.0, read from the DataVic catalogue record** |");
R("| Domain quarterly report [22] | Capital city and suburb |", "| Domain quarterly report [22] | Capital city; suburb not verified |");
R("**Cotality website terms bar commercial use and republishing and count index results as licensed Data [7]; display requirements apply only to existing licensees and grant no rights [8]. A licence is needed.**",
  "**Cotality's website terms appear to bar commercial use and republishing and count index results as licensed Data [7]; its display requirements apply only to existing licensees and grant no rights [8]. A licence appears to be needed; confirm in writing.**");
R("**Forecasts:** no suburb-level apartment forecast from any provider was found. A KPMG forecast of +7.1% for apartments in 2026 [23] sits against falling Melbourne prices in 2026 [22].",
  "**Forecasts:** no suburb-level apartment forecast was found in the sources checked (SQM pages could not be read; Domain, PropTrack and Cotality forecasts were not checked). A KPMG forecast of +7.1% for national apartments in 2026 [23] contrasts with falling Melbourne house prices [22]; no Melbourne unit figure was found, so the tension is not shown for the same segment.");
R("**Free growth for our six suburbs is obtainable.** Downloading the Valuer-General files needs a manual step: the state site blocks scripted downloads, so the files must be fetched in a browser.",
  "**Free growth for our six suburbs is likely obtainable, but coverage of those suburbs is unchecked.** The quarterly files have not been opened: the state site blocks scripted downloads, so they must be fetched in a browser.");

// D5
R("Macquarie: 40 sqm minimum, 80% maximum LVR in high-density postcodes, undated page", "Macquarie: small units over 40 sqm internal may be considered, 80% maximum LVR in high-density postcodes, undated page");
R("- **Channel:** brokers settled 81.6% of new home loans in the June 2026 quarter (verified) [14]; about 24,116 brokers (**unverified, snippet-only**) [15]; median gross broker revenue about $127,000 [15].",
  "- **Channel:** brokers settled 81.6% of new home loans in the June 2026 quarter (verified) [14]; about 24,116 brokers (**unverified**: the count appeared on a page one researcher read but not on the page a verifier checked) [15]; median gross broker revenue about $127,000 [15].");
R("trade advice is to gather comparables before the valuation [17].", "trade advice (low confidence) is to gather comparables before the valuation [33].");

// D6
R("- **Our REA data comes through an unofficial marketplace wrapper.**", "- **Project fact: our REA data comes through an unofficial marketplace wrapper.**");
R("Valuer-General sales and Homes Victoria rents list CC BY 4.0 [19][20].", "The Valuer-General sales and Homes Victoria rents catalogue records list CC BY 4.0 [19][20].");

// Cross-dimension
R("1. **The free building page changes the whole angle.** Our mock-up's strongest sections duplicate Domain.", "1. **The free building page changes the whole angle.** By our internal comparison, our mock-up's strongest sections duplicate Domain.");
R("The best-evidenced pain is also the hardest to serve.** Building financial health is the documented gap [28] but the source documents sit with owners corporation managers, the certificate is price-capped at $166.48 to $299.63 [9], and a competitor says it is already there [11].",
  "The best-evidenced pain is also the hardest to serve.** Building financial health is the documented gap [28] but the source documents sit with owners corporation managers, the certificate price is capped at $166.48 to $299.63 [9], and Cohabit says it is already there (unverified) [11].");
R("4. **Growth is free at suburb level but not for a building.** Domain already shows per-unit growth for a building [1], and in 628 Flinders St it is negative (-1.6% to -3.0% a year over ten years for four resales). Honest growth content is history, not forecasts.",
  "4. **Growth history is free at both suburb and building level.** Official suburb medians lag by about six months [19], and Domain's building page already shows per-unit growth [1]. Four recent resales in 628 Flinders St lost 1.6% to 3.0% a year over ten-year holds (one building, small sample). Honest growth content is history, not forecasts.");

// Recommendations
R("| 3 | Second segment: buyer's agents and investors on building risk. Test a per-report price in the $43 to $99 range and an agent plan around $190 to $290 a month. | Low: price anchors [4][12][29], no stated willingness to pay | PRD: pricing hypotheses |",
  "| 3 | Second segment: buyer's agents and investors on building risk. Test a per-report price between the data-report anchors ($25 to $45: Landchecker, Cotality, SQM) and building-report anchors ($200 to $600), and an agent plan near Microburbs' $190 to $290 a month on annual billing. ($99 is a monthly subscription, not a per-report price.) | Low: price anchors [3][4][12][29][32], no stated willingness to pay | PRD: pricing hypotheses |");
R("| 6 | Do not use Cotality index figures, and do not scrape REA or Domain, in a paid product.", "| 6 | Do not use Cotality index figures without a licence, and do not scrape REA or Domain, in a paid product.");

// Appendix rows
R("| [14] | Broker share 81.6% | [Broker News](https://www.brokernews.com.au/news/breaking-news/brokers-hit-record-high-settling-81-of-new-home-loans-289487.aspx) | 2026-09-03 | 2026-11-11 | high |",
  "| [14] | Broker share 81.6% | [Broker News](https://www.brokernews.com.au/news/breaking-news/mortgage-brokers-keep-winning-market-share-289908.aspx) | 2026-09-03 | 2026-11-11 | high |");
R("| [19] | Valuer-General median unit by suburb, CC BY 4.0, latest quarter | [DataVic](https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-unit-by-suburb) (catalogue API) | 2026-09-29 | 2026-11-11 | high |",
  "| [19] | Median unit by suburb (Valuer-General sales data), CC BY 4.0, latest quarter March 2026 | [DataVic, Dept of Transport and Planning](https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-unit-by-suburb) (catalogue API; saved in imports) | record updated 2026-09-29 | 2026-11-11 | high (licence), medium (coverage of six suburbs unchecked) |");
R("| [20] | Homes Victoria rent by suburb, licence | [DataVic](https://discover.data.vic.gov.au/dataset/rental-report-quarterly-moving-annual-rents-by-suburb-and-town) | 2026-11-10 | 2026-11-11 | medium |",
  "| [20] | Homes Victoria rent by suburb: licence field CC BY 4.0 | [DataVic, Homes Victoria](https://discover.data.vic.gov.au/dataset/rental-report-quarterly-moving-annual-rents-by-suburb-and-town) (catalogue API; saved in imports) | record updated 2026-11-10 | 2026-11-11 | high |");
R("| [38] | Homes Victoria moving annual median rent, June quarter 2026 | [DFFH](https://www.dffh.vic.gov.au/moving-annual-median-rent-suburb-and-town-june-quarter-2026) | 2026-10 | 2026-11-11 | high (primary file loaded) |",
  "| [38] | Homes Victoria moving annual median rent, June quarter 2026 (Docklands $800, +6.7%) | [DFFH](https://www.dffh.vic.gov.au/moving-annual-median-rent-suburb-and-town-june-quarter-2026) (primary xlsx, own retrieval; extract saved in imports) | 2026-10 | 2026-11-11 | high |");
R("| [35] | PropTrack branded digital reports |", "| [32] | Older vendor price anchors: SQM $39.95 / $79.95; Pricefinder about $99; RP Data Lite $139 to $198 | [SQM](https://sqmresearch.com.au/products.php); Microburbs blog; [Cotality packages](https://corelogic.com.au/legals/rp-data-packages) | 2024-2026 | 2026-11-11 | low (vendor-sourced, possibly stale) |\n| [33] | Broker advice: gather comparables before a valuation | [Domain advice](https://www.domain.com.au/advice/can-your-loan-fall-through) and Broker News (ValEx piece) | undated | 2026-11-11 | low |\n| [34] | CAV due-diligence checklist (minutes, sinking fund, levy history) | [Consumer Affairs Victoria](https://www.consumer.vic.gov.au/housing/buying-and-selling-property/checklists/due-diligence) | current | 2026-11-11 | medium |\n| [35] | PropTrack branded digital reports |");
R("| [36] | Microburbs white-label reports |", "| [37] | Older Whirlpool owners-corporation-fees thread (snippet only, page 403) | [Whirlpool](https://forums.whirlpool.net.au/archive/2463399) | undated, likely stale | 2026-11-11 | low |\n| [36] | Microburbs white-label reports |");
R("| [38] | Homes Victoria moving annual median rent, June quarter 2026 (Docklands $800, +6.7%)", "| [41] | Our REA harvest vs Domain page for 628 Flinders St (price match, missing sales, medians) | Project retrieval via RapidAPI (realestate.com.au data), saved in imports/our-rea-harvest-vs-domain-628-flinders.md | 2026-11-11 | 2026-11-11 | medium (project data; rights unestablished) |\n| [38] | Homes Victoria moving annual median rent, June quarter 2026 (Docklands $800, +6.7%)");

if (miss.length) { console.log("NOT APPLIED:\n" + miss.join("\n")); }
writeFileSync(F, s);
console.log("applied; remaining misses:", miss.length);

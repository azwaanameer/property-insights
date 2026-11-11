# V4 Citation audit: research.md vs digests and import (mismatches only)

Scope: local files only. Format: section | sentence | what the evidence says | fix. Note: the REA-side data (wrapper harvest, "five sales used") is not in this folder; the only trace is one line in .memlog.md.

## (a) Numbers or facts absent from, or different to, the evidence

1. Exec summary | "six of the six sales we could compare were identical on both portals [1]" | [1] is the Domain paste only. It confirms the Domain side (3203 $760k, 2715 $510k, 3318 $495.89k, 1212 $360k, 2416 $500k, 1309 $370k all listed). No REA prices exist in the evidence; the match rests on a .memlog.md note written by the run. | Downgrade to "Domain prices confirmed; REA match asserted in the run log, not independently evidenced".

2. D1 data-quality | "our REA-via-wrapper harvest missed 4 of the 10 most recent sales Domain lists (units 413, 1914, 3402, 1412)" | The paste list is headed "sold/rented/all" and marked "abridged". 1914 (Oct 15) has price N/A and also sits in the For Sale list at $510k-$540k, so it may not be a completed sale. 413 is N/A on the list ($445k comes only from the growth table). The harvest date is not in the evidence, so recent sales may post-date it. | "Up to 4 of 10 entries (3 with a stated price) are absent from the harvest; harvest date and sale status of 1914 unconfirmed."

3. D1 | "413 at $445,000 (9 Nov 2026), is below all five sales we used [1]. Our like-for-like median would fall from $510,000 to about $505,000" | The five-sale set and the $510,000 median are not in the evidence. The paste shows 1212 ($360k) and 1309 ($370k) below $445k, so "below all" holds only if the five exclude them. The $505k works only if the second-lowest of the five is $500k. Sample is n=5-6. | Mark "unverified, computed from inputs not in the evidence; tiny sample". Remove "[1]" from that sentence.

4. Cross-dimension 4 | "in 628 Flinders St it is negative (-1.6% to -3.0% a year over ten years for four resales)" | Figures match (-2.55, -1.56, -2.98, -2.77, rounded). But Domain's table covers four recent resales, all 10-year holds, one building. "It is negative" generalises. The same item opens "Growth is free at suburb level but not for a building" then says Domain shows it for a building, which contradicts it. | "Four recent resales in one building lost 1.6-3.0% a year"; fix the contradictory opener.

5. D4 / Exec | "Homes Victoria rents, loaded: Docklands 2-bed flat $800 a week, +6.7% on the year [38]"; [38] "high (primary file loaded)"; [20] pub date 2026-11-10 | No digest contains these figures. They appear only in .memlog.md ("own retrieval of the primary xlsx", 1,471 leases). D4 found only a Sept 2025 report and an LGA dataset updated 24/02/2026. | "Per run log, not corroborated by a digest"; drop "high".

6. D4 table, Homes Victoria | "CC BY 4.0 on DataVic"; D6 bullet "Homes Victoria rents list CC BY 4.0 [19][20]" | D6 says licence NOT CHECKED. V3 says snippet-only, low-medium, and "re-verify before building on it". | "reported CC BY 4.0 (search summary); verify on the dataset record".

7. D4 table | Domain quarterly report level "Capital city and suburb" | D4 says "suburb not verified this session". | "Capital city; suburb not verified".

8. D4 / Exec | "Cotality's growth figures cannot be reused without a licence [7][8]" | Terms were read through a summarising fetch with truncated clauses ("pull raw page before legal reliance", V3). Version dated 2 Nov 2015 on its face. Clauses cover content "on or accessed through this Website". Nothing addresses press-released index figures. [8] binds licensees only. | "appear to require a licence; confirm in writing".

9. D4 | "A KPMG forecast of +7.1% for apartments in 2026 [23] sits against falling Melbourne prices in 2026 [22]" | D4: KPMG figure is national apartment growth, from a search summary. [22] covers Melbourne houses (-3.3%) and has no unit figure. The only unit evidence (PropTrack, low confidence) says Melbourne units are 2.7% below peak. | Say "national apartments" vs "Melbourne houses"; the tension is not shown for the same segment.

10. Exec / D4 | "Free growth for our six suburbs is obtainable" | No inner-Melbourne suburb figure was retrieved. The files were never opened. D4 and V3 flag thin-market volatility and that a June 2026 quarter was not checked, so "latest March 2026" is unconfirmed. The record's publisher is the Dept of Transport and Planning, not named "Valuer-General". The 29 Sep 2026 date is the record's update date. | "likely obtainable; coverage of the six suburbs unchecked".

11. D5 | "Macquarie: 40 sqm minimum, 80% maximum LVR in high-density postcodes" | D5: studio/small unit "may be considered if over 40 sqm internal with separate bedroom", comparable sales under 50 sqm required. D5 notes ambiguity on the 80% cap. | "40 sqm as a consideration threshold".

12. D2 | [4] "no strata or building content" | V3: the page lists "building features"; it is silent on strata (not an explicit exclusion). | "no strata/OC content listed".

13. D2 | Agent/Office "$190 to $410 a month"; Landchecker "$62.50 / $200 per member per month" | $190 and $290 are annual-billing prices; monthly billing is $290 / $410 (ex GST). Landchecker figures are annual-billing, ex GST; list is $82.50 / $240. The table omits billing basis. | Add "annual billing, ex GST".

14. Recommendation 3 | "per-report price in the $43 to $99 range ... [4][12][29]" | $99 is Cotality's 1-month unlimited subscription, not a per-report price. Per-report anchors in the evidence are $43, $24.90 (Landchecker; D2 flags it as possibly outdated), $39.95 (SQM postcode report, D3). | "$25 to $45 per report; $99 is a monthly subscription".

## (b) Confidence stronger than the evidence

15. Exec | "Domain's free Building Profile ... and every current listing [1]" | The paste says "e.g." for listings, and "on the portion pasted". Logged-out status is unconfirmed. V1 says other building pages may show only an ownership split and have data errors. The headline generalises from one 700-unit tower. | Add "one building, possibly logged-out view".

16. Exec | "so nobody can undercut it" | The fees are statutory maximums; they cap price but do not stop a lower price. | Reword: "price is capped".

17. D2 | "$166.48 to $299.63 ex GST, set by regulation ... Verified" | V2: dollar values are computed (units x $17.27), ex-GST is not printed, and the regulation or gazette was not read. Corroborated by CCS arithmetic. | "high, derived from fee units".

18. D2 | "they change manager registration and late-lodgement fees only, not certificates [40]" | V2: the notice mentions no certificate change; regulation text not read. "Only" is inference. | "per the notice; text unread".

19. Exec / Cross-dimension 2 | "A Victorian competitor (Cohabit) says it sells into this gap"; "a competitor says it is already there [11]" | Vendor press only, one upstream. No product page, price or date. | "Cohabit says it extended to Victoria; unverified".

20. Exec | "Cotality already gives brokers a branded client report inside tools they hold [6]" | D5: bundled into subscriptions brokers "may already hold"; whether it is in standard RP Data Pro is an open lead. | "inside RP Data Premium/Pro, which not all brokers hold".

21. Exec / D4 | "We found no suburb-level apartment forecast from any provider" | SQM URLs were guessed and 404'd. Domain, PropTrack and Cotality forecasts were not checked. Third-party Collings suburb forecast pages exist. | "none found in the sources checked".

22. D3 | "one Sydney strata lawyer estimates about 90% do [skip]" [30] | D3 says the page 404'd; V2 says headline only ("up to 90 per cent"). | "up to 90% (headline only)".

23. Exec ("Who to aim at first") | "the data advantage is real and ours"; "This is the data you already own" | Nothing in the evidence describes our short-stay data. No short-stay income tools (e.g. AirDNA-type) were searched; D1 only notes "not found" for building-level short-stay rules. Demand was not researched. | "no free tool we read" only; drop "real and ours" or mark as internal assumption.

## (c) Source number does not match the claim

24. D5 | "(81.6% ... verified) [14]" | The appendix URL (...289487) was only a search summary in D5. V3's fetched page is ...289908 ("mortgage-brokers-keep-winning-market-share"). | Replace URL with the V3 page.

25. D5 | "trade advice is to gather comparables before the valuation [17]" | That advice comes from the ValEx/Broker News and Domain pieces (D5 item 18, low confidence), not The Adviser petition [17]. | Cite separately, mark low.

26. D3 | "official Consumer Affairs Victoria checklist does tell buyers to dig into minutes, sinking fund and levy history [28]" | D3 item 9 attributes minutes, sinking fund and levy history to CAV's /checklists/due-diligence page. D2 says [28] covers proposed works, funds raised, special levies and OC manager registration. | Add the due-diligence URL or reword.

27. D3 | "older Whirlpool post ... [29]" | [29]'s row lists only the Reddit mirror and adviser pages. The Whirlpool thread (forums.whirlpool.net.au/archive/2463399, snippet only, 403) is not in the appendix. | Add a row, flag snippet-only.

28. D2 | Pricefinder "No public price"; "Not checked: SQM Research ... Pricefinder pricing blocked" | D3 item 11 gives SQM ($39.95 postcode report, $79.95 a month), Pricefinder (~$99 a month, 2024 vendor blog) and RP Data Lite ($198 / $139 a month). | Add as stale vendor-sourced anchors.

29. D5 / [15] | "about 24,116 brokers (unverified, snippet-only)" | D5 says it fetched that page ("high"); V3 could not see the count on a different page. The evidence conflicts; the report picked the cautious reading without noting it. | Note the conflict.

## (d) Claims with no support in the evidence folder

30. Exec / Cross-dimension 1 / Rec 8 | "That is most of sections 2 to 4 of our mock-up"; "Our mock-up's strongest sections duplicate Domain" | The mock-up is not in the evidence. | Mark as internal comparison, not evidenced here.

31. D6 | "Our REA data comes through an unofficial marketplace wrapper" | Only .memlog.md and the D6 note on wrappers (no Australian analysis found) exist. | Mark as project fact.

Counts: (a) 14, (b) 9, (c) 6, (d) 2.

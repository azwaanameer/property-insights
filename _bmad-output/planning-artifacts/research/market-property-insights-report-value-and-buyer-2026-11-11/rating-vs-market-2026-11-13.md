# Critical rating: VicProp report against the current market (2026-11-13)

**Question:** how does the product rate against what the market already gives away or sells, where is it strong, and is it worth a person paying for?

**Evidence base:** nine round-2 digests in `digests/` (C1a, C1b, C2, C3a, C3b, C4a, C4b, C5a, C5b), plus round 1 (D1 to D6, V1 to V4) and the investor-lens addendum in `research.md`. Most round-2 pages were read through a fetch tool that summarises pages; several vendor pricing pages were blocked (AirDNA, Pricefinder, Domain, Allhomes, Rabbu), so prices from those are secondary. **The scores below are my judgement from that evidence, not measurements.** Re-check any price before it goes in front of a customer.

**Scale:** 0 = absent, 1 = weak, 3 = adequate, 5 = best in the market we could find.

## 1. Scorecard (our product today)

| # | Dimension | Ours | Best alternative we found | Gap and why |
|---|---|---|---|---|
| 1 | Same-building sales and comps | 2 | Domain building page, free: 4 | Our realestate.com.au route missed sales Domain shows, including a lower, newer one. Domain gives growth per unit and yield free. |
| 2 | Suburb price history and yield | 3 | Microburbs, SQM: 4 | Official, free, 463 suburbs, units only, Victoria only. Others add houses, forecasts, vacancy, daily refresh. |
| 3 | Suburb forecasts | 0 | Microburbs: 3 | None by design. Microburbs forecasts are unaudited and its own accuracy claims disagree across pages, so 3, not 5. |
| 4 | Short-stay income estimate | 3 | AirDNA, AirROI: 4 | Per-address estimates are free elsewhere (AirDNA Rentalizer, AirROI, Airbtics, Collings). An estimate alone does not differentiate. |
| 5 | Short-stay building context (who operates here, how many) | 3 | None found: 0 to 1 | Our building register is the one layer no one else showed. Limited to buildings we have seen, and permission is still unknown. |
| 6 | Building finances and condition | 0 | Cohabit: 3 | Cohabit says it extended to Victoria in August 2026 and its AI report reader is free. We have nothing here. |
| 7 | Planning and overlays | 3 | Landchecker: 5 | Landchecker's free report already covers zones, overlays and bushfire nationally; a premium report is $24.90. |
| 8 | New supply pipeline | 3 | Microburbs supply pressure: 3 | Ours is site-level for central Melbourne only. Comparable, not clearly better. |
| 9 | Where-else suburb screening | 2 | Microburbs Suburb Finder: 4 | 26 suburbs, two measures, Victoria only. |
| 10 | Price-driver analysis | 2 | Cotality AVM: 3 | A regression on 599 sales is interesting and honest but small. |
| 11 | Clarity and evidence labelling | 4 | Portals and Cotality: 3 | Our strongest craft point (certainty labels, gaps shown as gaps). Easy for others to copy. |
| 12 | National coverage | 1 | Microburbs, Cotality, Landchecker: 5 | Victoria only. |
| 13 | Data-rights cleanliness | 2 | Official-data vendors: 4 | Realestate.com.au wrapper, AirDNA resale terms and the pasted Domain page are all unresolved. |
| 14 | Proof of accuracy and trust | 1 | No vendor has audited accuracy: 2 | One sample property, no customers, no backtest. |

**Average, ours: about 2.1 out of 5.** Read it as "a sharp prototype with a few distinctive layers", not as a finished product.

## 2. Where we are strong (the evidence)

1. **Building-level short-stay intelligence.** No portal, no investor tool and no short-stay tool in the evidence shows how many short-stay operators run in a given building. There is also no public register of which buildings allow short stays [C3b]. This is our clearest gap in the market.
2. **The joined view.** No tool in the evidence joins official suburb history, rents, supply, planning, short-stay and building evidence on one page with certainty labels. Each competitor covers a slice.
3. **Official Victorian layers, free and reusable (CC BY).** Valuer-General medians and Homes Victoria rents give us suburb history at no licence cost.
4. **Honest gaps.** The report says "unknown" and shows conflicts. Review sites show real frustration with reports that look authoritative and are wrong (RP Data reviews, anecdotal) [C5a].
5. **Our own operating data.** City Retreats runs units in these buildings. Actual revenue and occupancy are ground truth that no competitor has, and no vendor publishes independent per-address accuracy [C3a]. **This is an idea, not researched.**

## 3. Where we are weak

1. **Victoria only.** Outside Victoria no state was found publishing free suburb median sale prices with a house/unit split: NSW gives raw sales to self-compute, SA gives houses only, WA suburb sales are paid, QLD, ACT and TAS not found. Rents are better (NSW bond data by postcode, CC BY; QLD RTA by suburb and type, licence unstated). Planning is clean in NSW and SA (CC BY). WA's planning licence is restrictive. Our growth section would need a paid national source elsewhere [C5b].
2. **Commodity layers.** Comps, planning, per-address short-stay estimates and suburb basics are free or cheap elsewhere.
3. **The building finance gap is open, but Cohabit is moving in.** Victoria's owners corporation certificate has about 3 items against 14 interstate (Cohabit's framing), and the certificate fee is $166.48 standard or $299.63 for two days [C4b]. Cohabit has $1.2M of seed funding and a free reader; it is a small competitor, not a large one.
4. **Nobody has validated demand.** No survey of investor research spend was found. The evidence is indirect [C5a].
5. **Rights.** See row 13.

## 4. What the market charges (price ladder)

| Tier | Examples (date seen 2026-11-13) | Who it is priced for |
|---|---|---|
| Free | Domain building page, ANZ and bank reports, Landchecker free report, AirDNA and AirROI estimators, Cohabit AI reader, SQM free pages, HtAG Eve | Everyone |
| $10 to $45 one-off | AI contract readers $10 to $29; Landchecker premium $24.90; Cotality report $25 to $43 | Individual buyers |
| $77 to $135 a month | Microburbs consumer plans | Investors |
| $129 to $320 a month | SQM Property Explorer; Cotality RP Data $180 to $320 | Investors, brokers, agents |
| $190 to $500 a month | Microburbs agent plans; Hotspotting $299 and $500 (buyer's-agent tiers, most popular is $500) | Buyer's agents, advisers (white-label reports) |
| Per-address cost inside a deal | OC certificate $166 to $300; conveyancer $900 to $2,000; buyer's agent $10,000 to $18,000 or 2 to 3% | Context |

## 5. Is it worth a person paying for it?

| Customer | Verdict today | Why |
|---|---|---|
| **An individual buyer or renter** | **Not at a premium price.** Roughly $15 to $30 is the ceiling the market shows, and most of our content is free elsewhere. | Free portal, bank and Landchecker reports cover comps and planning. Cheap AI contract readers exist. One anecdotal source says up to 90% of apartment buyers skip strata reports even when cheap, weak evidence of low willingness to pay [C4b]. |
| **A buyer's agent, investor adviser or short-stay operator** | **Plausible, unproven.** A white-label report around $99 to $300 a month fits where the market already charges ($190 to $500). | The premium tiers are priced for these buyers. Landchecker reports 8,000 paying users in 2,800 organisations, mostly professional [C5a]. But no first-person willingness-to-pay evidence was found for our layers. |
| **A mortgage broker** | **Weak.** | Cotality already bundles a branded client report in RP Data. No evidence of brokers buying per-address reports from a startup [round 1]. |
| **City Retreats itself (internal)** | **Yes, the strongest case today.** | Short-stay and building context is your core business. It speeds call-or-skip decisions on units. |

**Bottom line:** the product is worth building and using now for your own acquisition work, and it is a credible product for professionals if it narrows to the building and short-stay layer plus a branded PDF. As a general consumer report it does not beat what is free.

## 6. Corrections to earlier research

- Round 1 said no free tool we read shows short-stay income. **That is no longer true:** per-address estimates are free from AirDNA, AirROI, Airbtics and Collings. What stays rare is the building-level operator picture and the permission status.
- Round 1 said Cohabit's Victorian extension was vendor press only. Round 2 found trade-press coverage (REB, 20 to 21 August 2026) saying Cohabit extended to Victoria. Still no paid price was found.
- Round 1 said we had no free growth source. We now hold the Valuer-General time series.

## 7. What would change the verdict (cheapest tests first)

1. **Calibrate our short-stay estimate against City Retreats' actual bookings** for units we operate. A published accuracy record would beat every vendor's self-reported 95% to 99%.
2. **Show the report free to 8 to 10 buyer's agents and short-stay investors** and ask what they would pay and what they would change. This is the missing demand evidence.
3. **Add the Victorian short-stay rules as facts:** 7.5% levy on booking fees for stays under 28 days (since 1 January 2025, State Revenue Office), owners corporation may ban short stays by 75% special resolution (since 1 January 2025, Consumer Affairs Victoria), and the principal-residence exclusion [C3b].
4. **Check Cohabit's Victorian product and price** before investing in building finance.
5. **Settle data rights** for the realestate.com.au route and AirDNA resale.
6. **Plan national coverage through a paid national source for suburb data** (Microburbs publishes an API from 1 cent a call; terms unchecked) and keep our own layers on top.

## 8. Limits of this rating

- The scores are one analyst's judgement and have not been tested with customers.
- Several vendor prices come from search summaries because pricing pages were blocked.
- Competitor accuracy claims are all self-reported.
- The planning-tools digest (C4a) did not cover PropertyShark, Prophet, Geoscape or Pricefinder as consumer tools; its two main subjects were Landchecker and Archistar. Landchecker has no published user count and almost no independent reviews, so its quality is unmeasured.

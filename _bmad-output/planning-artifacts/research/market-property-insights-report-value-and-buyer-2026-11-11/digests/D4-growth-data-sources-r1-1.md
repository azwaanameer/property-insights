# D4 Growth and projection data sources (r1-1)

Accessed 2026-11-11. Budget used: about 18 tool calls, one round plus partial follow-up. Evidence is THIN in places: several primary pages returned 403/404 or only search-engine summaries. Items marked "answer-engine summary" are unverified until the primary page is read.

## (a) Source table

| source | geography | unit vs house | frequency | latest release seen | access | licence/reuse |
|---|---|---|---|---|---|---|
| Valuer-General Victoria, Victorian Property Sales Report (VPSR) | suburb (Melbourne metro, country, state summary) | separate median unit / house / vacant land tables | quarterly, with 15 months shown; lagged about 6 months | Dec 2025 quarter data released June 2026 (Mar 2026 quarter may exist; not confirmed) | free Excel + PDF commentary; DataVic datasets | DataVic listing reported CC BY 4.0 (search summary only); the DataVic release page did not state a licence on fetch. Verify. |
| Homes Victoria Rental Report (DFFH, from RTBA bond data) | suburb = moving annual median; LGA = moving quarterly median | by dwelling type in report (not verified) | quarterly | Sept qtr 2025 report found; DataVic LGA dataset last updated 24/02/2026; later reports not found | free Excel / Word | Not retrieved. Likely DataVic CC BY; unverified. |
| ABS Total Value of Dwellings | national, state, capital city vs rest of state | all dwellings (no house/unit split described on page) | quarterly | June qtr 2026, released 8 Sep 2026 | free XLSX | Page links to a Creative Commons section; text not retrieved. |
| ABS Residential Property Price Indexes | not fetched | not fetched | quarterly | not fetched | not fetched | not fetched |
| Domain House Price Report | capital city, suburb (suburb not verified this session) | house and unit | quarterly | Sept qtr 2026 (press coverage dated 22 Oct 2026) | free report; terms not fetched | not retrieved |
| PropTrack Home Price Index | national, capitals; finer geography not verified | house and unit | monthly | Oct 2026 report reported by answer engine; direct URL for it 404'd | free report | PropTrack terms not found |
| Cotality Home Value Index | city, region; suburb in paid products (not verified) | house and unit (hedonic) | monthly, daily | not fetched directly | free headline; detail paid | Website terms: non-commercial only; see findings |
| SQM Research | suburb pages, forecasts | house and unit | monthly | not retrieved (terms page 404, forecast page 404) | free pages / paid | not retrieved |
| REA/Domain free suburb profiles | suburb | house and unit | rolling | not fetched | free web | not fetched |

## (b) Findings

1. The VPSR publishes median unit price by suburb, quarterly, covering 93% of settled sales statewide. The Dec 2025 quarter set has four datasets: yearly summary, median house, median unit, median vacant land. Metro Melbourne median unit price rose 1.6% to $640,000 that quarter (search summary). https://www.data.vic.gov.au/december-2025-quarterly-property-sales-data-released | Valuer-General Victoria via DataVic | Dec 2025 data, release June 2026 | accessed 2026-11-11 | confidence medium (page fetched; the $640,000 figure is from the search summary) | statistic

2. VPSR lag: settlements can take 120 days or more, so the latest quarter is revised and the free data trails the market by about 6 months (Dec 2025 data released June 2026). https://www.land.vic.gov.au/__data/assets/pdf_file/0028/773740/vpsr-dec2025-data-released-june2026.pdf (403 on fetch; file name and search summary only) | Valuer-General Victoria | June 2026 | accessed 2026-11-11 | confidence medium-low | methodology

3. VPSR licence. A search summary reports the DataVic "Median Unit by Suburb Quarterly" record is CC BY 4.0. The DataVic release page fetch said no licence was stated and links to the DataVic Access Policy. If CC BY 4.0 holds, commercial reuse in a paid report is allowed with attribution. This still needs a direct read of the dataset record. https://researchdata.edu.au/victorian-property-sales-suburb-quarterly/3901632 | Research Data Australia / DataVic | undated | accessed 2026-11-11 | confidence low-medium | licence

4. Homes Victoria Rental Report: suburb rents are moving annual medians; quarterly medians are LGA only. Source is rental bonds (RTBA), based on new lettings. Sept qtr 2025: metro Melbourne median $580/week, +3.5% annual (search summary). https://discover.data.vic.gov.au/dataset/rental-report-quarterly-quarterly-median-rents-by-lga and https://www.dffh.vic.gov.au/publications/rental-report | DFFH / Homes Victoria | DataVic last update 24/02/2026 | accessed 2026-11-11 | confidence medium | statistic

5. ABS Total Value of Dwellings: latest is June qtr 2026, released 8 Sep 2026. Table 2 gives median price and transfers by capital city and rest of state. The page does not show a suburb, SA2 or unit-specific split. Mean price for Australia was $1,100,400. https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/latest-release | ABS | 8 Sep 2026 | accessed 2026-11-11 | confidence high | statistic. The ABS is useful for the macro level only, not suburb.

6. Cotality website terms (version dated 8 July 2025) restrict reuse. Clause 8.1(c) allows use "to obtain information relating to the real property market for non-commercial purposes only". Clause 8.4(f) prohibits using "any information on or accessed through this Website for any commercial purpose". Clause 8.4(i) prohibits copying or publicly displaying "any part of any content". Clause 13.2 bars publishing "in any form by any process without our written consent". Clause 17.1 defines Data to include "index results". These are fetcher paraphrase and partial quotes of the page, so the exact wording needs a re-check. A paid report that reproduces Home Value Index figures would need a written licence or Cotality's display guidelines. https://www.cotality.com/au/legal/website-terms-of-use | Cotality | 2025-07-08 | accessed 2026-11-11 | confidence medium-high | licence

7. Cotality has a separate "Display Guidelines" PDF (redirect from cotality.com/displayguidelines). The PDF could not be text-extracted in the fetch. A copy is saved locally at C:\Users\azwaa\.claude\projects\c--Users-azwaa-Documents-Ventures-Inexis-repos-property-insights\6e229272-ca83-4d82-bce4-51ed95cd17d8\tool-results\webfetch-1794378789074-99qurt.pdf (not read, per brief). https://pages.cotality.com/hubfs/CoreLogic%20AU/Legal/Cotality-Display-Guildlines.pdf | Cotality | unknown | accessed 2026-11-11 | confidence n/a | licence. Gap.

8. Domain Sept 2026 report: Melbourne house median $1.01m, -3.3% quarter, -6.7% from the Dec 2025 peak. A Melbourne unit figure was NOT in the coverage. Combined-capitals unit median $702,858, -3.5%. https://www.theurbandeveloper.com/articles/domain-home-prices-q3-2026-record-decline-all-capitals | The Urban Developer (reporting Domain) | 2026-10-22 | accessed 2026-11-11 | confidence medium (secondary) | statistic

9. PropTrack (answer-engine summary of the Oct 2026 report): Melbourne -0.1% in the month, -6.1% year on year and 6.1% below the Oct 2025 peak. Melbourne units were 2.7% below peak in Sept 2026 versus 6.6% for houses. I could not open the primary PDF or page. https://www.proptrack.com.au/insights-hub/proptrack-home-price-index-october-2025/ (prior-year report; Oct 2026 URL 404'd) | PropTrack | Oct 2026 | accessed 2026-11-11 | confidence low | statistic

10. Cotality-based secondary source (via search summary): Melbourne median unit value $624,740, -2.2% quarter. Unverified, no date. | confidence low | statistic

11. Forecasts. No suburb-level apartment forecast from SQM was found. A search summary showed the Collings site hosting suburb "price forecast 2026-2027" pages whose data came from DataVic/REIV rather than SQM. Those forecast pages appear to be third-party and machine-styled. KPMG forecast national apartment growth of 7.1% in 2026 (search summary, KPMG media release dated 2026/01), which sits against falling prices in 2026 (see findings 8 and 9). https://kpmg.com/au/en/media/media-releases/2026/01/house-prices-to-rise-in-2026-despite-interest-rate-uncertainty.html | KPMG | Jan 2026 | accessed 2026-11-11 | confidence low-medium | forecast

12. Track record. No independent accuracy study was found. Critics (HotSpotting, a commercially interested property marketer) cite ANZ's 2020 call of -13%, ANZ's Aug 2022 call of -14% for Sydney, and NAB's 2019 call of -3.8%, all reported as wrong. Treat as an advocacy source. https://www.hotspotting.com.au/economists-keep-getting-it-wrong-but-wont-admit-it/ | HotSpotting | undated | accessed 2026-11-11 | confidence low | forecast

13. Methodology (from the data itself). The VPSR is a median of settled sales and is revised for recent quarters. Cotality publishes a hedonic index (NZ page describes it; AU assumed same, unverified). Different providers disagree on definitions (median vs hedonic vs stratified). Small-suburb unit medians are volatile. One example from the search summaries: the Collings pages show Moorabbin unit median +27.0% quarter on quarter and Blackburn South -24.2% year on year, from DataVic/REIV data, which suggests median noise in thin unit markets. That is not an inner-Melbourne case, and the pages are third-party. https://www.collings.com.au/moorabbin-property-price-forecast-2026-2027/ | Collings | 2026 | accessed 2026-11-11 | confidence low | methodology

## (c) Leads worth chasing

- Read the VPSR Dec 2025 (and any Mar 2026) Excel directly via data.vic.gov.au (the land.vic.gov.au pages return 403 to the fetcher). Pull Melbourne, Southbank, Docklands, St Kilda, South Yarra, Port Melbourne unit medians. This would answer question 5.
- Open the Cotality Display Guidelines PDF with a PDF reader and read the quote and attribution rules for index figures. Ask Cotality about a commercial licence.
- Check the data.vic.gov.au dataset records for licence text (CC BY 4.0) for VPSR and the Rental Report, plus DFFH site copyright.
- ABS Residential Property Price Indexes and ABS copyright page (CC BY 4.0 expected, unverified).
- Domain and PropTrack terms of use and whether Domain's report has suburb tables.
- SQM Research real URLs (terms, forecasts); my guessed URLs 404'd.
- Treasury, RBA and bank forecasts (Westpac, CBA, NAB): not searched.

## (d) Searched for and not found

- PropTrack terms of use / republishing rules (search returned other vendors).
- SQM terms, SQM forecast page, any SQM suburb unit forecast.
- Domain terms of use; Domain Melbourne unit median for Sept 2026.
- Inner-Melbourne suburb unit growth figures (Southbank, Docklands, etc.) from any source this session.
- Any independent accuracy study of Australian price forecasts.
- Any direct example of two providers disagreeing for an inner-Melbourne unit market.
- Any provider offering suburb-level apartment forecasts with disclaimer text (only third-party Collings pages seen).
- Rental Report releases after Sept 2025.
- REA/Domain suburb profile terms; ABS RPPI.

## (e) Contradictions

- Melbourne unit price level and trend: PropTrack summary says units 2.7% below peak (Sept 2026), Cotality-based summary says unit median $624,740 and -2.2% quarterly, Domain gives no Melbourne unit figure. Different definitions and unverified secondaries; both not comparable, not averaged.
- VPSR metro unit median $640,000 (Dec 2025 quarter, median of sales) versus Cotality-based $624,740 (undated, hedonic-style value). Different method and date.
- KPMG forecast of +7.1% apartments in 2026 versus 2026 data showing Melbourne prices falling.
- DataVic licence: a search summary says CC BY 4.0; the fetched release page showed none.

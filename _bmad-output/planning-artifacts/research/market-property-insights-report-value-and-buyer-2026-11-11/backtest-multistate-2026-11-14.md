# Multi-state backtest of the conditions rating (2026-11-14)

Script: `scripts/36-backtest-multistate.py` (series from `scripts/33`, `34`, `35`). Output: `data/backtest_multistate_results.json`. Own sources only (ABS Census and SEIFA, state price and rent files). No vendor forecasts. All numbers below are from that run; nothing here is a prediction.

## Design

- Markers are measured at a Census origin (2016 or 2021). Outcomes are growth after it (3 to 5 years), using 2-year smoothed medians. NSW rents are unsmoothed (data starts 2021).
- Markers tested: owner share, flat share, unoccupied share, household income, median age, rent-to-income, mortgage-to-income, SEIFA IRSAD, price or rent level.
- The a-priori rating is fixed before results: higher owner share, lower flat share, lower unoccupied share.
- A second rating used markers chosen on training windows (2016 origin) and was scored on held-out windows (2021 origin). It selected owner share and median age.
- "Pairwise" is the chance that a random suburb from the top fifth by score grew faster than a random one from the bottom fifth. 50% is no skill.

## Results (a-priori rating, pairwise)

| Market | Windows | Pairwise range | Read |
|---|---|---|---|
| VIC unit price | 4 | 74% to 80% | Works in all four windows |
| VIC house price | 4 | 58%, 60%, 78%, 85% | Weak 2016 origin, strong 2021 origin |
| SA house price | 4 | 36% to 54% | No skill; reversed for 2016 origin |
| SA flat and house rent | 8 | 49% to 58% | No skill |
| QLD flat rent | 2 | 35%, 37% | Reversed |
| QLD house rent | 2 | 52%, 54% | No skill |
| TAS flat and house rent | 4 | 52% to 56% | No skill |
| NSW flat and house rent (postcode, 2021 origin only) | 4 | 17% to 38% | Reversed |

Held-out mean across 22 windows: a-priori 52%, selected-marker version 47%. Fewer than half of the windows come from Victoria, and Victoria is where nearly all the skill sits.

## What the markers do outside Victoria

- Owner share, flat share and income flip sign between states and between periods.
- Price level was the strongest single marker in every 2021-origin window: cheaper suburbs grew faster (VIC units rho -0.45 to -0.55, VIC houses -0.66 to -0.73, SA houses -0.66, QLD houses -0.56, TAS houses -0.87). In SA's 2016-origin windows the sign was the opposite (+0.34 to +0.36). This looks like a 2021 to 2025 affordability catch-up, not a stable rule.
- NSW rents 2021 to 2025: owner share is strongly negative (-0.54). Inner-city rents were at a pandemic low in 2021 and rebounded, so a 2021-origin rent test mostly measures the rebound. The same caution applies to VIC and QLD flat-rent windows.

## What this means

1. **The conditions rating is validated for Victorian apartment suburbs only** (74% to 80% against a 50% coin-flip). It is not validated for Victorian houses in all periods, or for SA, QLD, NSW or TAS.
2. **A 70% to 80% reliability claim cannot be made outside Victoria on this evidence.** The markers we hold are structural and do not capture the drivers of 2021 to 2025 growth elsewhere.
3. **Untested markers** with available data: SA2 population growth and projections, building approvals relative to stock, yield and affordability, vacancy (no free source), infrastructure events (no location data).
4. Outside Victoria the report should show these as a descriptive market profile (owner share, rents, approvals, population) and not as a rating, until a state-specific test passes.

## Limits

- Census suburbs (SAL, SSC) differ in boundaries between 2016 and 2021 and from price-file suburb names; matching is by normalised name.
- SA house prices use sales-weighted quarterly medians; SA, QLD, TAS and NSW rents are new-letting medians, not moving medians.
- Outcome windows are short and overlapping; 2021 to 2025 may be one regime.
- Rent outcomes are an indirect test for price growth.

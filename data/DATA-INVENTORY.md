# Raw data inventory (2026-11-14)

`data/raw/` is gitignored. This file records what is in it. Contents were checked by file structure (sheet names, headers, sample rows), not analysed. Licences are from the research digests H1 to H4 in `_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11/digests/`.

## Layout

```
data/raw/
  national/  census-2021, census-2016, abs-geography, abs-api, abs-building-approvals-sa2-cubes,
             macro-rba-abs, gnaf, jobs, seifa, infrastructure-australia
  vic/ nsw/ qld/ sa/ wa/ tas/ nt/ act/   one folder per topic inside each state
  _duplicates/                           byte-identical re-downloads, safe to delete
  (left in place, scripts read them)     rp/, domain/, suburb/, microburbs_sandbox_vic.json,
                                         microburbs-openapi.json, pl_*.json, vm_*.json
```

Scripts 14, 17, 24, 25, 26, 27, 30 and 31 were repointed to the new paths. Script 31 and 25 were re-run and reproduce the earlier results.

## What each state has

| State | Prices | Rents | Population (SA2 unless noted) | Transit | Other |
|---|---|---|---|---|---|
| National | | | ABS population 2011-2025, Census 2016 and 2021, SEIFA, building approvals monthly from 2021-07 | | G-NAF address file (all states), Jobs in Australia 2022-23, RBA and ABS macro, Infrastructure Australia 2026 list (PDF) |
| VIC | Houses and units by suburb 2015-2025, quarterly to Mar 2026 | Suburb, since 2000 | VIF2023 | GTFS | City of Melbourne buildings (age, floors), dwellings, development monitor, building permits; state infrastructure pipeline xlsx |
| NSW | None (sales licence needed) | Postcode, record level, 2021 to Oct 2026 | 2024 projections at SA2 | None (needs key) | Suburb crime; infrastructure pipeline xlsx (no locations) |
| QLD | None | Suburb and postcode, from 2012 and 2017 | 2025 projections at SA2 | SEQ GTFS | QTRIP road program csv |
| SA | Houses by suburb, quarterly 2015 to Q3 2026 | Suburb, house vs unit, 2008 on | SA2 projections (2016 base, old) | Adelaide GTFS | Suburb crime csv |
| WA | None | None | WA Tomorrow forecasts at SA2 | Perth GTFS (licence silent on commercial use) | Bushfire-prone areas |
| TAS | None | Suburb, bond records 2016 to Jun 2026 (Jul 2024 to Jun 2025 missing) | LGA only | None | |
| NT | None | None | Regional areas only | Darwin GTFS | |
| ACT | None | None | None beyond national | None | |

## Known problems

- NSW infrastructure workbook was downloaded three times (identical); one kept.
- G-NAF: both GDA94 and GDA2020 versions are present, 1.85 GB each. One can go.
- Licence text for G-NAF is not in the zip. The use restriction is unread.
- NSW rental bond licence: portal says CC BY, live page says nothing.
- Empty folders left by the move (`abs`, `dffh`, `vgv`, `gtfs`, `growth`, `com`, `macro`, `gnaf`, `infra projects`, `nsw/lodgements`, `sa/median`, `sa/rent`) could not be removed by me; delete by hand.
- Nothing downloaded for flood layers, DA data outside NSW/ABS, school data (permission needed), or event and infrastructure locations.

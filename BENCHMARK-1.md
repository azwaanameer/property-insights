# Benchmark 1: what we could test without paid keys (2026-11-11)

Source addresses: 1,899 apartments in the City Retreats CRM (Neon `properties` table, read-only).
Scripts: `scripts/01-…03-*.mjs`. Raw responses: `data/raw/` (git-ignored). Results: `data/*.json`.

## 1. Official address spine (Vicmap Address, free, no key)

| Result | Count | Share |
|---|---|---|
| Exact unit match (unit number + building) | 1,737 | 91.5% |
| Building matched, unit number not found | 109 | 5.7% |
| No building match | 31 | 1.6% |
| Address text unparseable | 22 | 1.2% |

- 441 distinct buildings had at least one exact unit match.
- Each matched unit returns `property_pfi` (property ID), mesh block, LGA, postcode and coordinates.
- Remaining misses are data-quality cases: suffix variants (`1612a` vs `1612`), street numbers that don't exist
  in Vicmap (`344 City Road`), and ranges (`23-33 Lonsdale`). Needs a human-review queue, not more matching code.
- Sample of 56 stratified addresses: 54 exact, 2 building-only.

## 2. Planning and parcel (Vicmap WFS, free, no key), 49 sample buildings

- Zone, overlays and parcel resolved for 49 of 49 building points.
- Zones: CCZ1 (13), CCZ3 (11), MUZ (5), DZ2/ACZ1/DZ3/DZ4/GRZ1 (2-3 each).
- 46 of 49 buildings intersect at least one overlay (DDO 40, PO 36, LSIO 17, DPO 9, HO 5, SCO 5).
- Gotcha: the spatial filter must be `INTERSECTS(geom, SRID=4283;POINT(lon lat))`. Plain `POINT(lon lat)` returns nothing.
- This is a point-in-polygon screen, not a legal planning certificate.

## 3. Microburbs (public `test` sandbox only)

- The sandbox is limited to 8 fixed properties and ~9 suburbs, so it cannot run our addresses. Our addresses need a paid key.
- 51 of 51 property endpoints returned data for the sandbox VIC property (St Kilda house). Payloads saved in
  `data/raw/microburbs_sandbox_vic.json`.
- Useful shapes seen: AVM with an 80% range and 0-100 confidence; comps carry `same_building`, `distance_m`, `gnaf_pid`;
  sale history includes "Sold" and "For Sale" events; zoning and 14 risk layers.
- Gaps seen: `rent-history` returned dates with null prices; comp rows had mixed populated/null duplicate fields
  (`price` vs `sale_price`); several endpoints return `available:false` for some properties.
- Per-call prices from the OpenAPI spec (currency not stated in the spec; confirm USD vs AUD):
  geocode 1¢, AVM 10¢, sale-history 30¢, rent-history 30¢, recent-sales-nearby 4¢, cma-comp-set 60¢, zoning 3-5¢, profile 3¢.
  Lean report bundle (geocode+AVM+sale-history+rent-history+nearby sales) ≈ 75¢. Adding cma-comp-set + zoning ≈ 1.43.
  A 50-address benchmark ≈ 40-75 in the published currency.

## 4. RapidAPI (existing CRM key)

- Key is valid (AirDNA host responds) but is **not subscribed** to `realty-in-au`, `domain-com-au`,
  `domain-com-au-scraper` or `domain-com-au1`. Each returned "You are not subscribed to this API."
- Free-tier subscription is a one-click action in the RapidAPI dashboard under your account.

## 5. RapidAPI `realty-in-au` (API Dojo, realestate.com.au data), live results

Subscribed on the free plan: 500 requests/month. This run used about 120. Endpoints that work:
`/auto-complete`, `/properties/list` (channel=rent|sold|buy; `surroundingSuburbs=false` is essential,
otherwise Docklands returns 2,932 rentals instead of 250), `/properties/detail?id=`.

Harvested: 2,490 rental listings (all pages, 6 suburbs) and the newest 150 sold listings per suburb (900).

| Field | Rent | Sold |
|---|---|---|
| Unit-level address (`1104/915 Collins St`) | 92.7% | 90.9% |
| Price / beds / parking / coordinates | 100% / 100% / 100% / 99% | 100% on all |
| Agent name + phone | 99.9% | 100% |
| Bond | 87.4% | n/a |
| Sold date; undisclosed prices | n/a | 100%; 0 undisclosed |
| Joins to a Vicmap unit (property ID) | 86.3% | 96.3% |

- Unit-address coverage is weakest in Port Melbourne (52% rent, 69% sold) and South Yarra (82% rent), where houses and
  townhouses dominate.
- Sold feed is fresh (newest sale 10 Nov 2026) and shows real prices. The newest 150 sales per suburb span 60 days (CBD)
  to 301 days (Port Melbourne), so deep history means more pages (30 per call).
- Same-building comps: 30 of 49 sample buildings had at least one same-building sale inside that window; large towers
  had 5-7. 19 had none, so older sales need deeper paging or another source.
- Rent vs CRM, like-for-like (2 bed, <=$1,000/wk, apartment/unit, i.e. the scraper criteria): 1,048 REA listings, 447
  (42.7%) already in the CRM, **601 not**. Where both have a price, 77% are identical and 92% are within $25/wk.
  Caveats: exact-address matching only, and Domain-specific filters (keywords, under-offer) may explain some gaps.
- `modifiedDate` was empty in the list payload. `dateAvailable` is present. Listing age needs `/properties/detail`.
- Terms: this is an unofficial wrapper of a site that has no public API. Check REA's terms and RapidAPI seller terms
  before building a paid product on it. Redistribution rights are not established.

## What is still untested (needs a key or subscription)

1. Microburbs: exact-unit AVM, same-building comps and rent history on Melbourne apartments.
2. Other RapidAPI sellers (Domain wrappers still return "not subscribed").
3. PropRadar and enterprise vendors (PropTrack, Pricefinder, Cotality): quote only; no public keys found.
4. Ground truth for rent estimates: your CRM holds ~1,850 current weekly asking rents (p10/p50/p90 = $650/$750/$900).

## 6. Suburb-level public data (added 2026-11-11)

| Source | Access | Result |
|---|---|---|
| Homes Victoria Rental Report, "Moving annual median rent by suburb and town", June quarter 2026 (xlsx) | Free download, no key | Loaded. Median weekly rent and new-lease counts by suburb and bedroom count back to 2000. Docklands 2-bed flat: $800/wk, +6.7% on year, 1,471 leases. |
| City of Melbourne Development Activity Monitor (open data API) | Free, no key | Loaded. 40 not-yet-complete projects within 800 m of the demo building. After de-duplicating sites (a site can appear as both "applied" and "approved"): 32 sites, 4,563 dwellings (292 under construction, 3,933 approved, 338 applied). |
| realestate.com.au suburb snapshots (from the harvest) | RapidAPI free tier | Docklands 2-bed apartments: asking median $780/wk (111 listings); recent-sale median $627,500 (newest 87 sales). |
| AirDNA market listings already in the CRM (10,009 rows, USD) | CRM database | Docklands 2-bed: 551 listings, median occupancy 67%, median nightly rate A$240 (at 1.437 AUD/USD). |
| OpenStreetMap Overpass (transport, supermarkets) | Free | Blocked: the server returned 406 to our requests. Not loaded. |
| Schools, ABS census, vacancy rate, Valuer-General sale statistics | Free (public) | Not loaded yet. |

Caveats: sale medians use only the newest 150 sales per suburb, so they are indicative. The development monitor counts approvals, not completions.

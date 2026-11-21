# H5 G-NAF: licence and units-per-building prototype (2026-11-14)

Labels: Verified = page or file read this run. Secondary = search summary. Unverified = not read.

## A. Licence (open G-NAF as downloaded from data.gov.au)

| Item | Finding | Status |
|---|---|---|
| EULA resource page | https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf/resource/09f74802-08b1-4214-a6ea-3591b2753d30 , "Created 22/02/2016, Updated 18/08/2026". Fetched by curl with a browser user agent; WebFetch got 403. | Verified |
| Basis | "The EULA terms are based on the Creative Commons Attribution 4.0 International license (CC BY 4.0). However, an important restriction relating to the use of the open G-NAF for the sending of mail has been added." | Verified |
| The one added restriction | "The open G-NAF data must not be used [for] the generation of an address or a compilation [of] address[es] for the sending of mail unless the user has verified that each address to be used for the sending of mail is capable of receiving mail by reference to a secondary source of information." | Verified |
| Fact sheet | https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/resource/9a8f6baa-f790-49a0-84b1-3cb39a6a1b88/download/fact-sheet-open-g-naf-use-restriction.pdf (text extracted). Says the restriction is about physical mail only. It lists ways to verify (verified mailing database, owner confirmation, physical observation, own mailing data) and says a blanket restriction "would likely have unintended consequences", so it "prohibits inappropriate use ... while permitting suitable use". | Verified |
| Commercial use and derived products | Nothing in the page text or fact sheet bars commercial use or derived products; CC BY 4.0 permits both with attribution. The "do not compile addresses" wording is limited to compiling addresses for sending mail, not to counting units per building. | Verified for what the page states |
| Not covered | The full EULA text behind the page (it is a linked PDF) was not read. Geoscape's separate commercial EULAs (Developer EULA, "GNAF Core EULA v2", Nov 2024, https://geoscape.com.au/wp-content/uploads/2024/11/GNAF-Core-EULA-v2.pdf) restrict commercial products and derived material, but they govern licensed Geoscape Data, not the open copy. The PDF would not render in the fetch tool. The zip itself contains no licence file (only Contents.txt, SQL scripts). | Unverified (EULA PDF); Secondary (Geoscape EULA summary from search results) |

Practical reading: our use (counting units per building address and displaying the count) looks permitted under open G-NAF if we attribute Geoscape and never use it to build mailing lists. Keep a copy of the EULA PDF in the repo's records and ask Geoscape (support@geoscape.com.au) in writing before launch, because a different licence applies if we ever switch to the commercial feed.

## B. Units per building (script `scripts/32-gnaf-building-units.py`)

Method: building = G-NAF PRIMARY address; units = non-retired, principal (`ALIAS_PRINCIPAL = P`) secondary addresses joined by `PRIMARY_SECONDARY`. Cross-check count `alt_count` groups flat-numbered addresses by street + number + postcode. Streams from the zip, stdlib only, VIC runs in about 35 seconds.

Key trap found: G-NAF repeats flats as alias rows (`ALIAS_PRINCIPAL = A`). Without excluding them, towers were counted at almost exactly double (648 Lonsdale St: 1,659 vs 842 principal). All counts below exclude aliases.

### VIC (full state), `data/gnaf_vic_building_units.json`

- 4.41M address rows, 4.19M principal. Flat addresses 1.16M (27.8%). 169,866 buildings with at least one linked flat; 2,627 with 50 or more.
- BUILDING_NAME is populated on 2.6% of addresses and 6.1% of flat addresses, so names cannot be the building key. Use address.

### Validation against Vicmap `building_unit_records` (data/vicmap_match.json, 1,899 rows, 169 unique buildings parsed)

| Test | Result |
|---|---|
| Buildings found in G-NAF by street number + street + postcode | 145 of 169 (the 24 misses are address-string mismatches such as typos and "Promenade"; not checked one by one) |
| Within 10% (or 2 units) | 130 of 145 (90%) |
| Within 25% (or 2 units) | 134 of 145 (92%) |
| Direction of the 11 misses over 25% | 6 G-NAF lower, 5 higher. Lower ones: the primary-secondary join is partial (e.g. 241 City Rd: 10 linked vs 697 by street-number grouping, Vicmap 679; 60 Kavanagh St: 663 vs 980, Vicmap 978). Higher ones: 95 Berkeley St 150 vs Vicmap 58, 474 Flinders St 107 vs 56, 100 Harbour Esplanade 619 vs 492 (possibly several towers or non-residential units on one number; not verified) |
| Which estimator | Primary-secondary count matched 130/145; street-number grouping alone 121/145; neither dominates (grouping fixes the partial-join cases and breaks the shared-number cases) |

Caveat: Vicmap itself is only a cross-check, not ground truth. Neither source says how many units are residential or lettable. Counts are address records, so they include car-park or storage "units" if G-NAF records them as flats (not tested).

### Other states (first 500,000 rows only, so building counts there are partial; shares are indicative)

| State | Flat addresses | BUILDING_NAME on flats | Notes |
|---|---|---|---|
| QLD | 26.8% | 21.7% | Names common on Gold Coast resorts and blocks (e.g. "OUTRIGGER SUITES, 72 units", "PACIFIC FAIR, 66 vs 159 by grouping") |
| NSW | 36.4% | 7.1% | Same structure works |
| VIC (full) | 27.8% | 6.1% | |

The method works unchanged for QLD and NSW (same tables and columns). Partial primary-secondary joins appear there too (Pacific Fair 66 vs 159), so the same two-estimator caveat applies. Full-state runs for QLD and NSW were not done (about 30 to 60 seconds each).

## C. What this means for the product

- Short-stay penetration denominator can be built nationally from the open G-NAF at no cost, subject to the licence reading above.
- Treat unit counts as "address records", label them Estimated, and show a range where the two estimators disagree.
- Files: `data/gnaf_vic_building_units.json` (30 MB, derived from G-NAF; do not commit without deciding), `data/gnaf_vic_validation.json`, and sample-only `data/gnaf_qld_building_units.json` and `data/gnaf_nsw_building_units.json` (marked with `sample_rows_limit`).
- Not done: full QLD, NSW and other states, residential-only filtering, joining counts to AirDNA comps.

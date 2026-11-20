"""Units per building from G-NAF (Geoscape) - prototype.

Run: python -I scripts/32-gnaf-building-units.py VIC            (full state)
     python -I scripts/32-gnaf-building-units.py QLD --sample 400000   (first N address rows only)

Reads <STATE>_ADDRESS_DETAIL, <STATE>_PRIMARY_SECONDARY, <STATE>_STREET_LOCALITY and <STATE>_LOCALITY
straight from the zip (nothing is extracted). Pure stdlib.

A building is a G-NAF PRIMARY address (the street address) that has at least one non-retired SECONDARY
(unit/flat) address linked through PRIMARY_SECONDARY. unit_count = number of live, principal (non-alias) secondaries.
ALIAS_PRINCIPAL='A' rows are skipped: G-NAF repeats flats as aliases and counting them roughly doubles towers.
Cross-check grouping: flat-numbered addresses (FLAT_NUMBER or LEVEL/FLAT type present) grouped by
(street_locality_pid, number_first, postcode); reported as alt_count.
Writes data/gnaf_<state>_building_units.json. VIC also compares against data/vicmap_match.json.
"""
import csv, io, json, re, sys, zipfile
from collections import defaultdict

ROOT = __file__.replace("\\", "/").rsplit("scripts/", 1)[0]
ZIP = ROOT + "data/raw/national/gnaf/g-naf_aug26_allstates_gda2020_psv_110.zip"
P = "G-NAF/G-NAF AUGUST 2026/Standard/"
state = sys.argv[1].upper() if len(sys.argv) > 1 else "VIC"
sample = int(sys.argv[sys.argv.index("--sample") + 1]) if "--sample" in sys.argv else 0

z = zipfile.ZipFile(ZIP)


def rows(table, limit=0):
    with z.open(f"{P}{state}_{table}_psv.psv") as f:
        r = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", newline=""), delimiter="|")
        for i, row in enumerate(r):
            if limit and i >= limit:
                break
            yield row


loc = {r["LOCALITY_PID"]: r["LOCALITY_NAME"] for r in rows("LOCALITY")}
street = {r["STREET_LOCALITY_PID"]: (r["STREET_NAME"], r["STREET_TYPE_CODE"], r["LOCALITY_PID"]) for r in rows("STREET_LOCALITY")}

primary_of = {}  # secondary pid -> primary pid (live joins only)
for r in rows("PRIMARY_SECONDARY"):
    if not r["DATE_RETIRED"]:
        primary_of[r["SECONDARY_PID"]] = r["PRIMARY_PID"]
primaries = set(primary_of.values())

info = {}  # primary pid -> record
secs = defaultdict(int)
alt = defaultdict(int)
n_addr = n_live = n_flat = n_named = n_named_flat = 0
for r in rows("ADDRESS_DETAIL", sample):
    n_addr += 1
    if r["DATE_RETIRED"] or r["ALIAS_PRINCIPAL"] == "A":  # alias rows duplicate every principal address
        continue
    n_live += 1
    pid = r["ADDRESS_DETAIL_PID"]
    if r["FLAT_NUMBER"] or r["FLAT_TYPE_CODE"]:
        n_flat += 1
        alt[(r["STREET_LOCALITY_PID"], r["NUMBER_FIRST"], r["POSTCODE"])] += 1
    if r["BUILDING_NAME"]:
        n_named += 1
        if r["FLAT_NUMBER"] or r["FLAT_TYPE_CODE"]:
            n_named_flat += 1
    if pid in primary_of:
        secs[primary_of[pid]] += 1
    if pid in primaries:
        sn = street.get(r["STREET_LOCALITY_PID"], ("", "", ""))
        info[pid] = {
            "building_name": r["BUILDING_NAME"],
            "number": (r["NUMBER_FIRST"] + (r["NUMBER_LAST"] and "-" + r["NUMBER_LAST"])),
            "street": (sn[0] + " " + sn[1]).strip(),
            "locality": loc.get(r["LOCALITY_PID"], ""),
            "postcode": r["POSTCODE"],
            "alt_key": (r["STREET_LOCALITY_PID"], r["NUMBER_FIRST"], r["POSTCODE"]),
        }

buildings = []
for p, n in secs.items():
    rec = info.get(p)
    if not rec:
        continue
    rec = dict(rec)
    rec["alt_count"] = alt.get(rec.pop("alt_key"), 0)
    rec["primary_pid"] = p
    rec["unit_count"] = n
    buildings.append(rec)
buildings.sort(key=lambda b: -b["unit_count"])

stats = {
    "state": state, "rows_read": n_addr, "live_addresses": n_live,
    "flat_addresses": n_flat, "flat_share_pct": round(100 * n_flat / max(n_live, 1), 2),
    "addresses_with_building_name": n_named, "named_share_pct": round(100 * n_named / max(n_live, 1), 2),
    "flat_addresses_with_building_name": n_named_flat,
    "flat_named_share_pct": round(100 * n_named_flat / max(n_flat, 1), 2),
    "buildings_with_secondaries": len(buildings),
    "buildings_ge_50": sum(b["unit_count"] >= 50 for b in buildings),
    "sample_rows_limit": sample or None,
    "note": "With --sample the file is only the first N rows of ADDRESS_DETAIL, so counts are partial.",
}
out = {"stats": stats, "buildings": buildings}
json.dump(out, open(f"{ROOT}data/gnaf_{state.lower()}_building_units.json", "w", encoding="utf-8"), ensure_ascii=False)
print(json.dumps(stats, indent=1))

# ---- VIC validation against Vicmap building_unit_records ----
if state == "VIC" and not sample:
    vm = json.load(open(ROOT + "data/vicmap_match.json", encoding="utf-8"))
    idx = {}
    for b in buildings:
        key = (re.sub(r"[^0-9A-Z]", "", b["number"].split("-")[0].upper()), re.sub(r"[^A-Z0-9 ]", "", b["street"].upper()), b["postcode"])
        idx.setdefault(key, []).append(b)
    abbr = {"ST": "STREET", "RD": "ROAD", "AVE": "AVENUE", "DR": "DRIVE", "PL": "PLACE", "CT": "COURT", "LN": "LANE", "PDE": "PARADE", "BVD": "BOULEVARD", "ESP": "ESPLANADE", "TCE": "TERRACE", "CRES": "CRESCENT", "BLVD": "BOULEVARD"}
    seen, res = set(), []
    for m in vm:
        a = m.get("address") or ""
        mt = re.match(r"^(?:[\w]+/)?(\d+[A-Za-z]?)\s+(.+?),\s+.+?\s+VIC\s+(\d{4})$", a)
        if not mt or not m.get("building_unit_records"):
            continue
        num, st, pc = mt.group(1).upper(), mt.group(2).upper(), mt.group(3)
        w = re.sub(r"[^A-Z0-9 ]", "", st).split()
        w[-1] = abbr.get(w[-1], w[-1])  # expand only the street type (last word) so "St Kilda Road" survives
        st = " ".join(w)
        key = (num, st, pc)
        if key in seen:
            continue
        seen.add(key)
        g = idx.get(key)
        res.append({"address": a, "vicmap": m["building_unit_records"], "gnaf": g[0]["unit_count"] if g else None, "gnaf_alt": g[0]["alt_count"] if g else None})
    matched = [r for r in res if r["gnaf"] is not None]
    def within(r, tol): return abs(r["gnaf"] - r["vicmap"]) <= max(2, tol * r["vicmap"])
    summary = {
        "vicmap_buildings_tested": len(res), "found_in_gnaf": len(matched),
        "within_10pct_or_2": sum(within(r, 0.10) for r in matched),
        "within_25pct_or_2": sum(within(r, 0.25) for r in matched),
        "gnaf_lower": sum(r["gnaf"] < r["vicmap"] for r in matched), "gnaf_higher": sum(r["gnaf"] > r["vicmap"] for r in matched),
    }
    print(json.dumps(summary, indent=1))
    worst = sorted(matched, key=lambda r: -abs(r["gnaf"] - r["vicmap"]))[:12]
    for r in worst:
        print(r)
    json.dump({"summary": summary, "pairs": res}, open(ROOT + "data/gnaf_vic_validation.json", "w", encoding="utf-8"), indent=1)

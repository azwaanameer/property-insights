"""Extract Victorian addresses from the G-NAF zip to TSV for pipeline/ingest/gnaf-load.mjs.

Run:  python -I pipeline/ingest/gnaf-extract.py [--state VIC] [--zip PATH] [--out DIR] [--sample N]

Reads ADDRESS_DETAIL, ADDRESS_DEFAULT_GEOCODE, STREET_LOCALITY, LOCALITY and PRIMARY_SECONDARY straight from the zip
(nothing is unpacked). Pure stdlib. Writes, under data/out/gnaf-<state>/ (gitignored):
  addresses.tsv   one row per live, principal (non-alias) address
  manifest.json   release, as_of, file_sha256 of the zip, row_count, retrieved_at

Approach follows scripts/32-gnaf-building-units.py:
  - ALIAS_PRINCIPAL = 'A' rows are skipped (G-NAF repeats flats as aliases; counting them roughly doubles towers).
  - A secondary is a pid listed as SECONDARY_PID in a live PRIMARY_SECONDARY row; its building is that primary pid.
  - A property-level row has no flat or level and is not a secondary; its building_id is its own pid (AD-6).
  - A unit-like row (flat or level present) with no live PRIMARY_SECONDARY link gets an empty building_id.
Only VIC is supported in this build step.
"""
import csv, hashlib, io, json, os, re, sys, zipfile
from datetime import date, datetime, timezone
import calendar

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


STATE = arg("--state", "VIC").upper()
if STATE != "VIC":
    sys.exit("only VIC is loaded in this build step")
ZIP = arg("--zip", os.path.join(ROOT, "data", "raw", "national", "gnaf", "g-naf_aug26_allstates_gda2020_psv_110.zip"))
OUT = arg("--out", os.path.join(ROOT, "data", "out", f"gnaf-{STATE.lower()}"))
SAMPLE = int(arg("--sample", "0"))

COLUMNS = [
    "gnaf_pid", "building_id", "is_property_level", "unit_number", "flat_type", "level_number",
    "number_first", "number_last", "street_name", "street_type", "street_suffix", "building_name",
    "locality_name", "postcode", "lat", "lon", "display_address",
]

FLAT_LABEL = {"UNIT": "", "": "", "APT": "Apt", "FLAT": "Flat", "SHOP": "Shop", "SE": "Suite", "OFFC": "Office",
              "ROOM": "Room", "SITE": "Site", "CARS": "Car space", "FCTY": "Factory", "WHSE": "Warehouse",
              "VLLA": "Villa", "STR": "Store", "TNCY": "Tenancy", "TNHS": "Townhouse", "KSK": "Kiosk"}
SUFFIX_WORD = {"N": "North", "S": "South", "E": "East", "W": "West", "NE": "North East", "NW": "North West",
               "SE": "South East", "SW": "South West", "EX": "Extension", "CN": "Central", "IN": "Inner",
               "LR": "Lower", "UP": "Upper", "UR": "Upper", "DE": "Deviation", "ML": "Mall", "OF": "Off", "ON": "On"}


def title(s):
    t = s.title()
    return re.sub(r"'S\b", "'s", t)


def clean(v):
    return v.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def label(prefix, num, suffix):
    return f"{prefix}{num}{suffix}".strip().upper()


z = zipfile.ZipFile(ZIP)
names = z.namelist()
base = next(n for n in names if n.endswith(f"/{STATE}_ADDRESS_DETAIL_psv.psv")).rsplit("/", 1)[0] + "/"
release = re.search(r"G-NAF ([A-Z]+ \d{4})", base).group(1)  # e.g. "AUGUST 2026"
month_name, year = release.split()
month = list(calendar.month_name).index(month_name.title())
as_of = date(int(year), month, calendar.monthrange(int(year), month)[1]).isoformat()


def rows(table, limit=0):
    with z.open(f"{base}{STATE}_{table}_psv.psv") as f:
        r = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", newline=""), delimiter="|")
        for i, row in enumerate(r):
            if limit and i >= limit:
                break
            yield row


print(f"reading {release} {STATE} ...", file=sys.stderr)
loc = {r["LOCALITY_PID"]: r["LOCALITY_NAME"] for r in rows("LOCALITY") if not r["DATE_RETIRED"]}
street = {
    r["STREET_LOCALITY_PID"]: (r["STREET_NAME"], r["STREET_TYPE_CODE"], r["STREET_SUFFIX_CODE"])
    for r in rows("STREET_LOCALITY") if not r["DATE_RETIRED"]
}
primary_of = {r["SECONDARY_PID"]: r["PRIMARY_PID"] for r in rows("PRIMARY_SECONDARY") if not r["DATE_RETIRED"]}
geo = {}
for r in rows("ADDRESS_DEFAULT_GEOCODE"):
    if not r["DATE_RETIRED"] and r["ADDRESS_DETAIL_PID"] not in geo:
        geo[r["ADDRESS_DETAIL_PID"]] = (r["LATITUDE"], r["LONGITUDE"])
print(f"  {len(loc)} localities, {len(street)} streets, {len(primary_of)} secondary links, {len(geo)} geocodes", file=sys.stderr)

os.makedirs(OUT, exist_ok=True)
n_out = n_unit = n_prop = n_unlinked = 0
with open(os.path.join(OUT, "addresses.tsv"), "w", encoding="utf-8", newline="") as out:
    out.write("\t".join(COLUMNS) + "\n")
    for r in rows("ADDRESS_DETAIL", SAMPLE):
        if r["DATE_RETIRED"] or r["ALIAS_PRINCIPAL"] == "A":
            continue
        pid = r["ADDRESS_DETAIL_PID"]
        locality = loc.get(r["LOCALITY_PID"], "")
        if not locality:
            continue  # cannot be displayed or matched without a locality
        sname, stype, ssuffix = street.get(r["STREET_LOCALITY_PID"], ("", "", ""))
        flat = label(r["FLAT_NUMBER_PREFIX"], r["FLAT_NUMBER"], r["FLAT_NUMBER_SUFFIX"])
        level = label(r["LEVEL_NUMBER_PREFIX"], r["LEVEL_NUMBER"], r["LEVEL_NUMBER_SUFFIX"])
        flat_type = r["FLAT_TYPE_CODE"]
        secondary = pid in primary_of
        unit_like = secondary or bool(flat or flat_type or level)
        if unit_like:
            n_unit += 1
            building_id = primary_of.get(pid, "")
            if not building_id:
                n_unlinked += 1
        else:
            n_prop += 1
            building_id = pid
        n1 = label(r["NUMBER_FIRST_PREFIX"], r["NUMBER_FIRST"], r["NUMBER_FIRST_SUFFIX"])
        n2 = label(r["NUMBER_LAST_PREFIX"], r["NUMBER_LAST"], r["NUMBER_LAST_SUFFIX"])
        number = n1 + (f"-{n2}" if n2 else "")
        if not number and r["LOT_NUMBER"]:
            number = "Lot " + label(r["LOT_NUMBER_PREFIX"], r["LOT_NUMBER"], r["LOT_NUMBER_SUFFIX"])

        # display address
        pre = ""
        if level:
            pre = f"Level {level}, "
        if flat:
            ftl = FLAT_LABEL.get(flat_type, title(flat_type))
            pre += f"{flat}/" if not ftl else f"{ftl} {flat}, "
        elif flat_type and flat_type != "UNIT" and not level:
            pre += (FLAT_LABEL.get(flat_type, title(flat_type)) or "Unit") + ", "
        st = " ".join(p for p in [title(sname), title(stype), SUFFIX_WORD.get(ssuffix, title(ssuffix))] if p)
        display = f"{pre}{number} {st}".strip() + f", {title(locality)} {STATE} {r['POSTCODE']}".rstrip()

        lat, lon = geo.get(pid, ("", ""))
        out.write("\t".join(clean(v) for v in [
            pid, building_id, "0" if unit_like else "1", flat, flat_type, level, n1, n2, sname, stype, ssuffix,
            r["BUILDING_NAME"], locality, r["POSTCODE"], lat, lon, display,
        ]) + "\n")
        n_out += 1

sha = hashlib.sha256()
with open(ZIP, "rb") as f:
    for chunk in iter(lambda: f.read(1 << 20), b""):
        sha.update(chunk)

manifest = {
    "source_id": "gnaf",
    "state": STATE,
    "release": release,
    "as_of": as_of,
    "retrieved_at": datetime.fromtimestamp(os.path.getmtime(ZIP), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "file_sha256": sha.hexdigest(),
    "zip_name": os.path.basename(ZIP),
    "row_count": n_out,
    "property_level_rows": n_prop,
    "unit_rows": n_unit,
    "unit_rows_without_primary_link": n_unlinked,
    "sample_rows_limit": SAMPLE or None,
    "columns": COLUMNS,
}
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=1)
print(json.dumps({k: v for k, v in manifest.items() if k != "columns"}, indent=1))

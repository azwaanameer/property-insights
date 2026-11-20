"""Annual median new-letting rent series for backtesting (own sources, no vendor data).

NSW: Fair Trading rental bond lodgements (record level, Jan 2021 to Oct 2026), by postcode.
TAS: Dept of Justice rental bond records (monthly files, Active sheet = bonds lodged that month), by suburb.
Both are new lettings (rent when the bond was lodged), not moving medians of all tenancies.

Prerequisites: node scripts/34a-xlsx-to-csv.mjs data/raw/_csv_cache/nsw <nsw xlsx files>
                node scripts/34a-xlsx-to-csv.mjs data/raw/_csv_cache/tas <tas xls/xlsx files>
Run: python -I scripts/34-rent-series-nsw-tas.py
"""
import csv, glob, io, json, os, re, statistics as st, datetime, collections

ROOT = "c:/Users/azwaa/Documents/Ventures/Inexis/repos/property-insights/"
EPOCH = datetime.date(1899, 12, 30)

def to_date(v):
    v = str(v).strip()
    try:
        return EPOCH + datetime.timedelta(days=int(float(v)))
    except ValueError:
        pass
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", v)
    return datetime.date(int(m[3]), int(m[2]), int(m[1])) if m else None

def num(v):
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except ValueError:
        return None

def summarise(buckets, min_n=1):
    out = {}
    for (area, year, kind), rents in buckets.items():
        if len(rents) >= min_n:
            out.setdefault(area, {}).setdefault(str(year), {})[kind] = dict(med=round(st.median(rents), 1), n=len(rents))
    return out

# ---------------- NSW ----------------
def nsw():
    b = collections.defaultdict(list)
    seen = collections.Counter()
    for f in sorted(glob.glob(ROOT + "data/raw/_csv_cache/nsw/*lodgements*__0.csv")):
        text = open(f, encoding="utf-8", errors="replace").read().split("\n", 1)[1]
        rows = list(csv.reader(io.StringIO(text)))
        hi = next(i for i, r in enumerate(rows) if r and r[0].strip() == "Lodgement Date")
        for r in rows[hi + 1:]:
            if len(r) < 5:
                continue
            d, pc, typ, bed, rent = to_date(r[0]), r[1].strip(), r[2].strip(), r[3].strip(), num(r[4])
            if not d or not pc.isdigit() or rent is None or not (40 <= rent <= 5000):
                continue
            seen[d.year] += 1
            if typ == "F" and bed in ("1", "2"):
                b[(pc, d.year, "flat12")].append(rent)
            elif typ == "H" and bed == "3":
                b[(pc, d.year, "house3")].append(rent)
    out = summarise(b)
    json.dump(out, open(ROOT + "data/rent_series_nsw_postcode.json", "w"))
    return out, seen

# ---------------- TAS ----------------
UNIT_WORDS = ("unit", "flat", "apartment", "studio")
HOUSE_WORDS = ("house", "separate", "detached", "semi", "townhouse", "terrace", "villa", "duplex")

def tas_files():
    """one Active-sheet CSV per lodgement month; if a month appears in several files keep the one with most rows"""
    best = {}
    for f in sorted(glob.glob(ROOT + "data/raw/_csv_cache/tas/*.csv")):
        L = open(f, encoding="utf-8", errors="replace").read().splitlines()
        if not L[0].lower().startswith("#sheet=active"):
            continue
        hi = next((i for i, l in enumerate(L[:15]) if "suburb" in l.lower() and "rent" in l.lower()), None)
        if hi is None:
            continue
        hdr = [h.strip().lower() for h in next(csv.reader([L[hi]]))]
        col = lambda *keys: next((i for i, h in enumerate(hdr) if all(k in h for k in keys)), None)
        c = dict(sub=col("suburb"), pc=col("postcode"), rent=col("weekly", "rent"), bed=col("bedroom"), typ=col("dwelling"), lod=col("lodgement"))
        if None in c.values():
            continue
        recs, months = [], collections.Counter()
        for r in csv.reader(L[hi + 1:]):
            if len(r) <= max(c.values()):
                continue
            d, rent = to_date(r[c["lod"]]), num(r[c["rent"]])
            if not d or rent is None or not (40 <= rent <= 5000):
                continue
            months[(d.year, d.month)] += 1
            recs.append((r[c["sub"]].strip().upper(), r[c["pc"]].strip(), r[c["typ"]].strip().lower(), r[c["bed"]].strip(), rent, d))
        if not months:
            continue
        mon = months.most_common(1)[0][0]
        recs = [x for x in recs if (x[5].year, x[5].month) == mon]
        if mon not in best or len(recs) > len(best[mon][1]):
            best[mon] = (os.path.basename(f), recs)
    return best

def tas():
    best = tas_files()
    b = collections.defaultdict(list)
    types = collections.Counter()
    for mon, (fn, recs) in best.items():
        for sub, pc, typ, bed, rent, d in recs:
            types[typ] += 1
            bd = bed.split(".")[0]
            is_unit = any(w in typ for w in UNIT_WORDS)
            is_house = any(w in typ for w in HOUSE_WORDS) and not is_unit
            if is_unit and bd in ("1", "2"):
                b[(sub, d.year, "flat12")].append(rent)
            elif is_house and bd == "3":
                b[(sub, d.year, "house3")].append(rent)
    out = summarise(b)
    json.dump(out, open(ROOT + "data/rent_series_tas_suburb.json", "w"))
    return out, sorted(best), types

if __name__ == "__main__":
    n, seen = nsw()
    print("NSW postcodes with any series:", len(n), "| records parsed by year:", dict(sorted(seen.items())))
    for y in range(2021, 2027):
        k = [p for p in n if str(y) in n[p] and n[p][str(y)].get("flat12", {}).get("n", 0) >= 20]
        print(f"  {y}: postcodes with >=20 flat12 lettings: {len(k)}")
    t, months, types = tas()
    print("TAS suburbs with any series:", len(t), "| months of Active data:", len(months), months[0], "->", months[-1])
    want = [(y, m) for y in range(2016, 2027) for m in range(1, 13) if (y, m) >= (2016, 6) and (y, m) <= (2026, 8)]
    print("  missing months:", [f"{y}-{m:02d}" for y, m in want if (y, m) not in months])
    print("  dwelling types:", types.most_common(12))
    for y in range(2016, 2027):
        k = [s for s in t if str(y) in t[s] and t[s][str(y)].get("flat12", {}).get("n", 0) >= 10]
        print(f"  {y}: suburbs with >=10 flat12 lettings: {len(k)}")

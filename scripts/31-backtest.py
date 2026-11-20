"""Backtest suburb markers against later Valuer-General unit price growth (our own sources only).

Sources: VGV median unit price by suburb 2015-2025 (data/vgv_unit_growth.json), Homes Victoria flat rents
(data/dffh_flat_rent_dec.json), ABS Census 2016 (State Suburbs) and 2021 (Suburbs and Localities) tenure
by dwelling structure and unoccupied dwellings (data/raw/national). No vendor forecasts are used.

Design: two origins with a Census year at the start of each window (2016 and 2021). Markers are measured at
the origin, outcomes are measured after it. Direction of each marker is fixed from a-priori reasoning before
looking at results; the composite is then checked on the window it was not designed on.
Run: python -I scripts/31-backtest.py
"""
import csv, io, json, re, statistics as st, zipfile, math, random

ROOT = "c:/Users/azwaa/Documents/Ventures/Inexis/repos/property-insights/"
G = json.load(open(ROOT + "data/vgv_unit_growth.json", encoding="utf-8"))
RENT = json.load(open(ROOT + "data/dffh_flat_rent_dec.json", encoding="utf-8"))
NAMES = json.load(open(ROOT + "data/abs_names.json", encoding="utf-8"))

# ---------- price series ----------
P = {}
for k, v in G.items():
    s = {int(y): p for y, p in (v.get("series") or {}).items() if p}
    if all(y in s for y in range(2015, 2026)):
        P[k] = s

def sm(n, y):  # two-year smoothed price (calendar-year medians are noisy)
    return (P[n][y] + P[n][y - 1]) / 2

def cagr(a, b, n):
    return ((b / a) ** (1 / n) - 1) * 100

# ---------- rent series mapped to VGV suburb keys ----------
def norm(s):
    s = re.sub(r"\s*\((vic\.?|vic)\)\s*", "", s, flags=re.I)
    return s.upper().strip()

R = {}  # suburb -> {year: avg flat weekly rent}
shared = {}
for area, yrs in RENT.items():
    key = area.upper().strip()
    targets = [key] if key in P else [p.upper().strip() for p in area.split("-") if p.upper().strip() in P]
    if not targets:
        continue
    series = {}
    for y, d in yrs.items():
        meds = [d[s]["med"] for s in ("1 bedroom flat", "2 bedroom flat") if s in d and d[s]["med"]]
        if len(meds) == 2:
            series[int(y)] = sum(meds) / 2
    if len(series) < 8:
        continue
    for t in targets:
        R[t] = series
        shared[t] = len(targets)

# ---------- census ----------
def read_zip(path, base, table):
    z = zipfile.ZipFile(path)
    return list(csv.DictReader(io.TextIOWrapper(z.open(base % table), encoding="utf-8-sig")))

def f(row, col):
    try:
        return float(row[col])
    except (KeyError, ValueError):
        return 0.0

def census(year):
    if year == 2021:
        path, base = ROOT + "data/raw/national/census-2021/2021_GCP_SAL_VIC.zip", "2021 Census GCP Suburbs and Localities for VIC/2021Census_%s_VIC_SAL.csv"
        t_ten, t_occ, code = "G37", "G36", "SAL_CODE_2021"
    else:
        path, base = ROOT + "data/raw/national/census-2016/2016_GCP_SSC_VIC.zip", "2016 Census GCP State Suburbs for VIC/2016Census_%s_VIC_SSC.csv"
        t_ten, t_occ, code = "G33", "G32", "SSC_CODE_2016"
    ten = read_zip(path, base, t_ten)
    occ = {r[code]: r for r in read_zip(path, base, t_occ)}
    out = {}
    for r in ten:
        c = re.sub(r"\D", "", r[code])
        nm = NAMES[str(year)].get(c)
        if not nm:
            continue
        k = norm(nm)
        if k not in P:
            continue
        flats = f(r, "Total_DS_Flat_apart")
        own_f = f(r, "O_OR_DS_Flat_apart") + f(r, "O_MTG_DS_Flat_apart")
        rent_f = f(r, "R_Tot_DS_Flat_apart")
        tot = f(r, "Total_Total")
        own_all = f(r, "O_OR_Total") + f(r, "O_MTG_Total")
        rent_all = f(r, "R_Tot_Total")
        o = occ.get(r[code], {})
        un = [c2 for c2 in o if c2 == "Unoccupied_PDs_Dwgs"]
        tp = [c2 for c2 in o if c2 == "Total_PDs_Dwellings"]
        unocc = f(o, un[0]) if un else None
        totpd = f(o, tp[0]) if tp else None
        out[k] = dict(
            flats=flats, flat_share=flats / tot if tot else None,
            own_flat=own_f / (own_f + rent_f) if (own_f + rent_f) > 20 else None,
            own_all=own_all / (own_all + rent_all) if (own_all + rent_all) > 20 else None,
            unocc=unocc / totpd if unocc is not None and totpd else None,
        )
    return out

C = {2016: census(2016), 2021: census(2021)}
print("census suburbs matched to VGV:", {y: len(c) for y, c in C.items()}, "| rent-matched suburbs:", len(R))

# ---------- stats helpers ----------
def ranks(x):
    o = sorted(range(len(x)), key=lambda i: x[i]); r = [0.0] * len(x); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]:
            j += 1
        for t in range(i, j + 1):
            r[o[t]] = (i + j) / 2 + 1
        i = j + 1
    return r

def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else 0.0

def zs(x):
    m, s = st.mean(x), st.pstdev(x) or 1
    return [(v - m) / s for v in x]

# ---------- features and outcomes at an origin ----------
def rows_for(origin, fwd, min_flats):
    out = []
    for k, c in C[origin].items():
        if c["flats"] < min_flats or k not in P:
            continue
        y = origin
        if y + fwd > 2025:
            continue
        rec = dict(sub=k, flats=c["flats"])
        rec["own_flat"], rec["own_all"], rec["unocc"], rec["flat_share"] = c["own_flat"], c["own_all"], c["unocc"], c["flat_share"]
        rec["price_level"] = math.log(sm(k, y))
        rec["price_mom3"] = cagr(sm(k, y - 3), sm(k, y), 3) if y - 4 >= 2015 else None
        rec["y_price"] = cagr(sm(k, y), sm(k, y + fwd), fwd)
        r = R.get(k)
        if r and y in r and (y + fwd) in r and (y - 3) in r:
            rec["yield"] = r[y] * 52 / sm(k, y) * 100
            rec["rent_mom3"] = cagr(r[y - 3], r[y], 3)
            rec["y_rent"] = cagr(r[y], r[y + fwd], fwd)
            rec["y_total"] = rec["y_price"] + rec["yield"]
        out.append(rec)
    return out

FEATS = [
    ("own_flat", "owner share of flats (higher = more owner-occupied)", +1),
    ("own_all", "owner share, all dwellings", +1),
    ("flat_share", "flats as share of all dwellings", -1),
    ("unocc", "unoccupied dwellings share (vacancy proxy)", -1),
    ("price_level", "price level (log)", 0),
    ("price_mom3", "past 3y price growth", 0),
    ("yield", "gross flat yield", +1),
    ("rent_mom3", "past 3y rent growth", +1),
]

def table(origin, fwd, min_flats, outcome="y_price"):
    rows = rows_for(origin, fwd, min_flats)
    res = {}
    for key, label, sign in FEATS:
        pts = [(r[key], r[outcome]) for r in rows if r.get(key) is not None and r.get(outcome) is not None]
        if len(pts) < 25:
            continue
        a, b = [p[0] for p in pts], [p[1] for p in pts]
        rho = spearman(a, b)
        idx = sorted(range(len(pts)), key=lambda i: a[i]); q = max(len(idx) // 5, 1)
        lo = st.median(b[i] for i in idx[:q]); hi = st.median(b[i] for i in idx[-q:])
        res[key] = dict(n=len(pts), rho=rho, lo=lo, hi=hi, se=1 / math.sqrt(len(pts) - 1))
    return res, rows

def show(title, res):
    print("\n" + title)
    print(f"{'marker':14s}{'n':>5s}{'rho':>8s}{'+-2se':>7s}{'bottom 20%':>12s}{'top 20%':>10s}")
    for key, label, sign in FEATS:
        if key in res:
            r = res[key]
            print(f"{key:14s}{r['n']:5d}{r['rho']:+8.2f}{2*r['se']:7.2f}{r['lo']:+11.1f}%{r['hi']:+9.1f}%")

RESULTS = {}
for min_flats in (0, 300):
    print("\n" + "=" * 90 + f"\nSuburbs with >= {min_flats} flats at origin")
    for origin, fwd in ((2016, 3), (2016, 5), (2021, 3), (2021, 4)):
        res, rows = table(origin, fwd, min_flats)
        show(f"PRICE growth {origin}->{origin+fwd} (units, smoothed medians)", res)
        RESULTS[f"price_{origin}_{fwd}_flats{min_flats}"] = res
    for origin, fwd in ((2016, 3), (2021, 3)):
        res, rows = table(origin, fwd, min_flats, "y_rent")
        show(f"RENT growth {origin}->{origin+fwd} (flats)", res)
        RESULTS[f"rent_{origin}_{fwd}_flats{min_flats}"] = res

json.dump(RESULTS, open(ROOT + "data/backtest_results.json", "w"), indent=1)

# ---------- composite "conditions score" (directions fixed a priori: +owner share, -flat share, -unoccupied) ----------
def composite(rows):
    use = [r for r in rows if None not in (r["own_all"], r["flat_share"], r["unocc"])]
    z_own, z_fs, z_un = zs([r["own_all"] for r in use]), zs([r["flat_share"] for r in use]), zs([r["unocc"] for r in use])
    for r, a, b, c in zip(use, z_own, z_fs, z_un):
        r["score"] = a - b - c
    return use

print("\n" + "=" * 90 + "\nCOMPOSITE (owner share high, flat share low, unoccupied low) vs outcomes")
print(f"{'window':16s}{'sample':>12s}{'n':>5s}{'rho':>7s}{'top20% med':>12s}{'bot20% med':>12s}{'market med':>12s}{'top beats mkt':>15s}")
for min_flats in (0, 300):
    for origin, fwd in ((2016, 3), (2016, 5), (2021, 3), (2021, 4)):
        rows = composite(rows_for(origin, fwd, min_flats))
        a = [r["score"] for r in rows]; b = [r["y_price"] for r in rows]
        idx = sorted(range(len(rows)), key=lambda i: a[i]); q = len(idx) // 5
        top = [b[i] for i in idx[-q:]]; bot = [b[i] for i in idx[:q]]; mkt = st.median(b)
        beat = sum(1 for v in top if v > mkt) / len(top)
        print(f"{origin}->{origin+fwd:<10d}{('flats>=%d' % min_flats):>12s}{len(rows):5d}{spearman(a,b):+7.2f}{st.median(top):+11.1f}%{st.median(bot):+11.1f}%{mkt:+11.1f}%{beat:14.0%}")
        RESULTS[f"composite_{origin}_{fwd}_flats{min_flats}"] = dict(n=len(rows), rho=spearman(a, b), top=st.median(top), bot=st.median(bot), mkt=mkt, beat=beat)

print("\nTOTAL RETURN proxy (price growth + gross flat yield at origin), rent-matched suburbs, composite quintiles")
for origin, fwd in ((2016, 3), (2021, 3)):
    rows = [r for r in composite(rows_for(origin, fwd, 0)) if r.get("y_total") is not None]
    a = [r["score"] for r in rows]; b = [r["y_total"] for r in rows]
    idx = sorted(range(len(rows)), key=lambda i: a[i]); q = len(idx) // 5
    print(origin, "->", origin + fwd, f"n={len(rows)} rho={spearman(a,b):+.2f} top20% {st.median(b[i] for i in idx[-q:]):+.1f}% bottom20% {st.median(b[i] for i in idx[:q]):+.1f}% market {st.median(b):+.1f}%")

# Which of our six core inner suburbs score where? (origin 2021 markers, latest)
print("\nCore suburbs at 2021 origin (score rank among suburbs with >=300 flats):")
rows = composite(rows_for(2021, 3, 300)); rows.sort(key=lambda r: -r["score"])
for r in rows:
    if r["sub"] in ("MELBOURNE", "SOUTHBANK", "DOCKLANDS", "ST KILDA", "SOUTH YARRA", "PORT MELBOURNE"):
        print(f"  {r['sub']:15s} rank {rows.index(r)+1}/{len(rows)} own_all {r['own_all']:.0%} flat_share {r['flat_share']:.0%} unocc {r['unocc']:.0%} fwd3y {r['y_price']:+.1f}%")
json.dump(RESULTS, open(ROOT + "data/backtest_results.json", "w"), indent=1)

print("\n" + "=" * 90 + "\nWITHIN APARTMENT-DOMINATED SUBURBS (>=300 flats AND flats >=50% of dwellings): does the score still rank?")
def within(origin, fwd):
    rows = [r for r in rows_for(origin, fwd, 300) if r["flat_share"] is not None and r["flat_share"] >= 0.5]
    out = {}
    for key in ("own_all", "own_flat", "unocc", "flat_share", "price_level", "yield", "rent_mom3"):
        pts = [(r[key], r["y_price"]) for r in rows if r.get(key) is not None]
        if len(pts) >= 20:
            out[key] = (len(pts), spearman([p[0] for p in pts], [p[1] for p in pts]))
    return out
for origin, fwd in ((2016, 3), (2016, 5), (2021, 3), (2021, 4)):
    o = within(origin, fwd)
    print(f"{origin}->{origin+fwd}: " + "  ".join(f"{k} {v[1]:+.2f}(n={v[0]})" for k, v in o.items()))

print("\n" + "=" * 90 + "\nRELIABILITY VIEW of the 3-marker score: pairwise (random top-20% suburb outgrows random bottom-20% suburb), and 'avoid' hit-rate (bottom-20% below market median)")
print(f"{'window':14s}{'sample':>12s}{'n':>5s}{'top>bottom':>12s}{'bottom<mkt':>12s}{'top>mkt':>10s}")
for min_flats, hi_share in ((0, 0.0), (300, 0.0), (300, 0.5)):
    for origin, fwd in ((2016, 3), (2016, 5), (2021, 3), (2021, 4)):
        rows = [r for r in composite(rows_for(origin, fwd, min_flats)) if r["flat_share"] >= hi_share]
        if len(rows) < 25: continue
        a = [r["score"] for r in rows]; b = [r["y_price"] for r in rows]
        idx = sorted(range(len(rows)), key=lambda i: a[i]); q = max(len(idx) // 5, 3)
        top = [b[i] for i in idx[-q:]]; bot = [b[i] for i in idx[:q]]; mkt = st.median(b)
        pairs = sum((t > u) + 0.5 * (t == u) for t in top for u in bot) / (len(top) * len(bot))
        tag = f"fl>={min_flats}" + (f",fs>={hi_share:.0%}" if hi_share else "")
        print(f"{origin}->{origin+fwd:<8d}{tag:>12s}{len(rows):5d}{pairs:12.0%}{sum(v < mkt for v in bot)/len(bot):12.0%}{sum(v > mkt for v in top)/len(top):10.0%}")

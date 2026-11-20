"""Multi-state backtest of suburb markers (own sources only: ABS Census, SEIFA, state price and rent files).

Markets (outcome = growth after a Census origin year, smoothed with a 2-year average):
  VIC unit price, VIC house price, SA house price, SA flat rent, SA house rent, QLD flat rent, QLD house rent
Origins: Census 2016 (windows to 2019, 2021) and Census 2021 (windows to 2024, 2025).
Markers (all measured at the origin): owner share, flat share, unoccupied share, household income, median age,
rent-to-income, mortgage-to-income, SEIFA IRSAD, price/rent level.
Selection test: markers are chosen from the TRAINING windows (2016 origin: VIC, SA) and the composite built from them
is scored on the HELD-OUT windows (2021 origin everywhere, plus QLD). The a-priori 3-marker composite is kept for comparison.
Run: python -I scripts/36-backtest-multistate.py
"""
import csv, io, json, math, re, statistics as st, zipfile

ROOT = "c:/Users/azwaa/Documents/Ventures/Inexis/repos/property-insights/"
NAMES = json.load(open(ROOT + "data/abs_names.json", encoding="utf-8"))
SEIFA = json.load(open(ROOT + "data/seifa_scores.json", encoding="utf-8"))

def norm(s):
    return re.sub(r"\s*\([^)]*\)\s*", "", str(s)).upper().strip()

# ---------------- outcome series (key -> {year: value}) ----------------
def vic_price(path):
    G = json.load(open(ROOT + path, encoding="utf-8")); out = {}
    for k, v in G.items():
        s = {int(y): p for y, p in (v.get("series") or {}).items() if p}
        if all(y in s for y in range(2015, 2026)): out[norm(k)] = s
    return out

def sa_price():
    d = json.load(open(ROOT + "data/series_sa_house_price.json")); out = {}
    for k, ys in d.items():
        s = {int(y): v["p"] for y, v in ys.items() if v["n"] >= 12}   # at least 12 sales in the year
        out[norm(k)] = s
    return out

def rent_series(path, kind):
    d = json.load(open(ROOT + path)); out = {}
    for k, ys in d.items():
        s = {int(y): v[kind] for y, v in ys.items() if kind in v}
        if s: out[norm(k)] = s
    return out

def nt_series(path, kind, nmin):
    d = json.load(open(ROOT + path)); out = {}
    for k, ys in d.items():
        s = {int(y): v[kind]["med"] for y, v in ys.items() if kind in v and v[kind]["n"] >= nmin}
        if s: out[norm(k) if not k.isdigit() else k] = s
    return out

MARKETS = [  # name, state, series, outcome kind, windows
    ("VIC unit price", "VIC", vic_price("data/vgv_unit_growth.json"), "price", [(2016, 3), (2016, 5), (2021, 3), (2021, 4)]),
    ("VIC house price", "VIC", vic_price("data/vgv_house_growth.json"), "price", [(2016, 3), (2016, 5), (2021, 3), (2021, 4)]),
    ("SA house price", "SA", sa_price(), "price", [(2016, 3), (2016, 5), (2021, 3), (2021, 4)]),
    ("SA flat rent", "SA", rent_series("data/series_sa_rent.json", "flat"), "rent", [(2016, 3), (2016, 5), (2021, 3), (2021, 4)]),
    ("SA house rent", "SA", rent_series("data/series_sa_rent.json", "house"), "rent", [(2016, 3), (2016, 5), (2021, 3), (2021, 4)]),
    ("QLD flat rent", "QLD", rent_series("data/series_qld_rent.json", "flat"), "rent", [(2021, 3), (2021, 4)]),
    ("QLD house rent", "QLD", rent_series("data/series_qld_rent.json", "house"), "rent", [(2021, 3), (2021, 4)]),
    ("TAS flat rent", "TAS", nt_series("data/rent_series_tas_suburb.json", "flat12", 10), "rent", [(2021, 3), (2021, 4)]),
    ("TAS house rent", "TAS", nt_series("data/rent_series_tas_suburb.json", "house3", 10), "rent", [(2021, 3), (2021, 4)]),
    ("NSW flat rent*", "NSW", nt_series("data/rent_series_nsw_postcode.json", "flat12", 20), "rent", [(2021, 3), (2021, 4)]),
    ("NSW house rent*", "NSW", nt_series("data/rent_series_nsw_postcode.json", "house3", 20), "rent", [(2021, 3), (2021, 4)]),
]
POSTCODE_STATES = {"NSW"}   # NSW rents are by postcode, so Census postal areas (POA) are used; no 2020 data, so no smoothing

# ---------------- census markers per state and year ----------------
def read(z, pat):
    n = [x for x in z.namelist() if re.search(pat, x)]
    return list(csv.DictReader(io.TextIOWrapper(z.open(n[0]), encoding="utf-8-sig"))) if n else []

def fl(r, c):
    try: return float(r[c])
    except (KeyError, ValueError, TypeError): return None

_cache = {}
def census(state, year):
    if (state, year) in _cache: return _cache[(state, year)]
    poa = state in POSTCODE_STATES
    if poa and year == 2021: z = zipfile.ZipFile(ROOT + f"data/raw/national/census-2021/2021_GCP_POA_{state}.zip"); geo, code, tt, to = "POA", "POA_CODE_2021", "G37", "G36"
    elif poa: z = zipfile.ZipFile(ROOT + f"data/raw/national/census-2016/2016_GCP_POA_{state}.zip"); geo, code, tt, to = "POA", "POA_CODE_2016", "G33", "G32"
    elif year == 2021: z = zipfile.ZipFile(ROOT + f"data/raw/national/census-2021/2021_GCP_SAL_{state}.zip"); geo, code, tt, to = "SAL", "SAL_CODE_2021", "G37", "G36"
    else: z = zipfile.ZipFile(ROOT + f"data/raw/national/census-2016/2016_GCP_SSC_{state}.zip"); geo, code, tt, to = "SSC", "SSC_CODE_2016", "G33", "G32"
    ten = read(z, rf"Census_{tt}_[A-Z]+_{geo}\.csv$"); occ = {r[code]: r for r in read(z, rf"Census_{to}_[A-Z]+_{geo}\.csv$")}
    med = {r[code]: r for r in read(z, rf"Census_G02_[A-Z]+_{geo}\.csv$")}
    out = {}
    for r in ten:
        c = re.sub(r"\D", "", r[code]); nm = c if poa else NAMES[str(year)].get(c)
        if not nm: continue
        tot = fl(r, "Total_Total") or 0
        flats = fl(r, "Total_DS_Flat_apart") or 0
        own = (fl(r, "O_OR_Total") or 0) + (fl(r, "O_MTG_Total") or 0); rent = fl(r, "R_Tot_Total") or 0
        o = occ.get(r[code], {}); m = med.get(r[code], {})
        un, tp = fl(o, "Unoccupied_PDs_Dwgs"), fl(o, "Total_PDs_Dwellings")
        inc, age = fl(m, "Median_tot_hhd_inc_weekly"), fl(m, "Median_age_persons")
        mr, mm = fl(m, "Median_rent_weekly"), fl(m, "Median_mortgage_repay_monthly")
        sf = None if poa else SEIFA.get(str(year), {}).get(c, {}).get("IRSAD")
        out[nm if poa else norm(nm)] = dict(
            dwellings=tot, flats=flats,
            own_all=own / (own + rent) if own + rent > 20 else None,
            flat_share=flats / tot if tot else None,
            unocc=un / tp if un is not None and tp else None,
            inc=inc if inc and inc > 0 else None, age=age if age and age > 0 else None,
            rent_inc=mr / inc if mr and inc and inc > 0 else None,
            mort_inc=(mm * 12 / 52) / inc if mm and inc and inc > 0 else None,
            seifa=sf,
        )
    _cache[(state, year)] = out
    return out

# ---------------- stats ----------------
def ranks(x):
    o = sorted(range(len(x)), key=lambda i: x[i]); r = [0.0] * len(x); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]: j += 1
        for t in range(i, j + 1): r[o[t]] = (i + j) / 2 + 1
        i = j + 1
    return r

def spearman(a, b):
    ra, rb = ranks(a), ranks(b); ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb)); den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else 0.0

def zs(x):
    m, s = st.mean(x), st.pstdev(x) or 1
    return [(v - m) / s for v in x]

MARKERS = ["own_all", "flat_share", "unocc", "inc", "age", "rent_inc", "mort_inc", "seifa", "level"]
APRIORI = {"own_all": +1, "flat_share": -1, "unocc": -1}

def cagr(a, b, n): return ((b / a) ** (1 / n) - 1) * 100

def rows(market, origin, fwd, min_dw=300):
    name, state, S, kind, _ = market
    C = census(state, origin); out = []
    for k, c in C.items():
        s = S.get(k)
        if not s or c["dwellings"] < min_dw: continue
        raw = state in POSTCODE_STATES
        need = [origin, origin + fwd] if raw else [origin - 1, origin, origin + fwd - 1, origin + fwd]
        if not all(y in s and s[y] > 0 for y in need): continue
        sm = (lambda y: s[y]) if raw else (lambda y: (s[y] + s[y - 1]) / 2)
        r = dict(sub=k, y=cagr(sm(origin), sm(origin + fwd), fwd), level=math.log(sm(origin)))
        for m in MARKERS[:-1]: r[m] = c[m]
        out.append(r)
    return out

def pairwise(rows_, score):
    a = [score(r) for r in rows_]; b = [r["y"] for r in rows_]
    idx = sorted(range(len(rows_)), key=lambda i: a[i]); q = max(len(idx) // 5, 3)
    top, bot = [b[i] for i in idx[-q:]], [b[i] for i in idx[:q]]; mkt = st.median(b)
    p = sum((t > u) + 0.5 * (t == u) for t in top for u in bot) / (len(top) * len(bot))
    return dict(n=len(rows_), rho=spearman(a, b), pair=p, bot_below=sum(v < mkt for v in bot) / len(bot), top_med=st.median(top), bot_med=st.median(bot), mkt=mkt)

def composite_fn(rows_, signs):
    use = [r for r in rows_ if all(r.get(m) is not None for m in signs)]
    if len(use) < 25: return None, use
    z = {m: zs([r[m] for r in use]) for m in signs}
    for i, r in enumerate(use): r["_s"] = sum(signs[m] * z[m][i] for m in signs)
    return (lambda r: r["_s"]), use

RESULTS = {"windows": {}}
print("=" * 100); print("PER-MARKER SPEARMAN RHO (marker at Census origin vs growth after). * = beyond 2 standard errors")
hdr = f"{'market':16s}{'window':>10s}{'n':>5s}" + "".join(f"{m:>10s}" for m in MARKERS)
print(hdr)
RHO = {}
for mk in MARKETS:
    for origin, fwd in mk[4]:
        rs = rows(mk, origin, fwd)
        if len(rs) < 25: print(f"{mk[0]:16s}{origin}->{origin+fwd:>5d}  too few ({len(rs)})"); continue
        line = f"{mk[0]:16s}{str(origin)+'->'+str(origin+fwd):>10s}{len(rs):5d}"
        for m in MARKERS:
            pts = [(r[m], r["y"]) for r in rs if r.get(m) is not None]
            if len(pts) < 25: line += f"{'-':>10s}"; continue
            rho = spearman([p[0] for p in pts], [p[1] for p in pts]); sig = abs(rho) > 2 / math.sqrt(len(pts) - 1)
            RHO[(mk[0], origin, fwd, m)] = (rho, sig, len(pts)); line += f"{rho:+9.2f}{'*' if sig else ' '}"
        print(line)

print("\n" + "=" * 100); print("A-PRIORI COMPOSITE (+owner share, -flat share, -unoccupied), set before any results; 'pair' = chance a random top-20% suburb outgrows a random bottom-20% suburb")
print(f"{'market':16s}{'window':>10s}{'n':>5s}{'rho':>7s}{'pair':>7s}{'bot<mkt':>9s}{'top med':>9s}{'bot med':>9s}{'mkt':>7s}")
for mk in MARKETS:
    for origin, fwd in mk[4]:
        rs = rows(mk, origin, fwd); f, use = composite_fn(rs, APRIORI)
        if f is None: continue
        r = pairwise(use, f); RESULTS["windows"][f"apriori|{mk[0]}|{origin}|{fwd}"] = r
        print(f"{mk[0]:16s}{str(origin)+'->'+str(origin+fwd):>10s}{r['n']:5d}{r['rho']:+7.2f}{r['pair']:7.0%}{r['bot_below']:9.0%}{r['top_med']:+8.1f}%{r['bot_med']:+8.1f}%{r['mkt']:+6.1f}%")

# ---- training: markers with consistent sign in 2016-origin windows of VIC and SA markets
train = [(mk[0], o, f) for mk in MARKETS for o, f in mk[4] if o == 2016]
print("\n" + "=" * 100); print(f"MARKER SELECTION on TRAINING windows (2016 origin, VIC+SA markets, {len(train)} windows): sign agreement")
sel = {}
for m in MARKERS:
    vals = [RHO[(a, o, f, m)] for a, o, f in train if (a, o, f, m) in RHO]
    pos = sum(1 for v in vals if v[0] > 0); neg = len(vals) - pos; sig_pos = sum(1 for v in vals if v[0] > 0 and v[1]); sig_neg = sum(1 for v in vals if v[0] < 0 and v[1])
    print(f"  {m:11s} windows {len(vals)}  positive {pos}  negative {neg}  significant+ {sig_pos}  significant- {sig_neg}")
    sg = +1 if sig_pos >= max(3, len(vals) * 0.5) and sig_neg == 0 else -1 if sig_neg >= max(3, len(vals) * 0.5) and sig_pos == 0 else 0
    if sg and m != "level": sel[m] = sg
print("\nSelected markers and signs:", sel)
RESULTS["selected"] = sel

print("\n" + "=" * 100); print("HELD-OUT TEST: selected-marker composite on 2021-origin windows (not used for selection) vs a-priori composite")
print(f"{'market':16s}{'window':>10s}{'n':>5s}{'sel rho':>9s}{'sel pair':>10s}{'sel bot<mkt':>12s}{'|':>3s}{'apri rho':>9s}{'apri pair':>10s}")
agg = []
for mk in MARKETS:
    for origin, fwd in mk[4]:
        if origin != 2021: continue
        rs = rows(mk, origin, fwd); fs, use = composite_fn(rs, sel) if sel else (None, [])
        fa, usea = composite_fn(rows(mk, origin, fwd), APRIORI)
        if fs is None or fa is None: continue
        a = pairwise(use, fs); b = pairwise(usea, fa); agg.append((a, b))
        RESULTS["windows"][f"selected|{mk[0]}|{origin}|{fwd}"] = a
        print(f"{mk[0]:16s}{str(origin)+'->'+str(origin+fwd):>10s}{a['n']:5d}{a['rho']:+9.2f}{a['pair']:10.0%}{a['bot_below']:12.0%}{'|':>3s}{b['rho']:+9.2f}{b['pair']:10.0%}")
if agg:
    print(f"\nmean pairwise (held-out): selected {st.mean(a['pair'] for a, _ in agg):.0%}   a-priori {st.mean(b['pair'] for _, b in agg):.0%}   ({len(agg)} windows)")

json.dump(RESULTS, open(ROOT + "data/backtest_multistate_results.json", "w"), indent=1)

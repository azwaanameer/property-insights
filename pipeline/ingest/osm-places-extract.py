"""Extract Victorian places (shops, cafes, parks, medical, gyms, libraries) from an OpenStreetMap extract.

Run (pyosmium is not installed system-wide; uv fetches it into its own cache, outside the repo):
  uv run --no-project --with osmium python -I pipeline/ingest/osm-places-extract.py [--input PBF_OR_OSM] [--out DIR] [--as-of YYYY-MM-DD]

Input defaults to the newest data/raw/vic/osm/australia-YYMMDD.osm.pbf (the Geofabrik Australia extract; Geofabrik publishes no
Victoria-only file). Nothing is fetched. Data is © OpenStreetMap contributors, ODbL 1.0. Writes, under data/out/osm-places/ (gitignored):
  places.jsonl   one JSON object per line: {"osm_id": "node/1", "category": "food", "name": "x" | null, "lat": -37.8, "lon": 144.9}
  manifest.json  as_of, retrieved_at, file_sha256, row_count, counts per category and per tag value, the Victoria box (written last)

What is kept. Features tagged shop in (supermarket, convenience, greengrocer, bakery), amenity in (cafe, restaurant, pharmacy, doctors,
clinic, hospital, library, gym) or leisure in (park, fitness_centre, playground), whose point lies inside Victoria's bounding box
(lon 140.9 to 150.1, lat -39.3 to -33.9). The box also takes in a few border towns of New South Wales; the loader does not try to remove
them. A feature needs ONE point: a node is itself, a way takes the centroid of its outline (the mean of its nodes if it has no area) and
a multipolygon relation takes the area-weighted centroid of its outer rings. The category rule below is the same one as
src/server/layers/shared/place-category.ts; src/server/layers/place-category.test.ts runs both over the same samples.

`--categories` reads a JSON list of tag objects on stdin and prints the category of each (used only by that parity test; it needs no
osmium and no file). Why pyosmium and not a hand-rolled reader: node locations for ways and the assembly of multipolygon areas are the
hard parts of the format, and pyosmium does them in C++. The tag filter runs in C++ too, so Python sees only the places.
"""
import hashlib, json, os, re, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# Victoria's bounding box (the loader checks every kept point against the same box).
LON_MIN, LON_MAX = 140.9, 150.1
LAT_MIN, LAT_MAX = -39.3, -33.9

# (key, value) pairs kept; the same fifteen tags as the category rule.
WANTED = [
    ("shop", "supermarket"), ("shop", "convenience"), ("shop", "greengrocer"), ("shop", "bakery"),
    ("amenity", "cafe"), ("amenity", "restaurant"), ("amenity", "pharmacy"), ("amenity", "doctors"),
    ("amenity", "clinic"), ("amenity", "hospital"), ("amenity", "library"), ("amenity", "gym"),
    ("leisure", "park"), ("leisure", "fitness_centre"), ("leisure", "playground"),
]


def classify(tags):
    """(category, deciding tag) for an element, or (None, None). Order matters only for an element tagged with more than one (it counts once)."""
    shop = tags.get("shop")
    amenity = tags.get("amenity")
    leisure = tags.get("leisure")
    if shop in ("supermarket", "convenience", "greengrocer", "bakery"):
        return "groceries", f"shop={shop}"
    if amenity in ("cafe", "restaurant"):
        return "food", f"amenity={amenity}"
    if leisure in ("park", "playground"):
        return "parks", f"leisure={leisure}"
    if amenity in ("pharmacy", "doctors", "clinic", "hospital"):
        return "medical", f"amenity={amenity}"
    if amenity == "gym":
        return "fitness", "amenity=gym"
    if leisure == "fitness_centre":
        return "fitness", "leisure=fitness_centre"
    if amenity == "library":
        return "library", "amenity=library"
    return None, None


def category_of(tags):
    """The one category an element belongs to, by its tags (the same rule as categoryOf in src/server/layers/shared/place-category.ts)."""
    return classify(tags)[0]


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def default_input():
    folder = os.path.join(ROOT, "data", "raw", "vic", "osm")
    found = sorted(n for n in os.listdir(folder) if re.fullmatch(r"australia-\d{6}\.osm\.pbf", n)) if os.path.isdir(folder) else []
    if not found:
        raise SystemExit(f"no australia-YYMMDD.osm.pbf in {folder}; download the Geofabrik Australia extract there")
    return os.path.join(folder, found[-1])


def as_of_from_name(path):
    m = re.search(r"-(\d{2})(\d{2})(\d{2})\.osm", os.path.basename(path))
    if not m:
        raise SystemExit(f"cannot read the extract date from the file name {os.path.basename(path)}; pass --as-of YYYY-MM-DD")
    return f"20{m.group(1)}-{m.group(2)}-{m.group(3)}"


def ring_points(nodes):
    """(lon, lat) of every node of a ring or way that has a location. Nodes with no location (outside the extract) are skipped."""
    pts = []
    for n in nodes:
        loc = n.location
        if loc.valid():
            pts.append((loc.lon, loc.lat))
    return pts


def ring_centroid(pts):
    """(area, lon, lat) of a closed ring by the shoelace formula; area is 0 for a degenerate ring (then the mean of its points is used)."""
    if len(pts) < 3:
        return None
    # Work relative to the first point so the sums stay small.
    x0, y0 = pts[0]
    a = cx = cy = 0.0
    for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
        xa -= x0; ya -= y0; xb -= x0; yb -= y0
        cross = xa * yb - xb * ya
        a += cross
        cx += (xa + xb) * cross
        cy += (ya + yb) * cross
    if abs(a) < 1e-18:
        return (0.0, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    a *= 0.5
    return (abs(a), x0 + cx / (6.0 * a), y0 + cy / (6.0 * a))


def way_point(pts, closed):
    if not pts:
        return None
    if closed and len(pts) >= 4:
        c = ring_centroid(pts[:-1] if pts[0] == pts[-1] else pts)
        if c:
            return c[1], c[2]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def area_point(area):
    """Area-weighted centroid of the outer rings of a multipolygon."""
    total = sx = sy = 0.0
    fallback = []
    for ring in area.outer_rings():
        pts = ring_points(ring)
        if pts and pts[0] == pts[-1]:
            pts = pts[:-1]
        c = ring_centroid(pts)
        if c is None:
            continue
        fallback.extend(pts)
        w = c[0] if c[0] > 0 else 1e-12
        total += w; sx += c[1] * w; sy += c[2] * w
    if total > 0:
        return sx / total, sy / total
    if fallback:
        return sum(p[0] for p in fallback) / len(fallback), sum(p[1] for p in fallback) / len(fallback)
    return None


def main():
    import osmium  # imported late so `--categories` needs no osmium

    INPUT = arg("--input") or default_input()
    OUT = arg("--out", os.path.join(ROOT, "data", "out", "osm-places"))
    if not os.path.isfile(INPUT):
        raise SystemExit(f"input not found: {INPUT}")
    as_of = arg("--as-of") or as_of_from_name(INPUT)

    tag_filter = osmium.filter.TagFilter(*WANTED)
    fp = osmium.FileProcessor(INPUT).with_areas(tag_filter).with_filter(tag_filter)

    found = {}  # osm_id -> record; a feature seen twice (a closed way and its area) is kept once
    seen = {"node": 0, "way": 0, "relation": 0}
    for o in fp:
        if o.is_node():
            kind, point = "node", ((o.location.lon, o.location.lat) if o.location.valid() else None)
            oid = f"node/{o.id}"
        elif o.is_way():
            kind = "way"
            oid = f"way/{o.id}"
            point = way_point(ring_points(o.nodes), o.is_closed())
        elif o.is_area():
            # A closed way also arrives as an area; the way itself is read above, so only relations are taken from areas.
            if o.from_way():
                continue
            kind = "relation"
            oid = f"relation/{o.orig_id()}"
            point = area_point(o)
        else:
            continue
        tags = {t.k: t.v for t in o.tags}
        category, tag = classify(tags)
        if category is None or point is None:
            continue
        lon, lat = point
        if not (LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX):
            continue
        name = tags.get("name", "").strip() or None
        seen[kind] += 1
        found[oid] = {"osm_id": oid, "category": category, "name": name, "lat": round(lat, 7), "lon": round(lon, 7), "tag": tag}

    counts = {}
    kinds = {}
    for r in found.values():
        counts[r["category"]] = counts.get(r["category"], 0) + 1
        kinds[r["tag"]] = kinds.get(r["tag"], 0) + 1

    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, "places.jsonl.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for oid in sorted(found):
            r = found[oid]
            f.write(json.dumps({k: r[k] for k in ("osm_id", "category", "name", "lat", "lon")}, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, os.path.join(OUT, "places.jsonl"))

    retrieved = datetime.fromtimestamp(os.path.getmtime(INPUT), tz=timezone.utc)
    manifest = {
        "source": "openstreetmap",
        "source_file": os.path.basename(INPUT),
        "as_of": as_of,
        "retrieved_at": retrieved.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "file_sha256": file_hash(INPUT),
        "row_count": len(found),
        "counts": dict(sorted(counts.items())),
        "counts_by_tag": dict(sorted(kinds.items())),
        "by_element": seen,
        "box": {"lon_min": LON_MIN, "lon_max": LON_MAX, "lat_min": LAT_MIN, "lat_max": LAT_MAX},
    }
    tmp = os.path.join(OUT, "manifest.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(OUT, "manifest.json"))
    print(f"osm-places-extract: {len(found)} places ({', '.join(f'{k} {v}' for k, v in sorted(counts.items()))}), as of {as_of}")


if __name__ == "__main__":
    if "--categories" in sys.argv:
        print(json.dumps([category_of(t) for t in json.load(sys.stdin)]))
    else:
        main()

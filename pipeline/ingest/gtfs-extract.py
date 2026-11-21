"""Extract Victorian public transport stops, by mode and the routes that serve them, from the PTV GTFS download.

Run:  python -I pipeline/ingest/gtfs-extract.py [--input ZIP_OR_DIR] [--out DIR] [--as-of YYYY-MM-DD]

Input is the outer vic_gtfs.zip (it holds N/google_transit.zip, one nested feed per network) or a directory laid out the same way,
where each N/ holds either google_transit.zip or the loose GTFS .txt files (the small committed test feed is a directory).
Nothing is unpacked to disk and nothing is fetched. Pure stdlib. Writes, under data/out/gtfs-vic/ (gitignored):
  stops.json     one entry per stop or station: key, name, mode, lat, lon, routes
  manifest.json  as_of, retrieved_at, file_sha256, row_count, per-mode counts, what was set aside

Method (the tram and bus stop_times.txt files are 400 to 500 MB, trips.txt runs to millions of rows, so nothing is loaded whole):
  1. routes.txt gives each route's mode from route_type: 0 tram; 2, 102 and 400 train; 3 and 701 bus; 204 coach.
     Routes of any other type are set aside and counted. A rail "Replacement Bus" route is not a train service and is dropped.
  2. trips.txt is streamed once and ONE trip is kept for each (route_id, shape_id or headsign, direction_id).
  3. stop_times.txt is streamed once; only rows of the kept trips are read, which tells which routes serve each stop.
  4. A stop nobody serves is dropped. Platforms that share a parent_station collapse into one station row (the parent's name
     and position when the feed lists the parent). The same station in two feeds of the same mode is one row.
  5. Stops outside the Victorian bounding box (interstate services reach Sydney and Adelaide) are dropped and counted.
"""
import csv, hashlib, io, json, os, re, sys, zipfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


INPUT = arg("--input", os.path.join(ROOT, "data", "raw", "vic", "gtfs", "vic_gtfs.zip"))
OUT = arg("--out", os.path.join(ROOT, "data", "out", "gtfs-vic"))
AS_OF_ARG = arg("--as-of")

# route_type -> mode. Anything else is set aside.
MODE_OF_TYPE = {0: "tram", 2: "train", 102: "train", 400: "train", 3: "bus", 701: "bus", 204: "coach"}
# Victoria's bounding box (a stop outside it is not a Victorian stop).
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -39.3, -33.9, 140.9, 150.1


def clean(v):
    return v.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Feed:
    """One GTFS feed: a mapping of file name to a binary stream, from a zip or a directory."""

    def __init__(self, label, opener, names):
        self.label = label
        self._open = opener
        self.names = names

    def open(self, name):
        return self._open(name)

    def rows(self, name):
        """Dict rows of a small file."""
        with io.TextIOWrapper(self.open(name), encoding="utf-8-sig", newline="") as t:
            yield from csv.DictReader(t)


def feeds_from_zip(path):
    outer = zipfile.ZipFile(path)
    found = []
    for n in outer.namelist():
        m = re.fullmatch(r"(\d+)/google_transit\.zip", n)
        if m:
            found.append((int(m.group(1)), n))
    as_of = max(datetime(*outer.getinfo(n).date_time[:3]).date() for _, n in found).isoformat() if found else None
    for num, n in sorted(found):
        inner = zipfile.ZipFile(io.BytesIO(outer.read(n)))
        yield Feed(str(num), inner.open, set(inner.namelist())), as_of


def feeds_from_dir(path):
    subs = sorted((int(d), d) for d in os.listdir(path) if d.isdigit() and os.path.isdir(os.path.join(path, d)))
    for num, d in subs:
        base = os.path.join(path, d)
        packed = os.path.join(base, "google_transit.zip")
        if os.path.exists(packed):
            inner = zipfile.ZipFile(packed)
            yield Feed(str(num), inner.open, set(inner.namelist())), None
        else:
            names = set(os.listdir(base))
            yield Feed(str(num), lambda n, b=base: open(os.path.join(b, n), "rb"), names), None


def write_atomic(path, dump):
    """Write to a temporary file in the same folder, then rename it over the target, so a reader never sees a half-written file."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        dump(f)
    os.replace(tmp, path)


def first_field(raw):
    """First CSV field of one raw (bytes) line, without parsing the rest."""
    if raw[:1] == b'"':
        end = raw.find(b'"', 1)
        return raw[1:end]
    return raw.split(b",", 1)[0].strip()


def route_label(r):
    short = (r.get("route_short_name") or "").strip()
    long_ = (r.get("route_long_name") or "").strip()
    # A coach route's short name is just "Coach"; the long name says where it goes.
    if short and short.lower() != "coach":
        return clean(short)
    return clean(long_ or short)


def process_feed(feed, stats):
    # 1. routes -> mode
    routes = {}
    for r in feed.rows("routes.txt"):
        try:
            rtype = int(r["route_type"])
        except (KeyError, ValueError):
            stats["routes_bad_type"] += 1
            continue
        mode = MODE_OF_TYPE.get(rtype)
        name = (r.get("route_short_name") or "").strip()
        if mode is None:
            stats["routes_set_aside"][str(rtype)] = stats["routes_set_aside"].get(str(rtype), 0) + 1
            continue
        if mode == "train" and name.lower() == "replacement bus":
            stats["replacement_bus_routes"] += 1
            continue
        routes[r["route_id"]] = (mode, route_label(r))

    # 2. trips: one representative per (route, shape or headsign, direction)
    keep = {}
    trip_route = {}
    with io.TextIOWrapper(feed.open("trips.txt"), encoding="utf-8-sig", newline="") as t:
        reader = csv.reader(t)
        header = next(reader)
        ix = {h: i for i, h in enumerate(header)}
        for row in reader:
            rid = row[ix["route_id"]]
            if rid not in routes:
                continue
            shape = row[ix["shape_id"]] if "shape_id" in ix else ""
            head = row[ix["trip_headsign"]] if "trip_headsign" in ix else ""
            direction = row[ix["direction_id"]] if "direction_id" in ix else ""
            key = (rid, shape or head, direction)
            if key not in keep:
                keep[key] = row[ix["trip_id"]]
                trip_route[row[ix["trip_id"]]] = rid
    stats["trips_kept"] += len(keep)
    wanted = {tid.encode("utf-8") for tid in trip_route}

    # 3. stop_times: only the kept trips
    served = {}  # stop_id -> set of route ids
    with feed.open("stop_times.txt") as f:
        head = f.readline().decode("utf-8-sig")
        header = next(csv.reader([head]))
        # first_field() reads the first column of each raw line as the trip id, so trip_id must be that column.
        if not header or header[0] != "trip_id":
            sys.exit(f"stop_times.txt in feed {feed.label} does not start with trip_id (starts with {header[:1]}); the feed layout has changed")
        t_i, s_i = header.index("trip_id"), header.index("stop_id")
        for raw in f:
            if first_field(raw) not in wanted:
                continue
            row = next(csv.reader([raw.decode("utf-8")]))
            served.setdefault(row[s_i], set()).add(trip_route[row[t_i]])
    return routes, served


def main():
    if not os.path.exists(INPUT):
        sys.exit(f"input not found: {INPUT}")
    is_zip = os.path.isfile(INPUT)
    source = feeds_from_zip(INPUT) if is_zip else feeds_from_dir(INPUT)

    stats = {"routes_bad_type": 0, "routes_set_aside": {}, "replacement_bus_routes": 0, "trips_kept": 0,
             "stops_outside_victoria": 0, "stops_without_service": 0, "stops_bad_coordinates": 0, "feeds": 0}
    stations = {}  # key -> {name, mode, lat, lon, routes:set}
    as_of_zip = None
    for feed, feed_as_of in source:
        as_of_zip = feed_as_of or as_of_zip
        stats["feeds"] += 1
        routes, served = process_feed(feed, stats)
        stops = {r["stop_id"]: r for r in feed.rows("stops.txt")}
        # The mode of a stop: the modes of the routes serving it. A stop served by two modes becomes one row per mode.
        for stop_id, route_ids in served.items():
            s = stops.get(stop_id)
            if s is None:
                continue
            by_mode = {}
            for rid in route_ids:
                mode, label = routes[rid]
                by_mode.setdefault(mode, set()).add(label)
            parent_id = (s.get("parent_station") or "").strip()
            anchor = stops.get(parent_id) if parent_id else None
            src = anchor or s
            try:
                lat, lon = float(src["stop_lat"]), float(src["stop_lon"])
            except (KeyError, ValueError):
                stats["stops_bad_coordinates"] += 1
                continue
            if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
                stats["stops_outside_victoria"] += 1
                continue
            name = clean(src.get("stop_name") or s.get("stop_name") or "")
            for mode, labels in by_mode.items():
                key = f"{mode}:{parent_id}" if parent_id else f"{mode}:{feed.label}:{stop_id}"
                cur = stations.get(key)
                if cur is None:
                    stations[key] = {"key": key, "name": name, "mode": mode, "lat": lat, "lon": lon, "routes": set(labels)}
                else:
                    cur["routes"].update(labels)
        # Stops listed but not served by any kept trip.
        stats["stops_without_service"] += sum(1 for sid, st in stops.items() if sid not in served and (st.get("location_type") or "0") in ("", "0"))

    out = sorted(stations.values(), key=lambda s: (s["mode"], s["key"]))
    for s in out:
        s["routes"] = sorted(s["routes"], key=lambda x: (len(x), x))

    # Resolve as_of before anything is written: a run that cannot date its data leaves no files behind.
    as_of = AS_OF_ARG or as_of_zip
    if not as_of:
        sys.exit("no as_of: pass --as-of YYYY-MM-DD when the input is a directory")
    os.makedirs(OUT, exist_ok=True)
    write_atomic(os.path.join(OUT, "stops.json"), lambda f: json.dump(out, f, ensure_ascii=False, separators=(",", ":")))
    if is_zip:
        retrieved = datetime.fromtimestamp(os.path.getmtime(INPUT), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        sha = file_hash(INPUT)
    else:
        retrieved = f"{as_of}T00:00:00Z"
        h = hashlib.sha256()
        for dirpath, _, files in sorted(os.walk(INPUT)):
            for fn in sorted(files):
                h.update(file_hash(os.path.join(dirpath, fn)).encode())
        sha = h.hexdigest()
    per_mode = {}
    for s in out:
        per_mode[s["mode"]] = per_mode.get(s["mode"], 0) + 1
    manifest = {"source": "gtfs_vic", "as_of": as_of, "retrieved_at": retrieved, "file_sha256": sha, "row_count": len(out),
                "per_mode": per_mode, "stats": stats}
    write_atomic(os.path.join(OUT, "manifest.json"), lambda f: json.dump(manifest, f, indent=2))
    print(f"wrote {len(out)} stops {per_mode} to {OUT}")


if __name__ == "__main__":
    main()

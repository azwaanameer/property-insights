"""Extract recorded crime from the Crime Statistics Agency (CSA) LGA Criminal Incidents workbook.

Run:  python -I pipeline/ingest/crime-extract.py [--input XLSX] [--out DIR] [--as-of YYYY-MM-DD]

Input defaults to data/raw/vic/crime/Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx. Nothing is fetched. Writes, under
data/out/crime-vic/ (gitignored):
  lga.json       Table 01: one entry per year and row of the table, with is_total set on the police-region "Total" rows
  suburb.json    Table 03 added up to offence subdivision: [year, lga, postcode, suburb, division, subdivision, incidents]
  notes.json     the workbook's own notices, read from the Contents and Footnotes sheets and stored as published
  manifest.json  as_of, retrieved_at, file_sha256, row counts, years and the control totals of the raw Table 03 rows (written last)

Why openpyxl read-only and not the `xlsx` npm package: the workbook is 17 MB and Table 03 alone has 341,870 rows. openpyxl's read-only mode
streams the rows in about fifteen seconds and constant memory; the npm package builds the whole workbook in memory. Pure stdlib otherwise.
The CSA writes the council area of Table 01 with a leading space and a bare "Total" row after each police region; both are handled in the
loader (pipeline/ingest/crime.mjs), which checks them. Here nothing is dropped or changed except trimming spaces and adding up
subgroup rows within a subdivision.
"""
import hashlib, json, os, sys
from collections import defaultdict
from datetime import datetime, timezone

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


INPUT = arg("--input", os.path.join(ROOT, "data", "raw", "vic", "crime", "Data_Tables_LGA_Criminal_Incidents_Year_Ending_June_2026.xlsx"))
OUT = arg("--out", os.path.join(ROOT, "data", "out", "crime-vic"))
AS_OF_ARG = arg("--as-of")

HEADERS = {
    "Table 01": ["Year", "Year ending", "Police Region", "Local Government Area", "Incidents Recorded", "Rate per 100,000 population"],
    "Table 03": ["Year", "Year ending", "Local Government Area", "Postcode", "Suburb/Town Name", "Offence Division", "Offence Subdivision", "Offence Subgroup", "Incidents Recorded"],
}


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def text(v):
    return "" if v is None else str(v).strip()


def whole(v, where):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v:
        raise SystemExit(f"{where}: expected a whole number, found {v!r}")
    return int(v)


def read_notes(wb):
    """The notices as published: Contents (data exclusions, notes, licence) and Footnotes (by table). Located by heading, not by row number."""
    notes = []
    topic = None
    seq = 0
    for row in wb["Contents"].iter_rows(values_only=True):
        cell = text(row[1]) if len(row) > 1 else ""
        title = text(row[2]) if len(row) > 2 else ""
        if cell in ("Data exclusions", "Notes"):
            topic, seq = ("exclusions" if cell == "Data exclusions" else "notes"), 0
            continue
        if cell == "Contents" or title:
            # The heading, or one line of the table of contents ("Table 01" in one cell and its title in the next).
            topic = None
            continue
        if topic and cell:
            seq += 1
            notes.append({"note_key": f"contents_{topic}_{seq}", "sheet": "Contents", "topic": topic, "seq": seq, "text": cell})
        elif not cell:
            topic = None
    table = None
    seq = 0
    for row in wb["Footnotes"].iter_rows(values_only=True):
        label = text(row[1]) if len(row) > 1 else ""
        body = text(row[2]) if len(row) > 2 else ""
        if label == "Table" and body == "Footnotes":
            continue
        if label.startswith("Table 0"):
            table, seq = label, 0
        if table and body:
            seq += 1
            key = table.lower().replace(" ", "")
            notes.append({"note_key": f"footnote_{key}_{seq}", "sheet": "Footnotes", "topic": table, "seq": seq, "text": body})
    return notes


def main():
    if not os.path.isfile(INPUT):
        raise SystemExit(f"input not found: {INPUT}")
    wb = openpyxl.load_workbook(INPUT, read_only=True, data_only=True)
    for name in ("Contents", "Footnotes", "Table 01", "Table 03"):
        if name not in wb.sheetnames:
            raise SystemExit(f"sheet {name} is missing; sheets are {wb.sheetnames}")

    notes = read_notes(wb)

    # ---- Table 01
    lga = []
    for i, row in enumerate(wb["Table 01"].iter_rows(values_only=True)):
        if i == 0:
            if [text(c) for c in row[:6]] != HEADERS["Table 01"]:
                raise SystemExit(f"Table 01 header changed: {list(row[:6])}")
            continue
        if row[0] is None:
            continue
        if text(row[1]) != "June":
            raise SystemExit(f"Table 01 row {i + 1}: year ending is {row[1]!r}, expected June")
        rate = row[5]
        if rate in (None, ""):
            rate = None
        elif isinstance(rate, (int, float)) and not isinstance(rate, bool):
            rate = float(rate)
        else:
            raise SystemExit(f"Table 01 row {i + 1}: rate is {rate!r}")
        name = text(row[3])
        lga.append(
            {
                "year": whole(row[0], f"Table 01 row {i + 1} year"),
                "police_region": text(row[2]),
                "lga": name,
                "is_total": name == "Total",
                "incidents": whole(row[4], f"Table 01 row {i + 1} incidents"),
                "rate_per_100k": rate,
            }
        )

    # ---- Table 03: added up to subdivision. Control totals are taken from the raw rows, before adding up.
    agg = defaultdict(int)
    raw_total = defaultdict(int)
    raw_rows = 0
    for i, row in enumerate(wb["Table 03"].iter_rows(values_only=True)):
        if i == 0:
            if [text(c) for c in row[:9]] != HEADERS["Table 03"]:
                raise SystemExit(f"Table 03 header changed: {list(row[:9])}")
            continue
        if row[0] is None:
            continue
        if text(row[1]) != "June":
            raise SystemExit(f"Table 03 row {i + 1}: year ending is {row[1]!r}, expected June")
        year = whole(row[0], f"Table 03 row {i + 1} year")
        n = whole(row[8], f"Table 03 row {i + 1} incidents")
        postcode = text(row[3])
        if postcode.endswith(".0"):
            postcode = postcode[:-2]
        agg[(year, text(row[2]), postcode, text(row[4]), text(row[5]), text(row[6]))] += n
        raw_total[year] += n
        raw_rows += 1

    suburb = [[y, l, p, s, d, sd, n] for (y, l, p, s, d, sd), n in sorted(agg.items())]

    retrieved = datetime.fromtimestamp(os.path.getmtime(INPUT), tz=timezone.utc)
    # The data's own date: the end of the newest year (the agency's years end in June), not the day the file was downloaded.
    as_of = AS_OF_ARG or f"{max(raw_total)}-06-30"
    manifest = {
        "source": "csa_crime_incidents",
        "source_file": os.path.basename(INPUT),
        "as_of": as_of,
        "retrieved_at": retrieved.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "file_sha256": file_hash(INPUT),
        "row_count": len(suburb),
        "lga_row_count": sum(1 for r in lga if not r["is_total"]),
        "lga_source_rows": len(lga),
        "table03_source_rows": raw_rows,
        "years": sorted({r["year"] for r in lga}),
        "table03_totals": {str(y): raw_total[y] for y in sorted(raw_total)},
    }

    os.makedirs(OUT, exist_ok=True)
    for name, value in (("lga.json", lga), ("suburb.json", suburb), ("notes.json", notes)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, separators=(",", ":"))
    tmp = os.path.join(OUT, "manifest.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(OUT, "manifest.json"))
    print(f"crime-extract: {len(lga)} council rows, {raw_rows} Table 03 rows -> {len(suburb)} suburb-subdivision rows, {len(notes)} notices, as of {as_of}")


if __name__ == "__main__":
    main()

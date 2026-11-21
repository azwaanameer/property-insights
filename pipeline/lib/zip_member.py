"""Print zip members as JSON: {"<pattern>": "<utf-8 text of the one member whose path matches the regex>"}.

Run:  python -I pipeline/lib/zip_member.py ZIP REGEX [REGEX ...]

Reads straight from the zip (nothing is unpacked). Each regex must match exactly one member, otherwise the script exits non-zero
with a message on stderr. Pure stdlib. Used by the census and locality-neighbour loaders, which are Node.
"""
import json, re, sys, zipfile

if len(sys.argv) < 3:
    sys.exit("usage: zip_member.py ZIP REGEX [REGEX ...]")

out = {}
with zipfile.ZipFile(sys.argv[1]) as z:
    names = z.namelist()
    for pattern in sys.argv[2:]:
        hits = [n for n in names if re.search(pattern, n)]
        if len(hits) != 1:
            sys.exit(f"pattern {pattern!r} matched {len(hits)} members in {sys.argv[1]}, expected exactly 1")
        out[pattern] = z.read(hits[0]).decode("utf-8-sig")

sys.stdout.reconfigure(encoding="utf-8")
sys.stdout.write(json.dumps(out))

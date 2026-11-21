// Minimal CSV and PSV reading for the ABS and G-NAF files (no third-party parser). Handles double-quoted fields with commas and "" escapes.

export function parseDelimitedLine(line, delimiter = ",") {
  // Pipe-separated G-NAF files do not use quoting: a stray quote character is data.
  if (delimiter !== ",") return line.split(delimiter);
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parse a whole text (header row, then rows) into objects keyed by header. Blank lines are skipped. */
export function parseDelimited(text, delimiter = ",") {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseDelimitedLine(lines[0], delimiter).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = parseDelimitedLine(l, delimiter);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

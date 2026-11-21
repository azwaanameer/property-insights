// The two tables the figure list cannot carry: the annual price series (L07) and the side-by-side suburb table (L09).
// Data comes from the layer payload only. Payloads are `unknown` on the wire, so each shape is checked before it is drawn.
import { Chip } from "../../server/contracts/layer";
import { REPORT } from "../../site/copy";
import { formatValue, NOT_AVAILABLE } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

interface SeriesRow { year: number; median_cents: number; low_count: boolean }
interface Meta { chip: Chip; source_ids: string[]; as_of: string | null }
interface Column { key: string; label: string; unit: string; chip: Chip; source_ids: string[]; as_of: string | null; note?: string }
interface CompareRow { sal_code: string; name: string; is_subject: boolean; values: Record<string, number | null>; thin: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isChip = (v: unknown): v is Chip => Chip.safeParse(v).success;
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isAsOf = (v: unknown): v is string | null => v === null || typeof v === "string";

function asMeta(v: unknown): Meta | null {
  if (!isObj(v) || !isChip(v.chip) || !isIds(v.source_ids) || !isAsOf(v.as_of)) return null;
  return { chip: v.chip, source_ids: v.source_ids, as_of: v.as_of };
}

function asSeries(v: unknown): SeriesRow[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is SeriesRow => isObj(r) && typeof r.year === "number" && typeof r.median_cents === "number").map((r) => ({ ...r, low_count: r.low_count === true }));
}

function Sources({ items }: { items: { source_ids: string[]; as_of: string | null }[] }) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const it of items) {
    const text = provenanceText(it.source_ids, it.as_of);
    if (!text) continue;
    if (!seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  }
  return parts.length > 0 ? <span>{parts.join("; ")}. </span> : null;
}

export function HistoryTable({ payload }: { payload: Record<string, unknown> }) {
  const raw = payload.price_series;
  const meta = asMeta(payload.price_series_meta);
  if (!isObj(raw) || !meta) return null;
  const series = { unit: asSeries(raw.unit), house: asSeries(raw.house) };
  const kinds = (["unit", "house"] as const).filter((k) => series[k].length > 0);
  if (kinds.length === 0) return null;
  const years = [...new Set(kinds.flatMap((k) => series[k].map((r) => r.year)))].sort((a, b) => a - b);
  return (
    <div className="tw">
      <table>
        <caption>
          {REPORT.historyCaption} <ChipBadge chip={meta.chip} />
        </caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            {kinds.map((k) => (
              <th scope="col" className="num" key={k}>{k === "unit" ? "Units" : "Houses"}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td>{y}</td>
              {kinds.map((k) => {
                const r = series[k].find((x) => x.year === y);
                return (
                  <td className="num" key={k}>
                    {r ? `${formatValue(r.median_cents, "AUD_cents")}${r.low_count ? " *" : ""}` : NOT_AVAILABLE}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabnote">
        <Sources items={[meta]} />{REPORT.thinNote}
      </p>
    </div>
  );
}

function asColumns(v: unknown): Column[] | null {
  if (!Array.isArray(v)) return null;
  const out: Column[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c.key !== "string" || typeof c.label !== "string" || typeof c.unit !== "string" || !isChip(c.chip) || !isIds(c.source_ids) || !isAsOf(c.as_of)) return null;
    out.push({ key: c.key, label: c.label, unit: c.unit, chip: c.chip, source_ids: c.source_ids, as_of: c.as_of, note: typeof c.note === "string" && c.note ? c.note : undefined });
  }
  return out;
}

function asRows(v: unknown): CompareRow[] | null {
  if (!Array.isArray(v)) return null;
  const out: CompareRow[] = [];
  for (const r of v) {
    if (!isObj(r) || typeof r.sal_code !== "string" || typeof r.name !== "string" || !isObj(r.values)) return null;
    out.push({
      sal_code: r.sal_code,
      name: r.name,
      is_subject: r.is_subject === true,
      values: r.values as Record<string, number | null>,
      thin: Array.isArray(r.thin) ? r.thin.filter((t): t is string => typeof t === "string") : [],
    });
  }
  return out;
}

export function CompareTable({ payload }: { payload: Record<string, unknown> }) {
  if (!isObj(payload.table)) return null;
  const columns = asColumns(payload.table.columns);
  const rows = asRows(payload.table.rows);
  if (!columns || !rows || rows.length === 0) return null;
  return (
    <div className="tw">
      <table>
        <caption>{REPORT.compareCaption}</caption>
        <thead>
          <tr>
            <th scope="col">Suburb</th>
            {columns.map((c) => (
              <th scope="col" className="num" key={c.key}>
                {c.label}
                <ChipBadge chip={c.chip} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sal_code} className={r.is_subject ? "me" : undefined}>
              <th scope="row">{r.name}{r.is_subject ? ` ${REPORT.thisSuburb}` : ""}</th>
              {columns.map((c) => {
                const v = r.values[c.key];
                // Only a number is drawn as a value; anything else (null, a string, an object) reads Not available.
                const text = typeof v === "number" ? formatValue(v, c.unit) : NOT_AVAILABLE;
                return <td className="num" key={c.key}>{`${text}${r.thin.includes(c.key) ? " *" : ""}`}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="colnotes">
        {columns
          .filter((c) => c.note)
          .map((c) => (
            <li key={c.key}>
              <b>{c.label}.</b> {c.note}
            </li>
          ))}
      </ul>
      <p className="tabnote">
        <Sources items={columns} />{REPORT.thinNote} {REPORT.sideBySide}
      </p>
    </div>
  );
}

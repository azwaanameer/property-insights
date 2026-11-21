// The screener table (L10) and the attribution list (L14). Both draw the layer payload only, check its shape first and leave out anything
// that does not fit. Nothing is worked out here: the ordering, the yields and the fifths were decided by the layer.
import { Chip } from "../../server/contracts/layer";
import { ATTRIBUTION, LAYER_NAMES, REPORT, SCREENER } from "../../site/copy";
import { formatDate, formatValue, NOT_AVAILABLE } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

interface Col { key: string; label: string; unit: string; chip: Chip; source_ids: string[]; as_of: string | null; note?: string }

function asCols(v: unknown): Col[] | null {
  if (!Array.isArray(v)) return null;
  const out: Col[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c.key !== "string" || typeof c.label !== "string" || typeof c.unit !== "string" || !Chip.safeParse(c.chip).success) return null;
    out.push({ key: c.key, label: c.label, unit: c.unit, chip: c.chip as Chip, source_ids: strings(c.source_ids), as_of: typeof c.as_of === "string" ? c.as_of : null, note: typeof c.note === "string" && c.note ? c.note : undefined });
  }
  return out;
}

export function ScreenerTable({ payload }: { payload: Record<string, unknown> }) {
  if (!isObj(payload.table)) return null;
  const columns = asCols(payload.table.columns);
  const rows = Array.isArray(payload.table.rows) ? payload.table.rows.filter(isObj) : [];
  if (!columns || rows.length === 0) return null;
  const ratingCol = isObj(payload.table.rating_column) && Chip.safeParse(payload.table.rating_column.chip).success ? payload.table.rating_column : null;
  const note = typeof payload.note === "string" ? payload.note : "";
  return (
    <div className="tw">
      <table>
        <caption>{SCREENER.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{SCREENER.suburb}</th>
            {columns.map((c) => (
              <th scope="col" className="num" key={c.key}>
                {c.label}
                <ChipBadge chip={c.chip} />
              </th>
            ))}
            {ratingCol && (
              <th scope="col">
                {SCREENER.ratingHead}
                <ChipBadge chip={ratingCol.chip as Chip} />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const values = isObj(r.values) ? r.values : {};
            const thin = strings(r.thin);
            const hops = isNum(r.hops) ? r.hops : 2;
            const cond = isObj(r.conditions) ? r.conditions : null;
            return (
              <tr key={`${String(r.sal_code)}-${i}`} className={r.is_subject === true ? "me" : undefined} data-hops={hops}>
                <th scope="row">
                  {String(r.name ?? "")}
                  <span className="hop"> {SCREENER.boundaries(hops)}</span>
                </th>
                {columns.map((c) => {
                  const v = values[c.key];
                  return <td className="num" key={c.key}>{`${isNum(v) ? formatValue(v, c.unit) : NOT_AVAILABLE}${thin.includes(c.key) ? " *" : ""}`}</td>;
                })}
                {ratingCol && <td>{cond && typeof cond.label === "string" ? `${cond.label}${isNum(cond.position) && isNum(cond.of) ? `, ${cond.position} of ${cond.of}` : ""}` : SCREENER.notRated}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="colnotes">
        {columns
          .filter((c) => c.note)
          .map((c) => (
            <li key={c.key}>
              <b>{c.label}.</b> {c.note} {provenanceText(c.source_ids, c.as_of)}.
            </li>
          ))}
        {ratingCol && typeof ratingCol.label === "string" && (
          <li>
            <b>{ratingCol.label}.</b> {SCREENER.ratingNote} {provenanceText(strings(ratingCol.source_ids), typeof ratingCol.as_of === "string" ? ratingCol.as_of : null)}.
          </li>
        )}
      </ul>
      {note && <p className="tabnote">{note}</p>}
      <p className="tabnote">{REPORT.thinNote}</p>
    </div>
  );
}

export function AttributionList({ payload }: { payload: Record<string, unknown> }) {
  const sources = Array.isArray(payload.sources) ? payload.sources.filter(isObj).filter((s) => typeof s.name === "string") : [];
  if (sources.length === 0) return null;
  const note = typeof payload.note === "string" ? payload.note : "";
  return (
    <div className="attrib">
      <ul>
        {sources.map((s) => {
          const usedBy = strings(s.used_by).map((id) => LAYER_NAMES[id] ?? id);
          const asOf = typeof s.as_of === "string" ? formatDate(s.as_of) : "";
          return (
            <li key={String(s.source_id)} data-source={String(s.source_id)}>
              <b>{String(s.name)}.</b>{" "}
              {typeof s.credit_url === "string" && s.credit_url.startsWith("https://") ? (
                <a href={s.credit_url} target="_blank" rel="noopener noreferrer">{typeof s.attribution_text === "string" ? s.attribution_text : ""}</a>
              ) : typeof s.attribution_text === "string" ? s.attribution_text : ""}
              {s.adapted === true && !(typeof s.attribution_text === "string" && s.attribution_text.includes(ATTRIBUTION.adapted.replace(/\.$/, ""))) ? ` ${ATTRIBUTION.adapted}` : ""}
              <span className="meta">
                {ATTRIBUTION.licence}: {typeof s.licence === "string" ? s.licence : ""}
                {typeof s.licence_url === "string" && s.licence_url.startsWith("https://") ? (
                  <>
                    {" ("}
                    <a href={s.licence_url} target="_blank" rel="noopener noreferrer">{s.licence_url}</a>
                    {")"}
                  </>
                ) : null}
                . {ATTRIBUTION.asOf}: {asOf || ATTRIBUTION.noDate}.
                {usedBy.length > 0 ? ` ${ATTRIBUTION.usedIn}: ${usedBy.join(", ")}.` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="tabnote">{note}</p>}
    </div>
  );
}

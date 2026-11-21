// The recorded crime panel (L18): the offence table, the five-year totals, the council area rate beside the Victorian rate, and the Crime
// Statistics Agency's notices as published. It draws the layer payload only, checks every shape first and leaves out what does not fit.
// Nothing is worked out here, nothing is coloured as good or bad, and no area is ranked or labelled.
import { Chip } from "../../server/contracts/layer";
import { CRIME } from "../../site/copy";
import { formatValue, NOT_AVAILABLE } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

/** A count, or "None listed" when the agency lists none (not a zero: the agency lists only offences that occurred). */
const countText = (v: unknown) => (isNum(v) ? formatValue(v, "count") : CRIME.noneListed);

export function SafetyPanel({ payload }: { payload: Record<string, unknown> }) {
  const suburb = isObj(payload.suburb) ? payload.suburb : null;
  const year = isNum(payload.year_ending) ? payload.year_ending : null;
  if (!suburb || !str(suburb.name) || year === null) return null;
  const previous = isNum(payload.previous_year) ? payload.previous_year : null;
  const table = list(payload.table).filter(isObj).filter((r) => str(r.subdivision) && isNum(r.latest));
  const series = list(payload.series).filter(isObj).filter((r) => isNum(r.year_ending));
  const councils = list(payload.councils).filter(isObj).filter((c) => str(c.lga));
  const victoria = isObj(payload.victoria) && isNum(payload.victoria.rate_per_100k) ? payload.victoria : null;
  const notices = list(payload.notices).filter(isObj).filter((n) => str(n.text));
  const scope = strings(payload.scope_notes);
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;

  // The offence table is grouped by division, in the order the agency numbers them.
  const divisions = [...new Set(table.map((r) => str(r.division)))].sort();

  return (
    <div className="tw" data-panel="crime">
      {(notices.length > 0 || scope.length > 0) && (
        <ul className="notices" aria-label={CRIME.noticesLabel}>
          {scope.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {notices.map((n) => (
            <li key={str(n.key) || str(n.text)} data-csa-notice="">
              {n.text as string}
            </li>
          ))}
        </ul>
      )}
      {table.length > 0 && (
        <table>
          <caption>{CRIME.offenceCaption(str(suburb.name), str(suburb.postcode), year)}</caption>
          <thead>
            <tr>
              <th scope="col">{CRIME.offenceHead.type}</th>
              {previous !== null && (
                <th scope="col" className="num">
                  {CRIME.offenceHead.year(previous)}
                </th>
              )}
              <th scope="col" className="num">
                {CRIME.offenceHead.year(year)}
              </th>
            </tr>
          </thead>
          {divisions.map((d) => (
            <tbody key={d}>
              <tr className="divrow">
                <th scope="colgroup" colSpan={previous !== null ? 3 : 2}>
                  {d}
                </th>
              </tr>
              {table
                .filter((r) => str(r.division) === d)
                .map((r) => (
                  <tr key={str(r.subdivision)}>
                    <th scope="row">{str(r.subdivision)}</th>
                    {previous !== null && <td className="num">{countText(r.previous)}</td>}
                    <td className="num">{countText(r.latest)}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      )}
      {series.length > 0 && (
        <table>
          <caption>{CRIME.seriesCaption(str(suburb.name))}</caption>
          <thead>
            <tr>
              <th scope="col">{CRIME.seriesHead.year}</th>
              <th scope="col" className="num">{CRIME.seriesHead.total}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={String(r.year_ending)}>
                <th scope="row">{String(r.year_ending)}</th>
                <td className="num">{countText(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(councils.length > 0 || victoria) && (
        <table>
          <caption>{CRIME.rateCaption(year)}</caption>
          <thead>
            <tr>
              <th scope="col">{CRIME.rateHead.area}</th>
              <th scope="col" className="num">{CRIME.rateHead.incidents}</th>
              <th scope="col" className="num">{CRIME.rateHead.rate}</th>
            </tr>
          </thead>
          <tbody>
            {councils.map((c) => (
              <tr key={str(c.lga)}>
                <th scope="row">{CRIME.councilArea(str(c.lga))}</th>
                <td className="num">{isNum(c.incidents) ? formatValue(c.incidents, "count") : NOT_AVAILABLE}</td>
                <td className="num">{isNum(c.rate_per_100k) ? formatValue(c.rate_per_100k, "per_100k") : NOT_AVAILABLE}</td>
              </tr>
            ))}
            {victoria && (
              <tr>
                <th scope="row">{CRIME.victoria}</th>
                <td className="num">{isNum(victoria.incidents) ? formatValue(victoria.incidents, "count") : NOT_AVAILABLE}</td>
                <td className="num">{formatValue(victoria.rate_per_100k as number, "per_100k")}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {meta && (
        <p className="tabnote">
          <ChipBadge chip={meta.chip as Chip} /> {provenanceText(strings(meta.source_ids), typeof meta.as_of === "string" ? meta.as_of : null)}.
        </p>
      )}
    </div>
  );
}

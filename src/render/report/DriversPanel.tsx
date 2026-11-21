// The price-driver panel (L04): each driver's difference in sale price with its standard error and sample size, this suburb against the reference
// suburb, and the middle reported sale price by layout where the suburb has enough sales. It draws the layer payload only and checks every shape.
// These are associations in past sales, never causes, and the panel says so first. No price for the address is worked out here.
import { Chip } from "../../server/contracts/layer";
import { DRIVERS } from "../../site/copy";
import { formatDate, formatPercent, formatValue } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

export function DriversPanel({ payload }: { payload: Record<string, unknown> }) {
  const drivers = list(payload.drivers)
    .filter(isObj)
    .filter((d) => str(d.key) && str(d.label) && isNum(d.effect_pct) && isNum(d.se_pct));
  if (drivers.length === 0) return null;
  const suburb = isObj(payload.suburb) && str(payload.suburb.name) ? payload.suburb : null;
  const layouts = list(payload.layouts)
    .filter(isObj)
    .filter((l) => str(l.label) && isNum(l.median_cents) && isNum(l.n));
  const notes = strings(payload.notes);
  const model = isObj(payload.model) ? payload.model : null;
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;
  const credit = str(payload.credit);
  const suburbRow = suburb && !suburb.is_reference && isNum(suburb.effect_pct) && isNum(suburb.se_pct);

  return (
    <div className="tw" data-panel="drivers">
      <ul className="notices" aria-label={DRIVERS.notesLabel}>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <table>
        <caption>
          {DRIVERS.driversCaption} ({DRIVERS.association})
        </caption>
        <thead>
          <tr>
            <th scope="col">{DRIVERS.driversHead.driver}</th>
            <th scope="col" className="num">{DRIVERS.driversHead.effect}</th>
            <th scope="col" className="num">{DRIVERS.driversHead.se}</th>
            <th scope="col" className="num">{DRIVERS.driversHead.sales}</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={str(d.key)} data-driver={str(d.key)}>
              <th scope="row">{str(d.label)}</th>
              <td className="num">{formatPercent(d.effect_pct as number, true)}</td>
              <td className="num">{`${(d.se_pct as number).toFixed(1)}%`}</td>
              <td className="num">{isNum(d.n_group) ? formatValue(d.n_group, "count") : "-"}</td>
            </tr>
          ))}
          {suburb && suburbRow && (
            <tr data-driver="suburb">
              <th scope="row">
                {str(suburb.name)} compared with {str(suburb.reference)}
              </th>
              <td className="num">{formatPercent(suburb.effect_pct as number, true)}</td>
              <td className="num">{`${(suburb.se_pct as number).toFixed(1)}%`}</td>
              <td className="num">{isNum(suburb.n) ? formatValue(suburb.n, "count") : "-"}</td>
            </tr>
          )}
        </tbody>
      </table>
      {suburb && !suburbRow && (
        <p className="tabnote" data-driver="suburb">
          {suburb.is_reference ? DRIVERS.suburbReference(str(suburb.name)) : DRIVERS.suburbThin(str(suburb.name))}
        </p>
      )}
      {suburb && layouts.length > 0 && (
        <table>
          <caption>{DRIVERS.layoutsCaption(str(suburb.name))}</caption>
          <thead>
            <tr>
              <th scope="col">{DRIVERS.layoutsHead.layout}</th>
              <th scope="col" className="num">{DRIVERS.layoutsHead.median}</th>
              <th scope="col" className="num">{DRIVERS.layoutsHead.sales}</th>
            </tr>
          </thead>
          <tbody>
            {layouts.map((l) => (
              <tr key={str(l.label)}>
                <th scope="row">{str(l.label)}</th>
                <td className="num">{formatValue(l.median_cents as number, "AUD_cents")}</td>
                <td className="num">{formatValue(l.n as number, "count")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tabnote" data-credit="rp_sold_listings">
        {model && isNum(model.n_used) && isNum(model.n_total) && str(model.window_from) && str(model.window_to)
          ? `${DRIVERS.windowLine(formatValue(model.n_used, "count"), formatValue(model.n_total, "count"), formatDate(str(model.window_from)), formatDate(str(model.window_to)))} `
          : ""}
        {credit}
        {meta && (
          <>
            {" "}
            <ChipBadge chip={meta.chip as Chip} /> {provenanceText(strings(meta.source_ids), typeof meta.as_of === "string" ? meta.as_of : null)}.
          </>
        )}
      </p>
    </div>
  );
}

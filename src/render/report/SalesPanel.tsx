// The reported recent sales panel (L21): a compact table of sales in the same building or on the same street, each with its date, price, beds,
// baths, car spaces, address and a link to its realestate.com.au listing page, every one labelled as reported and never as verified.
// It draws the layer payload only, checks every shape first and leaves out what does not fit. Nothing is worked out here.
import { Chip } from "../../server/contracts/layer";
import { SALES } from "../../site/copy";
import { formatDate, formatValue } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

/** Links go only to the listing site; anything else in a payload is not drawn as a link. */
const LISTING_PREFIX = "https://www.realestate.com.au/";

/** A count the listing gave, or "Not listed". A zero is a real count (no car space), not a gap. */
const count = (v: unknown) => (isNum(v) ? formatValue(v, "count") : SALES.notListed);

export function SalesPanel({ payload }: { payload: Record<string, unknown> }) {
  const sales = list(payload.sales)
    .filter(isObj)
    .filter((s) => str(s.listing_id) && str(s.sold_on) && isNum(s.price_cents) && str(s.address));
  if (sales.length === 0) return null;
  const scope = payload.scope === "street" ? "street" : "building";
  const notes = strings(payload.notes);
  const total = isNum(payload.total) ? payload.total : sales.length;
  const windowObj = isObj(payload.window) ? payload.window : null;
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;
  const credit = str(payload.credit);
  return (
    <div className="tw" data-panel="sales">
      <ul className="notices" aria-label={SALES.notesLabel}>
        <li>{SALES.reportedLabel}</li>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <table>
        <caption>{scope === "street" ? SALES.streetCaption : SALES.buildingCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{SALES.head.sold}</th>
            <th scope="col" className="num">{SALES.head.price}</th>
            <th scope="col" className="num">{SALES.head.beds}</th>
            <th scope="col" className="num">{SALES.head.baths}</th>
            <th scope="col" className="num">{SALES.head.car}</th>
            <th scope="col">{SALES.head.address}</th>
            <th scope="col">{SALES.head.listing}</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const link = str(s.link);
            return (
              <tr key={str(s.listing_id)} data-sale={str(s.listing_id)}>
                <th scope="row">{formatDate(str(s.sold_on))}</th>
                <td className="num">{formatValue(s.price_cents as number, "AUD_cents")}</td>
                <td className="num">{count(s.bed)}</td>
                <td className="num">{count(s.bath)}</td>
                <td className="num">{count(s.park)}</td>
                <td>{str(s.address)}</td>
                <td>
                  {link.startsWith(LISTING_PREFIX) ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" title={SALES.linkTitle}>
                      {SALES.linkText}
                    </a>
                  ) : (
                    SALES.notListed
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tabnote" data-credit="rp_sold_listings">
        {SALES.showing(sales.length, total)}
        {windowObj && str(windowObj.from) && str(windowObj.to) && isNum(payload.suburbs) && str(payload.harvested_on)
          ? ` ${SALES.dataset(formatDate(str(windowObj.from)), formatDate(str(windowObj.to)), payload.suburbs, formatDate(str(payload.harvested_on)))}`
          : ""}{" "}
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

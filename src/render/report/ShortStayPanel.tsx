// The short-stay income panel (L06): how the figure was worked out, the assumption about bedrooms and bathrooms, the notes, and the table of the
// nearest comparable listings behind it. The income tiles themselves come from the section's figures. It draws the layer payload only, checks every
// shape first and leaves out what does not fit. Nothing is worked out here. The AirDNA credit is fixed text, so a payload change cannot drop it.
import { Chip } from "../../server/contracts/layer";
import { SHORTSTAY } from "../../site/copy";
import { formatValue } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

/** A comparable listing's link goes only to Airbnb's own site; anything else in a payload is not drawn as a link. */
const LISTING_LINK = /^https:\/\/([a-z0-9-]+\.)*airbnb\.(com|com\.au)\//i;

const count = (v: unknown) => (isNum(v) ? formatValue(v, "count") : SHORTSTAY.notListed);

export function ShortStayPanel({ payload }: { payload: Record<string, unknown> }) {
  const method = str(payload.method_text);
  const comps = list(payload.comps)
    .filter(isObj)
    .filter((c) => str(c.id) && isNum(c.revenue_cents));
  const notes = strings(payload.notes);
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;
  return (
    <div className="tw" data-panel="shortstay">
      <ul className="notices" aria-label={SHORTSTAY.notesLabel}>
        {method && (
          <li data-method={str(payload.method)}>
            <b>{SHORTSTAY.methodLabel}:</b> {method}.
          </li>
        )}
        {isNum(payload.bedrooms) && isNum(payload.bathrooms) && payload.assumed === true && <li>{SHORTSTAY.assumedLine(payload.bedrooms, payload.bathrooms)}</li>}
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {comps.length > 0 && (
        <table>
          <caption>{SHORTSTAY.compsCaption}</caption>
          <thead>
            <tr>
              <th scope="col" className="num">{SHORTSTAY.head.distance}</th>
              <th scope="col" className="num">{SHORTSTAY.head.beds}</th>
              <th scope="col" className="num">{SHORTSTAY.head.baths}</th>
              <th scope="col" className="num">{SHORTSTAY.head.income}</th>
              <th scope="col" className="num">{SHORTSTAY.head.reviews}</th>
              <th scope="col">{SHORTSTAY.head.listing}</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c) => {
              const link = str(c.link);
              return (
                <tr key={str(c.id)} data-comp={str(c.id)} data-weak={c.strong === false ? "" : undefined}>
                  <td className="num">{isNum(c.distance_m) ? formatValue(c.distance_m, "metres") : SHORTSTAY.notListed}</td>
                  <td className="num">{count(c.bedrooms)}</td>
                  <td className="num">{count(c.bathrooms)}</td>
                  <td className="num">
                    {formatValue(c.revenue_cents as number, "AUD_cents")}
                    {c.strong === false && <span title={SHORTSTAY.weak}> *</span>}
                  </td>
                  <td className="num">{count(c.reviews)}</td>
                  <td>
                    {LISTING_LINK.test(link) ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" title={SHORTSTAY.linkTitle}>
                        {SHORTSTAY.linkText}
                      </a>
                    ) : (
                      SHORTSTAY.notListed
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="tabnote" data-credit="airdna_rentalizer">
        {comps.some((c) => c.strong === false) && <>* {SHORTSTAY.weak} </>}
        {SHORTSTAY.straightLine} {SHORTSTAY.credit}
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

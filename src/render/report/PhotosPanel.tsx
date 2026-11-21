// The street and neighbourhood photos (L19) and nearby places (L20). Each draws the layer payload only and checks every shape first.
// An image is drawn only with its author, licence and a link to its source page: an image that lacks any of them is left out, so there is
// never a photo without a credit. Images load from the vendor's own server, unaltered (shown whole, never cropped), and are not proxied.
import { PHOTOS, PLACES } from "../../site/copy";
import { formatValue } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";
import { Chip } from "../../server/contracts/layer";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");
const https = (v: unknown): v is string => typeof v === "string" && v.startsWith("https://");

interface Shot {
  key: string;
  thumb: string;
  alt: string;
  by: string;
  licence: string;
  licenceUrl: string | null;
  source: string;
  caption: string;
}

function Figure({ s }: { s: Shot }) {
  return (
    <figure className="shot" data-photo="">
      <a href={s.source} target="_blank" rel="noopener noreferrer" className="shotimg">
        <img src={s.thumb} alt={s.alt} loading="lazy" decoding="async" />
      </a>
      <figcaption>
        <span className="shotcap">{s.caption}</span>
        <span className="credit">
          {PHOTOS.by} {s.by}. {s.licenceUrl ? (
            <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer">{s.licence}</a>
          ) : (
            s.licence
          )}
          . <a href={s.source} target="_blank" rel="noopener noreferrer">{PHOTOS.source}</a>
        </span>
      </figcaption>
    </figure>
  );
}

/** A photo with every part of its credit, or null. */
function asShot(raw: unknown, kind: "street" | "place"): Shot | null {
  if (!isObj(raw)) return null;
  const by = str(kind === "street" ? raw.creator : raw.author).trim();
  const licence = str(raw.licence).trim();
  if (!by || !licence || !https(raw.thumb_url) || !https(raw.source_url) || !str(raw.alt)) return null;
  const licenceUrl = https(raw.licence_url) ? raw.licence_url : null;
  const caption = kind === "street" ? (isNum(raw.year) ? PHOTOS.streetCaption(raw.year, str(raw.facing)) : "") : str(raw.title).replace(/\.[A-Za-z]+$/, "").replace(/_/g, " ");
  const key = str(kind === "street" ? raw.id : raw.title) || raw.thumb_url;
  return { key, thumb: raw.thumb_url, alt: str(raw.alt), by, licence, licenceUrl, source: raw.source_url, caption };
}

export function PhotosPanel({ payload }: { payload: Record<string, unknown> }) {
  const street = list(payload.street).map((r) => asShot(r, "street")).filter((s): s is Shot => s !== null);
  const places = list(payload.places).map((r) => asShot(r, "place")).filter((s): s is Shot => s !== null);
  const notes = strings(payload.notes);
  if (street.length === 0 && places.length === 0) return null;
  return (
    <div className="photos" data-panel="photos">
      {notes.length > 0 && (
        <ul className="notices" aria-label={PHOTOS.notesLabel}>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {street.length > 0 && (
        <>
          <h3>{PHOTOS.streetHeading}</h3>
          <div className="shots">
            {street.map((s) => (
              <Figure key={s.key} s={s} />
            ))}
          </div>
        </>
      )}
      {places.length > 0 && (
        <>
          <h3>{PHOTOS.placesHeading}</h3>
          <div className="shots">
            {places.map((s) => (
              <Figure key={s.key} s={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PlacesPanel({ payload }: { payload: Record<string, unknown> }) {
  const cats = list(payload.categories).filter(isObj).filter((c) => str(c.heading));
  if (cats.length === 0) return null;
  const notes = strings(payload.notes);
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;
  return (
    <div className="tw" data-panel="places">
      <table>
        <caption>{PLACES.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{PLACES.head.kind}</th>
            <th scope="col">{PLACES.head.nearest}</th>
            <th scope="col" className="num">{PLACES.head.distance}</th>
            <th scope="col" className="num">{PLACES.head.within400}</th>
            <th scope="col" className="num">{PLACES.head.within800}</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => {
            const n = isObj(c.nearest) ? c.nearest : null;
            return (
              <tr key={str(c.key) || str(c.heading)}>
                <th scope="row">{str(c.heading)}</th>
                <td>{n ? str(n.name) || PLACES.unnamed : PLACES.none}</td>
                <td className="num">{n && isNum(n.distance_m) ? formatValue(n.distance_m, "metres") : PLACES.dash}</td>
                <td className="num">{isNum(c.within_400) ? formatValue(c.within_400, "count") : PLACES.dash}</td>
                <td className="num">{isNum(c.within_800) ? formatValue(c.within_800, "count") : PLACES.dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="colnotes">
        <li>{PLACES.straightLine}</li>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="tabnote" data-credit="openstreetmap">
        <a href={PLACES.credit.url} target="_blank" rel="noopener noreferrer">
          {PLACES.credit.text}
        </a>
        {meta ? ". " : ""}
        {meta && (
          <>
            <ChipBadge chip={meta.chip as Chip} /> {provenanceText(strings(meta.source_ids), typeof meta.as_of === "string" ? meta.as_of : null)}.
          </>
        )}
      </p>
    </div>
  );
}

// The conditions rating (L15), drawn from the layer payload only. In `rating` mode: the five fifths with the suburb's marked, the label
// "conditions rating, not a price forecast", and the past-test result exactly as the validation row gave it. In any other mode there is
// no band to draw: the descriptive profile is shown as figures and this panel only says it is descriptive, not a rating (AD-5).
import { Chip } from "../../server/contracts/layer";
import { RATING } from "../../site/copy";
import { formatDate } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function RatingPanel({ payload }: { payload: Record<string, unknown> }) {
  if (payload.mode === "profile" && typeof payload.profile_note === "string") {
    return (
      <p className="means gapmsg" role="note">
        <b>{RATING.profileTitle}.</b> {payload.profile_note.replace(/^Descriptive, not a rating\.\s*/, "")}
      </p>
    );
  }
  if (payload.mode !== "rating" || !isObj(payload.rating)) return null;
  const { fifth, fifth_label, position, of } = payload.rating;
  if (typeof fifth !== "number" || fifth < 1 || fifth > 5 || typeof fifth_label !== "string" || typeof position !== "number" || typeof of !== "number") return null;
  const label = typeof payload.label === "string" ? payload.label : "";
  const meta = isObj(payload.meta) && Chip.safeParse(payload.meta.chip).success ? payload.meta : null;
  const v = isObj(payload.validation) ? payload.validation : null;
  const range = v && typeof v.range === "string" ? v.range : null;
  const windows = v && typeof v.windows === "string" ? v.windows : "";
  const checked = v && typeof v.checked_on === "string" ? formatDate(v.checked_on) : null;
  return (
    <div className="rating" data-fifth={fifth}>
      <p className="rating-label">
        {label} {meta && <ChipBadge chip={meta.chip as Chip} />}
      </p>
      <ol className="fifths" aria-label={RATING.barCaption}>
        {RATING.fifths.map((name, i) => (
          <li key={name} className={i + 1 === fifth ? "on" : undefined} aria-current={i + 1 === fifth ? "true" : undefined}>
            <span>{name}</span>
          </li>
        ))}
      </ol>
      <p className="tabnote">{RATING.barLabel(fifth_label, position, of)}.</p>
      <p className="tabnote">{RATING.how}</p>
      {range && (
        <p className="means">
          <b>{RATING.testTitle}.</b> {RATING.test(range, windows, checked)} {RATING.limits}
        </p>
      )}
      {meta && Array.isArray(meta.source_ids) && <p className="tabnote">{provenanceText(meta.source_ids.filter((x): x is string => typeof x === "string"), typeof meta.as_of === "string" ? meta.as_of : null)}.</p>}
    </div>
  );
}

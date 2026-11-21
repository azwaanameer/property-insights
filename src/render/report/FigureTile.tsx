import type { Chip, Figure } from "../../server/contracts/layer";
import { REPORT, SOURCE_NAMES } from "../../site/copy";
import { formatDate, formatFigure } from "../format";

export const CHIP_CLASS: Record<Chip, string> = { Observed: "obs", Estimated: "est", Unknown: "unk", Conflict: "con" };

/** The evidence chip. Every figure shows one. */
export function ChipBadge({ chip }: { chip: Chip }) {
  return (
    <span className={`chip ${CHIP_CLASS[chip]}`}>
      <i />
      {chip}
    </span>
  );
}

export function sourceNames(ids: string[]): string {
  return [...new Set(ids.map((id) => SOURCE_NAMES[id] ?? id))].join(", ");
}

/** "Valuer-General Victoria, as at 31 Mar 2026". Only the parts that exist are joined, so there is never a leading comma. */
export function provenanceText(source_ids: string[], as_of: string | null): string {
  return [sourceNames(source_ids), as_of ? `as at ${formatDate(as_of)}` : ""].filter(Boolean).join(", ");
}

export function Provenance({ source_ids, as_of }: { source_ids: string[]; as_of: string | null }) {
  return <span className="prov">{provenanceText(source_ids, as_of)}</span>;
}

/** One figure: caption, value (formatted by its unit), chip, the note that says how it was derived, and where it came from. */
export function FigureTile({ figure }: { figure: Figure }) {
  const missing = figure.value === null;
  return (
    <div className="tile" data-figure={figure.key}>
      <div className="cap">{figure.label}</div>
      <div className={missing ? "val na" : "val"}>{missing ? REPORT.notAvailable : formatFigure(figure)}</div>
      <ChipBadge chip={figure.chip} />
      {figure.note && <div className="sub">{figure.note}</div>}
      <Provenance source_ids={figure.source_ids} as_of={figure.as_of} />
    </div>
  );
}

// Small constructors so every suburb-layer figure carries a chip, source ids and an as_of (AD-1, AD-7).
import type { Chip, Figure } from "../../contracts/layer";

export interface FigureInit {
  key: string;
  label: string;
  value: Figure["value"];
  unit?: string;
  chip: Chip;
  source_ids: string[];
  as_of: string | null;
  note?: string;
}

export function figure(init: FigureInit): Figure {
  const f: Figure = { key: init.key, label: init.label, value: init.value, chip: init.chip, source_ids: init.source_ids, as_of: init.as_of };
  if (init.unit) f.unit = init.unit;
  if (init.note) f.note = init.note;
  return f;
}

/** A missing figure: value null, chip Unknown, and a note that says why (AD-9). */
export function gapFigure(init: { key: string; label: string; unit?: string; source_ids: string[]; as_of: string | null; note: string }): Figure {
  return figure({ ...init, value: null, chip: "Unknown" });
}

export const joinNotes = (...parts: (string | undefined | false | null)[]): string | undefined => {
  const out = parts.filter(Boolean).join(" ");
  return out || undefined;
};

// Units understood by src/render/format.ts.
export const UNIT = {
  money: "AUD_cents",
  weeklyRent: "AUD_cents_per_week",
  fraction: "fraction",
  count: "count",
  index: "index",
  rank: "rank",
  /** A straight-line distance in whole metres; the renderer shows 230 m or 1.2 km. */
  metres: "metres",
  year: "year",
  /** A rate for every 100,000 residents; the renderer shows 16,944 per 100,000. */
  per100k: "per_100k",
} as const;

/** The answer for an address whose locality could not be matched to one ABS suburb: every suburb layer says so (AD-9). */
export const SUBURB_NOT_MATCHED_MESSAGE =
  "Suburb not matched: the locality for this address could not be matched to a single ABS suburb, so suburb figures are not shown.";

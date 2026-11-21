// The return calculator (L05). Starting values come from the layer payload; every change is worked out here by the same pure function the
// layer used for its defaults (src/calc/return.ts), so the page never disagrees with the report. An illustration of the reader's own numbers.
import { useId, useState } from "react";
import { calcReturn, cleanInput, RETURN_FIELDS, type ReturnInputKey, type ReturnOutputs, type ReturnUnit } from "../../calc/return";
import { CALCULATOR } from "../../site/copy";
import { formatValue, NOT_AVAILABLE } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";

export interface InputSpec {
  key: ReturnInputKey;
  label: string;
  unit: ReturnUnit;
  help?: string;
  default: number | null;
  basis: string;
  placeholder: boolean;
  /** Where a sourced start value came from, "Valuer-General Victoria, as at 31 Mar 2026". */
  provenance?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KEYS = new Set<string>(RETURN_FIELDS.map((f) => f.key));
const UNITS = new Set<string>(["AUD_cents", "AUD_cents_per_week", "fraction", "weeks", "years"]);

/** The calculator's inputs from the payload, or null when the payload is not the shape the layer writes. */
export function readCalculator(payload: Record<string, unknown>): { inputs: InputSpec[]; history: number | null } | null {
  const calc = payload.calculator;
  if (!isObj(calc) || !Array.isArray(calc.inputs)) return null;
  const sourced = new Map<string, string>();
  if (Array.isArray(calc.sources)) {
    for (const s of calc.sources) {
      if (isObj(s) && typeof s.key === "string" && Array.isArray(s.source_ids)) {
        sourced.set(s.key, provenanceText(s.source_ids.filter((x): x is string => typeof x === "string"), typeof s.as_of === "string" ? s.as_of : null));
      }
    }
  }
  const inputs: InputSpec[] = [];
  for (const i of calc.inputs) {
    if (!isObj(i) || typeof i.key !== "string" || !KEYS.has(i.key) || typeof i.label !== "string" || typeof i.unit !== "string" || !UNITS.has(i.unit)) return null;
    inputs.push({
      key: i.key as ReturnInputKey,
      label: i.label,
      unit: i.unit as ReturnUnit,
      help: typeof i.help === "string" ? i.help : undefined,
      default: typeof i.default === "number" && Number.isFinite(i.default) ? i.default : null,
      basis: typeof i.basis === "string" ? i.basis : "",
      placeholder: i.placeholder === true,
      provenance: sourced.get(i.key),
    });
  }
  if (inputs.length === 0) return null;
  const history = isObj(calc.history) && typeof calc.history.price_cagr_5y === "number" ? calc.history.price_cagr_5y : null;
  return { inputs, history };
}

const trim = (n: number, places: number) => String(Number(n.toFixed(places)));

/** A stored value as the text the reader edits: dollars, percent, weeks or years. */
export function toFieldText(unit: ReturnUnit, value: number | null): string {
  if (value === null) return "";
  if (unit === "AUD_cents" || unit === "AUD_cents_per_week") return trim(value / 100, 2);
  if (unit === "fraction") return trim(value * 100, 4);
  return trim(value, 2);
}

/** The text the reader typed as a stored value, or null for blank or not a number. Range checks are cleanInput's. */
export function fromFieldText(unit: ReturnUnit, text: string): number | null {
  // Plain numbers only: an optional minus, an optional $, digits (thousands commas only as 1,234 or 1,234,567), an optional decimal
  // part, an optional %. "1,5", "1e3", "2 0" and a lone "$" are not numbers, so the field is flagged instead of read as something else.
  const m = /^(-?)\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)%?$/.exec(text.trim());
  if (!m) return null;
  const n = Number(`${m[1]}${m[2].replace(/,/g, "")}`);
  if (!Number.isFinite(n)) return null;
  if (unit === "AUD_cents" || unit === "AUD_cents_per_week") return n * 100;
  if (unit === "fraction") return n / 100;
  return n;
}

const SUFFIX: Record<ReturnUnit, string> = { AUD_cents: "$", AUD_cents_per_week: "$ a week", fraction: "%", weeks: "weeks", years: "years" };

const OUTPUT_UNITS: Record<keyof ReturnOutputs, string> = {
  gross_yield: "fraction",
  rent_collected: "AUD_cents",
  running_costs: "AUD_cents",
  net_income: "AUD_cents",
  net_yield: "fraction",
  loan_amount: "AUD_cents",
  annual_interest: "AUD_cents",
  cash_flow: "AUD_cents",
  cash_flow_weekly: "AUD_cents_per_week",
  value_after: "AUD_cents",
};
const OUTPUT_ORDER = Object.keys(OUTPUT_UNITS) as (keyof ReturnOutputs)[];

export function ReturnCalculator({ payload }: { payload: Record<string, unknown> }) {
  const spec = readCalculator(payload);
  if (!spec) return null;
  return <Calculator inputs={spec.inputs} history={spec.history} />;
}

/** `typed` replaces the starting text of named fields; it exists so a test can render what a reader would have typed. */
export function Calculator({ inputs, history, typed }: { inputs: InputSpec[]; history: number | null; typed?: Record<string, string> }) {
  const uid = useId();
  const initial = () => Object.fromEntries(inputs.map((i) => [i.key, toFieldText(i.unit, i.default)])) as Record<string, string>;
  const [text, setText] = useState<Record<string, string>>(() => ({ ...initial(), ...typed }));

  // Each input is checked on its own; a bad or blank one blanks only the outputs that need it (never NaN).
  const parsed: Partial<Record<ReturnInputKey, number | null>> = {};
  const bad = new Set<string>();
  for (const i of inputs) {
    const raw = text[i.key] ?? "";
    const value = cleanInput(i.key, fromFieldText(i.unit, raw));
    parsed[i.key] = value;
    if (raw.trim() !== "" && value === null) bad.add(i.key);
  }
  const out = calcReturn(parsed);

  return (
    <div className="calc">
      <h3>{CALCULATOR.title}</h3>
      <p className="calc-intro">{CALCULATOR.intro}</p>
      <div className="calc-grid">
        <div className="calc-inputs">
          {inputs.map((i) => {
            const id = `${uid}-${i.key}`;
            const invalid = bad.has(i.key);
            return (
              <div className="calc-field" key={i.key}>
                <label htmlFor={id}>{i.label}</label>
                <div className="calc-in">
                  <input
                    id={id}
                    name={i.key}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={text[i.key] ?? ""}
                    aria-invalid={invalid || undefined}
                    aria-describedby={`${id}-d`}
                    onChange={(e) => setText((t) => ({ ...t, [i.key]: e.target.value }))}
                  />
                  <span className="calc-unit">{SUFFIX[i.unit]}</span>
                </div>
                <small id={`${id}-d`} className={i.placeholder ? "calc-basis assumed" : "calc-basis"}>
                  {i.placeholder ? CALCULATOR.placeholderTag : `${i.basis}${i.provenance ? ` (${i.provenance})` : ""}`}
                  {i.help ? ` ${i.help}` : ""}
                  {invalid ? ` ${i.key === "growth_rate" ? CALCULATOR.invalidGrowth : CALCULATOR.invalid}` : ""}
                </small>
              </div>
            );
          })}
          <button type="button" className="btn ghost" onClick={() => setText(initial())}>
            {CALCULATOR.reset}
          </button>
        </div>
        <div className="calc-out" aria-live="polite">
          <h4>
            {CALCULATOR.resultsHeading} <ChipBadge chip="Estimated" />
          </h4>
          <div className="tg">
            {OUTPUT_ORDER.map((k) => {
              const v = out[k];
              const note = (CALCULATOR.outputNotes as Record<string, string>)[k];
              return (
                <div className="tile" data-calc={k} key={k}>
                  <div className="cap">{CALCULATOR.outputs[k]}</div>
                  <div className={v === null ? "val na" : "val"}>{v === null ? NOT_AVAILABLE : formatValue(v, OUTPUT_UNITS[k])}</div>
                  {note && <div className="sub">{note}</div>}
                </div>
              );
            })}
          </div>
          <p className="tabnote">{CALCULATOR.omitted}</p>
          {history !== null && (
            <p className="tabnote">
              {CALCULATOR.history}: {formatValue(history, "fraction", { signed: true })}. {CALCULATOR.historyNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

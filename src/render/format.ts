// Display formatting for report figures. AD-2: render code never queries data and never rounds a stored value; it only formats.
// Units follow the contract (src/server/contracts/layer.ts and ARCHITECTURE-SPINE conventions):
//   AUD_cents            integer cents          -> $785,000
//   AUD_cents_per_week   integer cents a week   -> $800 a week
//   fraction             0.047                  -> 4.7%
//   percent              4.7 (already a percent)-> 4.7%
//   count / index        whole numbers          -> 1,471
//   weeks                number of weeks        -> 3 weeks
//   rank                 a ready string         -> 3 of 8
//   metres               whole metres           -> 230 m, 1.2 km (a straight line, never a walk)
//   year                 a calendar year        -> 2018 (no thousands separator)
//   per_100k             a rate for each 100,000 residents -> 16,944 per 100,000
import type { Figure } from "../server/contracts/layer";

const WHOLE = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TWO_DECIMALS = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const NOT_AVAILABLE = "Not available";

/** Whole dollars when the amount is a whole number of dollars, otherwise dollars and cents. */
export function formatAud(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? `${sign}$${WHOLE.format(abs / 100)}` : `${sign}$${TWO_DECIMALS.format(abs / 100)}`;
}

export function formatPercent(percentPoints: number, signed = false): string {
  const text = `${ONE_DECIMAL.format(Math.abs(percentPoints))}%`;
  // A value that rounds to 0.0 prints as plain 0.0%, never "-0.0%" or "+0.0%".
  if (Number(ONE_DECIMAL.format(Math.abs(percentPoints)).replace(/,/g, "")) === 0) return text;
  if (percentPoints < 0) return `-${text}`;
  return signed && percentPoints > 0 ? `+${text}` : text;
}

/** Format one value by its unit. A null value is "Not available", never a zero. `signed` adds a plus sign to a positive rate. */
export function formatValue(value: Figure["value"] | undefined, unit?: string, opts: { signed?: boolean } = {}): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  switch (unit) {
    case "AUD_cents":
      return formatAud(value);
    case "AUD_cents_per_week":
      return `${formatAud(value)} a week`;
    case "fraction":
      return formatPercent(value * 100, opts.signed);
    case "percent":
      return formatPercent(value, opts.signed);
    case "weeks":
      return `${ONE_DECIMAL.format(value).replace(/\.0$/, "")} ${value === 1 ? "week" : "weeks"}`;
    case "count":
    case "index":
      return WHOLE.format(value);
    case "metres": {
      // Whole metres first, so 999.6 reads 1.0 km and never "1,000 m".
      const m = Math.round(value);
      return m < 1000 ? `${WHOLE.format(m)} m` : `${ONE_DECIMAL.format(m / 1000)} km`;
    }
    case "year":
      return String(Math.round(value));
    case "per_100k":
      return `${WHOLE.format(value)} per 100,000`;
    default:
      return String(value);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-15" -> "15 Nov 2026". Anything that is not a real calendar date (not ISO, or a day the month does not have, such as 2026-02-31) is returned as it came. Fixed month names, so the output never depends on the runtime's locale data. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const day = Number(m[3]);
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(m[2]) - 1];
  if (day < 1 || day > daysInMonth) return iso;
  return `${day} ${month} ${m[1]}`;
}

/** A UTC timestamp as the calendar date in Melbourne, so a report made at 11pm UTC does not show the previous day to an Australian reader. */
export function formatMelbourneDate(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return formatDate(`${get("year")}-${get("month")}-${get("day")}`);
}

/** A figure's value as text. Rates that describe change carry a sign. */
export function formatFigure(f: Pick<Figure, "key" | "value" | "unit">): string {
  return formatValue(f.value, f.unit, { signed: /change|cagr/.test(f.key) });
}

// The return calculator (L05). Pure: no data access, no rendering. The layer uses it for its defaults and the report page uses the same
// function when a reader edits an input, so the two can never disagree.
//
// It is an ILLUSTRATION of the reader's own numbers (AD-10). Nothing here is a prediction: growth is a rate the reader types in
// (default 0%), and the suburb's past growth is shown only as history, never fed in.
//
// Units match the report contract: money is cents, rent is cents a week, rates are fractions. A blank, non-numeric or negative input
// (growth may be negative) makes only the outputs that depend on it null, which the page shows as "Not available". Never NaN, never a throw.

export type ReturnInputKey =
  | "price"
  | "weekly_rent"
  | "vacancy_weeks"
  | "management_fee"
  | "council_rates"
  | "insurance"
  | "owners_corporation"
  | "maintenance"
  | "deposit_share"
  | "interest_rate"
  | "growth_rate"
  | "horizon_years";

export type ReturnUnit = "AUD_cents" | "AUD_cents_per_week" | "fraction" | "weeks" | "years";

export interface ReturnField {
  key: ReturnInputKey;
  label: string;
  unit: ReturnUnit;
  /** One line shown under the input. */
  help?: string;
}

/** The inputs, in the order the page lists them. */
export const RETURN_FIELDS: ReturnField[] = [
  { key: "price", label: "Purchase price", unit: "AUD_cents" },
  { key: "weekly_rent", label: "Weekly rent", unit: "AUD_cents_per_week" },
  { key: "vacancy_weeks", label: "Weeks vacant each year", unit: "weeks" },
  { key: "management_fee", label: "Property management fee, share of rent collected", unit: "fraction" },
  { key: "council_rates", label: "Council rates and water, a year", unit: "AUD_cents" },
  { key: "insurance", label: "Landlord insurance, a year", unit: "AUD_cents" },
  { key: "owners_corporation", label: "Owners corporation fees, a year", unit: "AUD_cents", help: "Leave at $0 for a house with none." },
  { key: "maintenance", label: "Repairs and maintenance, a year", unit: "AUD_cents" },
  { key: "deposit_share", label: "Deposit, share of the price", unit: "fraction" },
  { key: "interest_rate", label: "Loan interest rate, a year", unit: "fraction", help: "Interest only, to keep the illustration simple." },
  { key: "growth_rate", label: "Price growth, a year", unit: "fraction", help: "Your own assumption. It starts at 0%; the suburb's past growth is shown as history only." },
  { key: "horizon_years", label: "Years to hold", unit: "years" },
];

/**
 * Starting values for the inputs the report has no source for. They are round placeholders, shown to the reader as
 * "placeholder, set your own": they are not facts about this property or this market.
 */
export const PLACEHOLDER_DEFAULTS: Record<Exclude<ReturnInputKey, "price" | "weekly_rent">, number> = {
  vacancy_weeks: 2,
  management_fee: 0.07,
  council_rates: 200_000,
  insurance: 60_000,
  owners_corporation: 300_000,
  maintenance: 100_000,
  deposit_share: 0.2,
  interest_rate: 0.06,
  growth_rate: 0,
  horizon_years: 5,
};

/** The placeholders for one kind of home: a house has no owners corporation, so that cost starts at 0 rather than a cost it does not have. */
export function placeholderDefaults(family: "unit" | "house"): typeof PLACEHOLDER_DEFAULTS {
  return family === "house" ? { ...PLACEHOLDER_DEFAULTS, owners_corporation: 0 } : PLACEHOLDER_DEFAULTS;
}

export type ReturnInputs = Partial<Record<ReturnInputKey, number | string | null | undefined>>;

export interface ReturnOutputs {
  /** Weekly rent x 52 / price. Needs only those two. */
  gross_yield: number | null;
  /** Rent kept after vacancy, a year, in cents. */
  rent_collected: number | null;
  /** Management fee, rates, insurance, owners corporation and maintenance, a year, in cents. */
  running_costs: number | null;
  /** Rent collected less running costs, a year, in cents. */
  net_income: number | null;
  /** Net income / price. */
  net_yield: number | null;
  loan_amount: number | null;
  /** Interest only, a year, in cents. */
  annual_interest: number | null;
  /** Net income less interest, a year, in cents. A negative number is a shortfall. */
  cash_flow: number | null;
  cash_flow_weekly: number | null;
  /** Price x (1 + growth) ^ years, in cents. Your growth assumption, not an estimate of the market. */
  value_after: number | null;
}

/** Bounds for each input. Anything outside them, or not a finite number, is invalid. growth_rate is the only input that may be negative. */
const RANGE: Record<ReturnInputKey, [number, number]> = {
  price: [1, 1e12],
  weekly_rent: [1, 1e10],
  vacancy_weeks: [0, 52],
  management_fee: [0, 1],
  council_rates: [0, 1e11],
  insurance: [0, 1e11],
  owners_corporation: [0, 1e11],
  maintenance: [0, 1e11],
  deposit_share: [0, 1],
  interest_rate: [0, 1],
  growth_rate: [-0.99, 1],
  horizon_years: [0, 50],
};

/** A number the calculator can use, or null. Strings are trimmed; blank is null. */
export function cleanInput(key: ReturnInputKey, raw: number | string | null | undefined): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    if (raw.trim() === "") return null;
    n = Number(raw);
  } else return null;
  if (!Number.isFinite(n)) return null;
  const [lo, hi] = RANGE[key];
  return n >= lo && n <= hi ? n : null;
}

const cents = (x: number) => Math.round(x);
const fraction = (x: number) => Math.round(x * 10_000) / 10_000;

export function calcReturn(raw: ReturnInputs): ReturnOutputs {
  const v = Object.fromEntries((Object.keys(RANGE) as ReturnInputKey[]).map((k) => [k, cleanInput(k, raw[k])])) as Record<ReturnInputKey, number | null>;
  const out: ReturnOutputs = {
    gross_yield: null,
    rent_collected: null,
    running_costs: null,
    net_income: null,
    net_yield: null,
    loan_amount: null,
    annual_interest: null,
    cash_flow: null,
    cash_flow_weekly: null,
    value_after: null,
  };

  const { price, weekly_rent: rent } = v;
  if (price !== null && rent !== null) out.gross_yield = fraction((rent * 52) / price);

  if (rent !== null && v.vacancy_weeks !== null) out.rent_collected = cents(rent * (52 - v.vacancy_weeks));

  const { management_fee: fee, council_rates: rates, insurance, owners_corporation: oc, maintenance } = v;
  if (out.rent_collected !== null && fee !== null && rates !== null && insurance !== null && oc !== null && maintenance !== null) {
    out.running_costs = cents(out.rent_collected * fee + rates + insurance + oc + maintenance);
    out.net_income = out.rent_collected - out.running_costs;
    if (price !== null) out.net_yield = fraction(out.net_income / price);
  }

  if (price !== null && v.deposit_share !== null) {
    out.loan_amount = cents(price * (1 - v.deposit_share));
    if (v.interest_rate !== null) {
      out.annual_interest = cents(out.loan_amount * v.interest_rate);
      if (out.net_income !== null) {
        out.cash_flow = out.net_income - out.annual_interest;
        out.cash_flow_weekly = cents(out.cash_flow / 52);
      }
    }
  }

  if (price !== null && v.growth_rate !== null && v.horizon_years !== null) out.value_after = cents(price * (1 + v.growth_rate) ** v.horizon_years);
  return out;
}

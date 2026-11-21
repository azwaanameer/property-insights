// The return calculator: worked examples checked by hand, bad input never gives NaN or throws, growth is an input and nothing else.
import { describe, expect, it } from "vitest";
import { calcReturn, cleanInput, PLACEHOLDER_DEFAULTS, placeholderDefaults, RETURN_FIELDS, type ReturnInputKey, type ReturnInputs, type ReturnOutputs } from "./return";

// $1,000,000 price, $800 a week: all in cents.
const BASE: ReturnInputs = { price: 100_000_000, weekly_rent: 80_000, ...PLACEHOLDER_DEFAULTS };

describe("worked example (placeholders, 0% growth)", () => {
  const out = calcReturn(BASE);
  it("gross yield is weekly rent x 52 / price, before any costs", () => {
    expect(out.gross_yield).toBe(0.0416); // 80,000 x 52 / 100,000,000 = 0.0416
  });
  it("rent collected, running costs, net income and net yield follow from the inputs", () => {
    expect(out.rent_collected).toBe(4_000_000); // 50 weeks x $800
    // 7% of $40,000 = $2,800, plus rates $2,000, insurance $600, owners corporation $3,000, maintenance $1,000
    expect(out.running_costs).toBe(940_000);
    expect(out.net_income).toBe(3_060_000);
    expect(out.net_yield).toBe(0.0306);
  });
  it("loan, interest and cash flow: interest only, so a shortfall is negative", () => {
    expect(out.loan_amount).toBe(80_000_000);
    expect(out.annual_interest).toBe(4_800_000);
    expect(out.cash_flow).toBe(-1_740_000);
    expect(out.cash_flow_weekly).toBe(-33_462);
  });
  it("growth defaults to 0%, so the value after holding is the price", () => {
    expect(PLACEHOLDER_DEFAULTS.growth_rate).toBe(0);
    expect(out.value_after).toBe(100_000_000);
  });
  it("a growth rate the reader sets is applied as typed", () => {
    expect(calcReturn({ ...BASE, growth_rate: 0.05, horizon_years: 2 }).value_after).toBe(110_250_000);
    expect(calcReturn({ ...BASE, growth_rate: -0.1, horizon_years: 1 }).value_after).toBe(90_000_000);
  });
});

describe("what depends on what", () => {
  it("the gross yield needs only price and rent", () => {
    const out = calcReturn({ price: 56_650_000, weekly_rent: 80_000 });
    expect(out.gross_yield).toBe(0.0734);
    expect(out.net_yield).toBeNull();
    expect(out.cash_flow).toBeNull();
    expect(out.value_after).toBeNull();
  });
  it("no rent: the yield and everything from rent is unavailable, the loan is not", () => {
    const out = calcReturn({ ...BASE, weekly_rent: null });
    expect(out.gross_yield).toBeNull();
    expect(out.rent_collected).toBeNull();
    expect(out.net_income).toBeNull();
    expect(out.cash_flow).toBeNull();
    expect(out.loan_amount).toBe(80_000_000);
    expect(out.annual_interest).toBe(4_800_000);
    expect(out.value_after).toBe(100_000_000);
  });
  it("no price: only the rent outputs remain", () => {
    const out = calcReturn({ ...BASE, price: "" });
    expect(out.gross_yield).toBeNull();
    expect(out.net_yield).toBeNull();
    expect(out.loan_amount).toBeNull();
    expect(out.value_after).toBeNull();
    expect(out.rent_collected).toBe(4_000_000);
    expect(out.net_income).toBe(3_060_000);
  });
  it("zero is a real value for a cost, so a house with no owners corporation works", () => {
    const out = calcReturn({ ...BASE, owners_corporation: 0 });
    expect(out.running_costs).toBe(640_000);
    expect(out.net_income).toBe(3_360_000);
  });
});

describe("bad input: Not available, never NaN, never a throw", () => {
  const BAD: unknown[] = ["", "   ", "abc", "1,5", "NaN", "Infinity", NaN, Infinity, -Infinity, -1, "-5", null, undefined, {}, [], true, () => 1, 1e300];
  const outputsOk = (out: ReturnOutputs) => {
    for (const [k, v] of Object.entries(out)) expect(v === null || Number.isFinite(v), `${k} = ${String(v)}`).toBe(true);
  };

  it.each(RETURN_FIELDS.map((f) => f.key))("%s: every bad value blanks outputs and leaves only finite numbers or null", (key: ReturnInputKey) => {
    for (const bad of BAD) {
      expect(() => calcReturn({ ...BASE, [key]: bad as never })).not.toThrow();
      outputsOk(calcReturn({ ...BASE, [key]: bad as never }));
    }
  });

  it("a negative price, rent or cost is invalid, not a negative result", () => {
    for (const key of ["price", "weekly_rent", "vacancy_weeks", "management_fee", "council_rates", "deposit_share", "interest_rate"] as const) {
      expect(cleanInput(key, -1)).toBeNull();
    }
    expect(calcReturn({ ...BASE, price: -100 }).gross_yield).toBeNull();
    expect(calcReturn({ ...BASE, weekly_rent: -800 }).gross_yield).toBeNull();
    expect(calcReturn({ ...BASE, council_rates: -1 }).net_income).toBeNull();
  });

  it("only growth may be negative, and it cannot reach -100%", () => {
    expect(cleanInput("growth_rate", -0.02)).toBe(-0.02);
    expect(cleanInput("growth_rate", -1)).toBeNull();
    expect(cleanInput("price", 0)).toBeNull();
    expect(cleanInput("vacancy_weeks", 53)).toBeNull();
    expect(cleanInput("management_fee", 1.5)).toBeNull();
  });

  it("text numbers are accepted, blank is not", () => {
    expect(cleanInput("price", " 1000000 ")).toBe(1_000_000);
    expect(cleanInput("price", "")).toBeNull();
    expect(calcReturn({ price: "100000000", weekly_rent: "80000" }).gross_yield).toBe(0.0416);
  });

  it("an empty object gives all-null outputs", () => {
    expect(Object.values(calcReturn({})).every((v) => v === null)).toBe(true);
  });
});

describe("placeholders by kind of home", () => {
  it("a house starts with no owners corporation fees, a unit keeps the placeholder, and nothing else differs", () => {
    expect(placeholderDefaults("house").owners_corporation).toBe(0);
    expect(placeholderDefaults("unit").owners_corporation).toBe(300_000);
    expect({ ...placeholderDefaults("house"), owners_corporation: 0 }).toEqual({ ...placeholderDefaults("unit"), owners_corporation: 0 });
  });
});

describe("the field list", () => {
  it("covers every input once, and every placeholder input has a default", () => {
    const keys = RETURN_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) if (k !== "price" && k !== "weekly_rent") expect(PLACEHOLDER_DEFAULTS[k], k).toBeTypeOf("number");
  });
});

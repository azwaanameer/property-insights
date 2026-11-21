import { describe, expect, it } from "vitest";
import { PRICES, PRICING } from "../site/copy";
import { formatAud, gstCents, ONE_REPORT, planAmountCents, PRO_MONTHLY } from "./pricing";

describe("pricing config", () => {
  it("is 2400 cents for one report (30 days) and 9900 cents a month for Pro, GST included", () => {
    expect(ONE_REPORT).toEqual({ amount_cents: 2400, days: 30 });
    expect(PRO_MONTHLY.amount_cents).toBe(9900);
    expect(planAmountCents("one")).toBe(2400);
    expect(planAmountCents("pro")).toBe(9900);
  });
  it("GST is one eleventh of the inclusive price", () => {
    expect(gstCents(2400)).toBe(218);
    expect(gstCents(9900)).toBe(900);
    expect(formatAud(218)).toBe("$2.18");
    expect(formatAud(2400)).toBe("$24");
  });
  it("the marketing copy is built from this file, so the site and the checkout cannot disagree", () => {
    expect(PRICES).toEqual({ oneReport: 24, proMonthly: 99 });
    expect(PRICING.one.price).toBe(formatAud(ONE_REPORT.amount_cents));
    expect(PRICING.pro.price).toBe(formatAud(PRO_MONTHLY.amount_cents));
  });
});

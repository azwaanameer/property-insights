import { describe, expect, it } from "vitest";
import { formatAud, formatDate, formatFigure, formatMelbourneDate, formatPercent, formatValue, NOT_AVAILABLE } from "./format";

describe("dates", () => {
  it("formats real dates and returns anything else unchanged", () => {
    expect(formatDate("2026-11-15")).toBe("15 Nov 2026");
    expect(formatDate("2024-02-29")).toBe("29 Feb 2024");
    expect(formatDate("2026-02-31")).toBe("2026-02-31");
    expect(formatDate("2026-02-29")).toBe("2026-02-29");
    expect(formatDate("2026-04-31")).toBe("2026-04-31");
    expect(formatDate("2026-13-01")).toBe("2026-13-01");
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDate(null)).toBe("");
  });
  it("shows the Melbourne calendar date of a UTC timestamp", () => {
    // 20 Nov 2026 14:00 UTC is already 21 Nov in Melbourne (UTC+11 in summer time).
    expect(formatMelbourneDate("2026-11-20T14:00:00.000Z")).toBe("21 Nov 2026");
    expect(formatMelbourneDate("2026-11-20T01:00:00.000Z")).toBe("20 Nov 2026");
    expect(formatMelbourneDate("garbage")).toBe("garbage");
  });
});

describe("format by Figure.unit", () => {
  it("money in integer cents prints as dollars, with cents only when there are some", () => {
    expect(formatValue(56_650_000, "AUD_cents")).toBe("$566,500");
    expect(formatValue(80_000, "AUD_cents_per_week")).toBe("$800 a week");
    expect(formatAud(1_234_550)).toBe("$12,345.50");
    expect(formatAud(-500_000)).toBe("-$5,000");
  });

  it("rates are fractions; percent is already in percent points", () => {
    expect(formatValue(0.0734, "fraction")).toBe("7.3%");
    expect(formatValue(-0.1079, "fraction")).toBe("-10.8%");
    expect(formatValue(4.7, "percent")).toBe("4.7%");
    expect(formatPercent(6.7, true)).toBe("+6.7%");
  });

  it("counts, indexes and weeks", () => {
    expect(formatValue(1471, "count")).toBe("1,471");
    expect(formatValue(1109, "index")).toBe("1,109");
    expect(formatValue(3, "weeks")).toBe("3 weeks");
    expect(formatValue(1, "weeks")).toBe("1 week");
    expect(formatValue(2.5, "weeks")).toBe("2.5 weeks");
  });

  it("a ready string passes through, a missing value is never a zero, an unknown unit prints plainly", () => {
    expect(formatValue("3 of 8", "rank")).toBe("3 of 8");
    expect(formatValue(null, "AUD_cents")).toBe(NOT_AVAILABLE);
    expect(formatValue(undefined)).toBe(NOT_AVAILABLE);
    expect(formatValue(7, "mystery")).toBe("7");
    expect(formatValue(true)).toBe("Yes");
  });

  it("change figures carry a sign; other rates do not", () => {
    expect(formatFigure({ key: "unit_price_change_1y", value: 0.0667, unit: "fraction" })).toBe("+6.7%");
    expect(formatFigure({ key: "unit_price_cagr_5y", value: -0.0057, unit: "fraction" })).toBe("-0.6%");
    expect(formatFigure({ key: "gross_yield", value: 0.0734, unit: "fraction" })).toBe("7.3%");
  });

  it("a negative value that rounds to zero prints 0.0%, not -0.0%", () => {
    expect(formatPercent(-0.04)).toBe("0.0%");
    expect(formatPercent(-0.04, true)).toBe("0.0%");
    expect(formatValue(-0.0004, "fraction")).toBe("0.0%");
    expect(formatFigure({ key: "unit_price_change_1y", value: 0.0003, unit: "fraction" })).toBe("0.0%");
    expect(formatPercent(-0.06)).toBe("-0.1%");
  });
});

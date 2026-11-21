// Query values stay plain text: a unit like "310" must not become a number or be written as ?unit=%22310%22.
import { describe, expect, it } from "vitest";
import { getRouter } from "./router";
import { Route } from "./routes/report.$gnafPid";

describe("plain-text search params", () => {
  const options = getRouter().options;
  it("parses ?unit=310 as the string 310 and keeps 1E3 as text", () => {
    expect(options.parseSearch!("?unit=310")).toEqual({ unit: "310" });
    expect(options.parseSearch!("?unit=1E3")).toEqual({ unit: "1E3" });
  });
  it("writes a string unit without JSON quotes", () => {
    expect(options.stringifySearch!({ unit: "310" })).toBe("?unit=310");
  });
});

describe("report route search validation", () => {
  const validate = Route.options.validateSearch as (s: Record<string, unknown>) => { unit?: string };
  it("keeps a good unit, including one that arrives as a number", () => {
    expect(validate({ unit: "310" })).toEqual({ unit: "310" });
    expect(validate({ unit: 310 })).toEqual({ unit: "310" });
    expect(validate({ unit: "AB123456" })).toEqual({ unit: "AB123456" });
  });
  it("drops a unit with a slash or more than 8 characters", () => {
    expect(validate({ unit: "a/b" }).unit).toBeUndefined();
    expect(validate({ unit: "123456789" }).unit).toBeUndefined();
    expect(validate({}).unit).toBeUndefined();
  });
  it("asks search engines not to index a report", () => {
    const head = (Route.options.head as () => { meta: Record<string, string>[] })();
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex" });
  });
});

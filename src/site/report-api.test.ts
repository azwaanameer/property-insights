import { describe, expect, it } from "vitest";
import type { ApiResult, JsonFetcher } from "./address-api";
import { LOAD_FAILED, NOT_COVERED, NOT_FOUND } from "./copy";
import { loadReport, reportApiUrl } from "./report-api";

const stub = (result: ApiResult<unknown>): JsonFetcher => (async () => result) as JsonFetcher;
const fail = (status: number, code: string, message: string): ApiResult<unknown> => ({ ok: false, status, error: { code, message } });

describe("loading a report sorts every answer into a view", () => {
  it("builds the endpoint url with the unit", () => {
    expect(reportApiUrl("GAVIC1", "310")).toBe("/api/v1/property/GAVIC1/report?unit=310");
    expect(reportApiUrl("GAVIC1")).toBe("/api/v1/property/GAVIC1/report");
  });
  it("ok: returns the model", async () => {
    const model = { layers: [] };
    expect(await loadReport("GAVIC1", null, stub({ ok: true, data: model }))).toEqual({ kind: "ok", model });
  });
  it("not covered address: the 404 body is shown, saying only Victoria is covered", async () => {
    const r = await loadReport("GANSW1", null, stub(fail(404, "not_covered", "This address is outside the states VicProp covers. Only Victoria is loaded.")));
    expect(r).toMatchObject({ kind: "not_covered", title: NOT_COVERED.title, message: expect.stringContaining("Only Victoria") });
  });
  it("unknown pid: not-found view", async () => {
    expect(await loadReport("GAVIC9", null, stub(fail(404, "address_not_found", "No address with that G-NAF id.")))).toMatchObject({ kind: "not_found", title: NOT_FOUND.title });
  });
  it("bad pid (400): not-found view with plain wording, not the validation detail", async () => {
    expect(await loadReport("BAD", null, stub(fail(400, "bad_request", "request: not a G-NAF pid")))).toEqual({ kind: "not_found", title: NOT_FOUND.title, message: NOT_FOUND.text });
  });
  it("server failure and a malformed body are a failed view, never blank", async () => {
    expect(await loadReport("GAVIC1", null, stub(fail(500, "internal_error", "Something went wrong.")))).toMatchObject({ kind: "failed", title: LOAD_FAILED.title });
    expect(await loadReport("GAVIC1", null, stub({ ok: true, data: null }))).toMatchObject({ kind: "failed" });
  });
});

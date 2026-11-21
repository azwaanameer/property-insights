// Search box decisions (matrix rows: pick a suggestion, submit free text, ambiguous, not found) and the sample buttons,
// run against a stub fetcher so no network or database is involved.
import { describe, expect, it } from "vitest";
import { pickCandidate, reportHref, resolveSample, resolveText, typedUnit, type ApiResult, type JsonFetcher } from "./address-api";
import { SEARCH } from "./copy";

const PID = "GAVIC100000002";
const cand = (pid: string, text: string) => ({ gnaf_pid: pid, display_address: text, similarity: 1 });

function stub(result: ApiResult<unknown>): JsonFetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    return result;
  }) as JsonFetcher & { calls: string[] };
  f.calls = calls;
  return f;
}
const fail = (status: number, code: string, message: string, candidates?: ReturnType<typeof cand>[]): ApiResult<unknown> => ({
  ok: false,
  status,
  error: { code, message, candidates },
});

describe("pick a suggestion", () => {
  it("opens the report for the chosen pid and keeps the unit that was typed", () => {
    expect(pickCandidate(cand(PID, "628 FLINDERS STREET, DOCKLANDS"), "310/628 flinders")).toEqual({ kind: "open", pid: PID, unit: "310" });
    expect(pickCandidate(cand(PID, "628 FLINDERS STREET, DOCKLANDS"), "unit 5, 12 smith st")).toMatchObject({ unit: "5" });
    expect(pickCandidate(cand(PID, "628 FLINDERS STREET, DOCKLANDS"), "628 flinders")).toEqual({ kind: "open", pid: PID, unit: null });
  });
  it("the report address carries the unit in the query", () => {
    expect(reportHref(PID, "310")).toBe(`/report/${PID}?unit=310`);
    expect(reportHref(PID)).toBe(`/report/${PID}`);
    expect(typedUnit("310/628 Flinders St")).toBe("310");
  });
});

describe("submit free text", () => {
  it("a unique match opens the report, with the unit the resolver could not find", async () => {
    const f = stub({ ok: true, data: { gnaf_pid: PID, unit_requested: "999" } });
    expect(await resolveText("999/628 flinders", f)).toEqual({ kind: "open", pid: PID, unit: "999" });
    expect(f.calls[0]).toBe("/api/v1/address/resolve?q=999%2F628%20flinders");
  });
  it("ambiguous: the candidates become a list to pick from", async () => {
    const list = [cand("GAVIC1", "1 A ST"), cand("GAVIC2", "1 A ST B")];
    const r = await resolveText("1 a st", stub(fail(404, "address_not_found", "More than one address matches.", list)));
    expect(r).toEqual({ kind: "choose", message: "More than one address matches.", candidates: list });
  });
  it("not found: a plain message, no list", async () => {
    const r = await resolveText("9 nowhere rd", stub(fail(404, "address_not_found", "No address matched.", [])));
    expect(r).toMatchObject({ kind: "message", message: "No address matched." });
  });
  it("a 2xx reply with a null body is a miss, not a crash", async () => {
    const r = await resolveText("1 a st", stub({ ok: true, data: null }));
    expect(r).toMatchObject({ kind: "message", message: SEARCH.notFound });
    expect(await resolveText("1 a st", stub({ ok: true, data: {} }))).toMatchObject({ kind: "message" });
    expect(await resolveSample("x", stub({ ok: true, data: null }))).toEqual({ kind: "message", message: SEARCH.sampleNotFound });
  });
  it("a unit longer than 8 characters is not carried", () => {
    expect(typedUnit("AB1234567/12 x st")).toBeNull();
    expect(typedUnit("AB123456/12 x st")).toBe("AB123456");
  });
  it("empty text asks for an address without calling the server", async () => {
    const f = stub({ ok: true, data: {} });
    expect(await resolveText("   ", f)).toEqual({ kind: "message", message: SEARCH.empty });
    expect(f.calls).toHaveLength(0);
  });
});

describe("sample buttons", () => {
  it("resolve the sample text through the resolve endpoint", async () => {
    const f = stub({ ok: true, data: { gnaf_pid: PID, unit_requested: null } });
    expect(await resolveSample("310/628 Flinders St, Docklands", f)).toEqual({ kind: "open", pid: PID, unit: null });
    expect(f.calls[0]).toContain("/api/v1/address/resolve?q=");
  });
  it("a miss is a plain message and never opens a nearby candidate", async () => {
    const r = await resolveSample("14 Lucinda Lane, Cranbourne North", stub(fail(404, "address_not_found", "More than one.", [cand("GAVIC1", "x")])));
    expect(r).toEqual({ kind: "message", message: SEARCH.sampleNotFound });
  });
  it("a network failure keeps its own message", async () => {
    const r = await resolveSample("x", stub(fail(0, "network", SEARCH.network)));
    expect(r).toMatchObject({ kind: "message", message: SEARCH.network });
  });
});

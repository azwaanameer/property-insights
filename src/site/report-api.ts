// Loads a report for the report page and sorts every failure into one of the views the page can show.
import type { ReportModel } from "../server/contracts/report";
import { getJson, type JsonFetcher } from "./address-api";
import { LOAD_FAILED, NOT_COVERED, NOT_FOUND } from "./copy";

export type ReportLoad =
  | { kind: "ok"; model: ReportModel }
  | { kind: "not_covered"; title: string; message: string }
  | { kind: "not_found"; title: string; message: string }
  | { kind: "failed"; title: string; message: string };

export function reportApiUrl(pid: string, unit?: string | null): string {
  return `/api/v1/property/${encodeURIComponent(pid)}/report${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`;
}

export async function loadReport(pid: string, unit: string | null, fetcher: JsonFetcher = getJson, signal?: AbortSignal): Promise<ReportLoad> {
  const r = await fetcher<ReportModel>(reportApiUrl(pid, unit), signal);
  if (r.ok) {
    if (!r.data || !Array.isArray(r.data.layers)) return { kind: "failed", title: LOAD_FAILED.title, message: LOAD_FAILED.text };
    return { kind: "ok", model: r.data };
  }
  const { code, message } = r.error;
  // The API's own words are shown: its 404 body says which part failed. A blank page is never an answer.
  if (code === "not_covered") return { kind: "not_covered", title: NOT_COVERED.title, message: message || NOT_COVERED.text };
  // A malformed pid is a 400 whose message is a validation detail, so the visitor gets the plain not-found wording instead.
  if (code === "bad_request") return { kind: "not_found", title: NOT_FOUND.title, message: NOT_FOUND.text };
  if (code === "address_not_found") return { kind: "not_found", title: NOT_FOUND.title, message: message || NOT_FOUND.text };
  return { kind: "failed", title: LOAD_FAILED.title, message: message || LOAD_FAILED.text };
}

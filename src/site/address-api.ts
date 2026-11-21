// Client-side calls to the address endpoints and the decisions the search box makes from their answers.
// Kept free of React so every outcome is testable with a stub fetcher.
import type { AddressCandidate } from "../server/contracts/address";
import { SEARCH } from "./copy";

export interface ApiFailure {
  code: string;
  message: string;
  candidates?: AddressCandidate[];
  match?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiFailure };

/** The one function that touches the network, so tests can replace it. */
export type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<ApiResult<T>>;

export const getJson: JsonFetcher = async <T>(url: string, signal?: AbortSignal): Promise<ApiResult<T>> => {
  try {
    const res = await fetch(url, { signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* a non-JSON body (proxy page, platform error) still gets a usable message below */
    }
    if (res.ok) return { ok: true, data: body as T };
    const error = (body as { error?: ApiFailure } | null)?.error;
    return { ok: false, status: res.status, error: error ?? { code: "unknown", message: `The request failed (${res.status}).` } };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, status: 0, error: { code: "network", message: SEARCH.network } };
  }
};

/** The unit the user typed ("310/628 ..." or "Unit 5, 12 ..."), so it survives picking a candidate. */
export function typedUnit(text: string): string | null {
  const m = text
    .trim()
    .match(/^(?:(?:unit|apt|apartment|suite|flat|shop|u)\s*([a-z]{0,2}\d+[a-z]?)\s*(?:\/|,|\s)|([a-z]{0,2}\d+[a-z]?)\s*\/)\s*\d/i);
  const unit = m?.[1] ?? m?.[2];
  // At most 8 characters, the same rule the report route and the API apply to a unit.
  return unit && unit.length <= 8 ? unit.toUpperCase() : null;
}

/** Where a report lives. The unit stays in the query so a building-level pid still opens the right flat. */
export function reportHref(pid: string, unit?: string | null): string {
  return `/report/${encodeURIComponent(pid)}${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`;
}

/** What the search box does after a pick or a submit. */
export type SearchOutcome =
  | { kind: "open"; pid: string; unit: string | null }
  | { kind: "choose"; message: string; candidates: AddressCandidate[] }
  | { kind: "message"; message: string; code?: string };

/** The user chose a row from the suggestions: open it, carrying any unit they typed. */
export function pickCandidate(candidate: AddressCandidate, typedText: string): SearchOutcome {
  return { kind: "open", pid: candidate.gnaf_pid, unit: typedUnit(typedText) };
}

/** Free text with no selection: ask the resolve endpoint. */
export async function resolveText(text: string, fetcher: JsonFetcher = getJson): Promise<SearchOutcome> {
  const q = text.trim();
  if (!q) return { kind: "message", message: SEARCH.empty };
  const r = await fetcher<{ gnaf_pid: string; unit_requested: string | null }>(`/api/v1/address/resolve?q=${encodeURIComponent(q)}`);
  if (r.ok) {
    // A 2xx with an empty or non-JSON body has no pid to open: treat it as a miss, never throw.
    const pid = r.data?.gnaf_pid;
    if (typeof pid === "string" && pid) return { kind: "open", pid, unit: r.data.unit_requested ?? null };
    return { kind: "message", message: SEARCH.notFound, code: "address_not_found" };
  }
  const candidates = r.error.candidates ?? [];
  if (r.error.code === "address_not_found" && candidates.length > 0) {
    // Several matches, or a street with no number: the user picks one.
    return { kind: "choose", message: r.error.message || SEARCH.pickOne, candidates };
  }
  return { kind: "message", message: r.error.message || SEARCH.notFound, code: r.error.code };
}

/** A sample button: resolve its fixed text. A miss is a plain message, never a guess from the candidates. */
export async function resolveSample(text: string, fetcher: JsonFetcher = getJson): Promise<SearchOutcome> {
  const r = await resolveText(text, fetcher);
  if (r.kind === "open") return r;
  // A server or network failure keeps its own message; only a miss is reworded.
  if (r.kind === "message" && r.code && !["address_not_found", "bad_request", "not_covered"].includes(r.code)) return r;
  return { kind: "message", message: SEARCH.sampleNotFound };
}

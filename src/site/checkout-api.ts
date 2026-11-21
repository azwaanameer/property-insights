// Client-side calls for checkout and the confirmation page, and the decisions drawn from their answers.
// Free of React so every outcome is testable with a stub.
import { formatAud } from "../config/pricing";
import { getJson, type ApiResult, type JsonFetcher } from "./address-api";
import { CHECKOUT } from "./copy";

export type PlanChoice = "one" | "pro";

export interface CheckoutInfo {
  gnaf_pid: string;
  display_address: string;
  /** The provider in use ("stripe", "dev"), or null when payments are not configured. */
  provider: string | null;
  /** True when at least one paid layer is enabled and cleared, so a sale can start. */
  payable: boolean;
  prices: {
    currency: string;
    one: { amount_cents: number; gst_cents: number; days: number };
    pro: { amount_cents: number; gst_cents: number };
  };
}

export type JsonPoster = <T>(url: string, body: unknown) => Promise<ApiResult<T>>;

/** A start request that gets no answer in this long is reported as a network problem, so the button never stays busy for ever. */
export const POST_TIMEOUT_MS = 20_000;

export const postJson: JsonPoster = async <T>(url: string, body: unknown): Promise<ApiResult<T>> => {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(POST_TIMEOUT_MS) });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* a non-JSON body still gets a usable message below */
    }
    if (res.ok) return { ok: true, data: parsed as T };
    const error = (parsed as { error?: { code: string; message: string } } | null)?.error;
    return { ok: false, status: res.status, error: error ?? { code: "unknown", message: `The request failed (${res.status}).` } };
  } catch {
    return { ok: false, status: 0, error: { code: "network", message: CHECKOUT.network } };
  }
};

export function checkoutInfoUrl(pid: string, unit?: string | null): string {
  return `/api/v1/checkout?pid=${encodeURIComponent(pid)}${unit ? `&unit=${encodeURIComponent(unit)}` : ""}`;
}

export type InfoLoad =
  | { kind: "ok"; info: CheckoutInfo }
  | { kind: "not_covered"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "failed"; message: string };

export async function loadCheckoutInfo(pid: string, unit: string | null, fetcher: JsonFetcher = getJson, signal?: AbortSignal): Promise<InfoLoad> {
  const r = await fetcher<CheckoutInfo>(checkoutInfoUrl(pid, unit), signal);
  if (r.ok) return r.data && r.data.prices ? { kind: "ok", info: r.data } : { kind: "failed", message: CHECKOUT.failed };
  if (r.error.code === "not_covered") return { kind: "not_covered", message: CHECKOUT.notCovered };
  if (r.error.code === "address_not_found" || r.error.code === "bad_request") return { kind: "not_found", message: r.error.message };
  return { kind: "failed", message: r.status === 0 ? CHECKOUT.network : CHECKOUT.failed };
}

export type StartOutcome = { kind: "redirect"; url: string } | { kind: "error"; message: string; blocked?: "not_configured" | "nothing_to_unlock" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(email: string): boolean {
  return email.trim().length <= 254 && EMAIL.test(email.trim());
}

/** Starts the purchase and says where to send the buyer, or what to tell them. Never throws. */
export async function startPurchase(
  input: { pid: string; unit?: string | null; email: string; plan: PlanChoice },
  post: JsonPoster = postJson,
): Promise<StartOutcome> {
  if (!validEmail(input.email)) return { kind: "error", message: CHECKOUT.emailInvalid };
  const r = await post<{ checkout_url: string }>("/api/v1/checkout", {
    gnaf_pid: input.pid,
    ...(input.unit ? { unit: input.unit } : {}),
    email: input.email.trim(),
    plan: input.plan,
  });
  if (r.ok) {
    const url = r.data?.checkout_url;
    return typeof url === "string" && url ? { kind: "redirect", url } : { kind: "error", message: CHECKOUT.failed };
  }
  switch (r.error.code) {
    case "payments_not_configured":
      return { kind: "error", message: CHECKOUT.notConfigured, blocked: "not_configured" };
    case "nothing_to_unlock":
      return { kind: "error", message: CHECKOUT.nothingToUnlock, blocked: "nothing_to_unlock" };
    case "not_covered":
      return { kind: "error", message: CHECKOUT.notCovered };
    case "bad_request":
      return { kind: "error", message: CHECKOUT.emailInvalid };
    case "network":
      return { kind: "error", message: CHECKOUT.network };
    default:
      return { kind: "error", message: CHECKOUT.failed };
  }
}

export interface PurchaseStatus {
  purchase: { status: "pending" | "paid" | "refunded" | "failed" | "expired"; plan: PlanChoice; gnaf_pid: string | null; expires_at: string | null } | null;
  active: { plan: string; gnaf_pid: string | null; expires_at: string }[];
}

export type DoneView =
  | { kind: "checking" }
  | { kind: "paid"; plan: PlanChoice; gnaf_pid: string | null; expires_at: string | null }
  | { kind: "refunded" | "expired" | "failed" | "unknown" | "error" | "missing" };

export function purchaseStatusUrl(purchaseId: string): string {
  return `/api/v1/purchases/me?purchase=${encodeURIComponent(purchaseId)}`;
}

/** One status check. A paid answer also carries the Set-Cookie that opens the report in this browser. */
export async function checkPurchase(purchaseId: string, fetcher: JsonFetcher = getJson, signal?: AbortSignal): Promise<DoneView> {
  const r = await fetcher<PurchaseStatus>(purchaseStatusUrl(purchaseId), signal);
  if (!r.ok) return r.error.code === "bad_request" ? { kind: "unknown" } : { kind: "error" };
  const p = r.data?.purchase;
  if (!p) return { kind: "unknown" };
  if (p.status === "pending") return { kind: "checking" };
  if (p.status === "paid") return { kind: "paid", plan: p.plan, gnaf_pid: p.gnaf_pid, expires_at: p.expires_at };
  return { kind: p.status };
}

/** The order summary's money, from the price sheet the server sent. */
export function orderTotals(info: CheckoutInfo, plan: PlanChoice): { total: string; gst: string } {
  const p = plan === "one" ? info.prices.one : info.prices.pro;
  return { total: formatAud(p.amount_cents), gst: formatAud(p.gst_cents) };
}

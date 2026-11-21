// Runs layers in parallel with per-layer failure isolation (AD-9), the rights gate (AD-4) and the entitlement seam (AD-3).
// Order for each layer: rights gate -> entitlement -> run. A layer that fails the gate or is locked is never executed.
import type { Principal, ResolvedAddress } from "../contracts/address";
import { LayerResult } from "../contracts/layer";
import type { Db } from "../db";
import type { LayerDef } from "../layers/types";
import { errorFields, log } from "../log";
import type { LayerTier } from "../contracts/layer";
import { requestScoped } from "../repos/request-scope";
import type { LayerConfigRow, SourceRow } from "../repos/source";
import { UNAVAILABLE_VENDORS, type VendorAdapters } from "../vendors/types";
import { entitlements } from "./entitlements";

export interface RightsContext {
  sources: Map<string, SourceRow>;
  config: Map<string, LayerConfigRow>;
  /** Source ids that currently have a published dataset (a src_dataset_current row). */
  datasets: Set<string>;
}

/** `reason` is safe for public responses. `detail` (source ids, rights status) goes to the structured log only. */
export type GateResult = { ok: true } | { ok: false; reason: string; detail: string };

export const NOT_AVAILABLE = "Not available yet";

/**
 * AD-4: a layer is on only if it is enabled, its tier agrees with layer_config, and every source it lists is cleared.
 * A missing source row counts as not cleared. AD-7: and every dataset the layer reads must be published.
 */
export function rightsGate(
  layer: Pick<LayerDef, "layer_id" | "source_ids"> & { tier?: LayerTier; dataset_ids?: string[] },
  rights: RightsContext,
): GateResult {
  const config = rights.config.get(layer.layer_id);
  if (!config || !config.enabled) return { ok: false, reason: NOT_AVAILABLE, detail: "layer is not enabled in layer_config" };
  if (layer.tier && config.tier !== layer.tier) {
    return { ok: false, reason: NOT_AVAILABLE, detail: `tier mismatch: code says ${layer.tier}, layer_config says ${config.tier}` };
  }
  if (layer.source_ids.length === 0) return { ok: false, reason: NOT_AVAILABLE, detail: "layer lists no sources" };
  const unclear = layer.source_ids
    .map((id) => ({ id, status: rights.sources.get(id)?.rights_status ?? "unregistered" }))
    .filter((s) => s.status !== "cleared");
  if (unclear.length > 0) {
    return { ok: false, reason: NOT_AVAILABLE, detail: `rights not cleared: ${unclear.map((s) => `${s.id} (${s.status})`).join(", ")}` };
  }
  // AD-7: a layer whose dataset has never been published has nothing to read. not_covered, never run.
  const missing = (layer.dataset_ids ?? []).filter((id) => !rights.datasets.has(id));
  if (missing.length > 0) return { ok: false, reason: NOT_AVAILABLE, detail: `no published dataset: ${missing.join(", ")}` };
  return { ok: true };
}

export interface RunLayersInput {
  db: Db;
  address: ResolvedAddress;
  principal: Principal;
  request_id: string;
  rights: RightsContext;
  /** Outside-service adapters handed to every layer. Unset = every outside call fails (no network), so a layer says its data is unavailable. */
  vendors?: VendorAdapters;
  /** Per-layer time limit. Default 8000 ms, or the layer's own `timeout_ms`. */
  timeout_ms?: number;
  /** Results of the layers that ran before a synthesis layer. Set by runLayers for the second pass; leave unset otherwise. */
  siblings?: LayerResult[];
}

export const DEFAULT_LAYER_TIMEOUT_MS = 8000;

class LayerTimeout extends Error {
  constructor(ms: number) {
    super(`layer timed out after ${ms} ms`);
    this.name = "LayerTimeout";
  }
}

export async function runLayer(layer: LayerDef, input: RunLayersInput): Promise<LayerResult> {
  const { address, principal, request_id, rights } = input;
  const base = {
    layer_id: layer.layer_id,
    title: layer.title,
    tier: layer.tier,
    coverage: { market_tier: address.tier, match_type: address.match },
  };

  const gate = rightsGate(layer, rights);
  if (!gate.ok) {
    log("warn", "layer_not_covered", { request_id, layer_id: layer.layer_id, detail: gate.detail });
    return LayerResult.parse({ ...base, status: "not_covered", figures: [], payload: {}, message: gate.reason });
  }

  if (entitlements(principal, layer, { gnaf_pid: address.gnaf_pid }) === "locked") {
    return LayerResult.parse({ ...base, status: "locked", figures: [], payload: {}, teaser: layer.teaser });
  }

  const timeoutMs = input.timeout_ms ?? layer.timeout_ms ?? DEFAULT_LAYER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LayerTimeout(timeoutMs)), timeoutMs);
    });
    const out = await Promise.race([layer.run({ db: input.db, address, request_id, vendors: input.vendors ?? UNAVAILABLE_VENDORS, ...(layer.synthesis ? { siblings: input.siblings ?? [] } : {}) }), timeout]);
    return LayerResult.parse({ ...base, status: out.status, figures: out.figures, payload: out.payload, message: out.message });
  } catch (err) {
    // Detail goes to the log, with the request id. The report only says this section failed.
    log("error", "layer_failed", { request_id, layer_id: layer.layer_id, gnaf_pid: address.gnaf_pid, ...errorFields(err) });
    return LayerResult.parse({
      ...base,
      status: "error",
      figures: [],
      payload: {},
      message: `This section could not be loaded (reference ${request_id}). The rest of the report is unaffected.`,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Three passes. Every ordinary layer runs in parallel first; then each synthesis layer runs with those results as `siblings`, so a
 * layer such as L13 reads sibling results only after they ran and never calls another layer (AD-1). A synthesis layer that sets
 * `after_synthesis` (L14 attribution, which credits a source only where a section that came from a synthesis layer, L06, showed data) runs last
 * and also sees the results of the other synthesis layers. Results come back in the order the layers were given. Gate, entitlement and
 * failure isolation apply to every pass alike.
 */
export async function runLayers(layers: LayerDef[], runInput: RunLayersInput): Promise<LayerResult[]> {
  // One request-scoped Db for the whole report, so a read two layers both make (the sales dataset) is done once (repos/request-scope.ts).
  const input: RunLayersInput = { ...runInput, db: requestScoped(runInput.db) };
  const first = layers.filter((l) => !l.synthesis);
  const second = layers.filter((l) => l.synthesis && !l.after_synthesis);
  const third = layers.filter((l) => l.synthesis && l.after_synthesis);
  const byLayer = new Map<LayerDef, LayerResult>();
  const remember = (defs: LayerDef[], results: LayerResult[]) => defs.forEach((l, i) => byLayer.set(l, results[i]));
  remember(first, await Promise.all(first.map((layer) => runLayer(layer, input))));
  const firstResults = layers.filter((l) => byLayer.has(l)).map((l) => byLayer.get(l)!);
  remember(second, await Promise.all(second.map((layer) => runLayer(layer, { ...input, siblings: firstResults }))));
  // Registry order, so a layer sees its siblings in the order of the page.
  const earlier = layers.filter((l) => byLayer.has(l)).map((l) => byLayer.get(l)!);
  remember(third, await Promise.all(third.map((layer) => runLayer(layer, { ...input, siblings: earlier }))));
  return layers.map((l) => byLayer.get(l)!);
}

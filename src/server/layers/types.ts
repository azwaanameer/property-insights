// A layer is read-only, never calls another layer, and returns what LayerRunOutput describes (AD-1).
// The runner wraps that into a LayerResult with tier, coverage and status handling.
import type { Db } from "../db";
import type { Figure, LayerResult, LayerTier } from "../contracts/layer";
import type { ResolvedAddress } from "../contracts/address";
import type { VendorAdapters } from "../vendors/types";

export interface LayerContext {
  db: Db;
  address: ResolvedAddress;
  request_id: string;
  /** Outside-service adapters (AD-8). A layer never fetches itself: it asks these, and a failure comes back as a value. */
  vendors: VendorAdapters;
  /**
   * Only for a `synthesis` layer: the results of every non-synthesis layer, after they ran (in registry order, whatever their status; other synthesis layers are not included).
   * A synthesis layer reads these results and nothing else of theirs; it never calls them (AD-1). Undefined for every other layer.
   */
  siblings?: LayerResult[];
}

export interface LayerRunOutput {
  /** `gap` = cannot answer fully; say what is missing in `message`. */
  status: "ok" | "gap";
  figures: Figure[];
  payload: Record<string, unknown>;
  message?: string;
}

export interface LayerDef {
  layer_id: string;
  title: string;
  tier: LayerTier;
  /** AD-4: every source must be `cleared` or the layer returns not_covered and is not run. */
  source_ids: string[];
  /**
   * Sources whose data the layer reads. Each must have a published dataset (a `src_dataset_current` row) or the layer
   * returns not_covered and is not run. Omit for a layer that reads no versioned dataset.
   */
  dataset_ids?: string[];
  /** Time limit for this layer in ms, when it needs longer than the runner default (a layer that waits on an outside call). */
  timeout_ms?: number;
  /** Runs in a second pass, after every non-synthesis layer, and receives their results as `ctx.siblings`. Reads results only (AD-1). */
  synthesis?: true;
  /** Hand-written headline sentence shown instead of figures when locked. Must not contain a figure value. */
  teaser: string;
  run(ctx: LayerContext): Promise<LayerRunOutput>;
}

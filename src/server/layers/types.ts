// A layer is read-only, never calls another layer, and returns what LayerRunOutput describes (AD-1).
// The runner wraps that into a LayerResult with tier, coverage and status handling.
import type { Db } from "../db";
import type { Figure, LayerTier } from "../contracts/layer";
import type { ResolvedAddress } from "../contracts/address";

export interface LayerContext {
  db: Db;
  address: ResolvedAddress;
  request_id: string;
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
  /** Hand-written headline sentence shown instead of figures when locked. Must not contain a figure value. */
  teaser: string;
  run(ctx: LayerContext): Promise<LayerRunOutput>;
}

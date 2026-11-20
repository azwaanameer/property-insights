// Source registry, layer switches and the rating validation switch. Read-only for the serve plane (AD-4, AD-5, AD-8).
import type { Db } from "../db";

export type RightsStatus = "cleared" | "pending" | "blocked";

export interface SourceRow {
  source_id: string;
  name: string;
  licence: string;
  rights_status: RightsStatus;
  attribution_text: string;
  max_cache_days: number | null;
  display_scope: string;
}

export interface LayerConfigRow {
  layer_id: string;
  tier: "free" | "paid";
  enabled: boolean;
  source_ids: string[];
}

export interface MarketValidationRow {
  state: string;
  dwelling_type: string;
  status: string;
  pairwise_score_low: number | null;
  pairwise_score_high: number | null;
  windows: string;
  checked_on: string | null;
}

export async function listSources(db: Db): Promise<SourceRow[]> {
  return db.query<SourceRow>(
    `SELECT source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope
     FROM src_source ORDER BY source_id`,
  );
}

export async function listLayerConfig(db: Db): Promise<LayerConfigRow[]> {
  return db.query<LayerConfigRow>(`SELECT layer_id, tier, enabled, source_ids FROM layer_config ORDER BY layer_id`);
}

export async function listMarketValidation(db: Db): Promise<MarketValidationRow[]> {
  return db.query<MarketValidationRow>(
    `SELECT state, dwelling_type, status, pairwise_score_low, pairwise_score_high, windows,
            to_char(checked_on, 'YYYY-MM-DD') AS checked_on
     FROM market_validation ORDER BY state, dwelling_type`,
  );
}

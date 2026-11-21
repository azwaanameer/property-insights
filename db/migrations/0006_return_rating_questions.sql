-- 0006_return_rating_questions: layers L05 Return, L15 Conditions rating and L13 Questions.
-- Reuses derived_rating and market_validation from 0001 (the rating is written by pipeline/derive/rating.mjs, AD-8, and served
-- only where market_validation says validated, AD-5). This file adds one source row and three layer switches.

-- ---------------------------------------------------------------- source (AD-4)
-- The rating is VicProp's own composite of ABS Census shares, so its rights follow the two cleared CC BY 4.0 sources it is built
-- from (abs_census_2021 for the markers, vgv_medians for which suburbs have a unit price history). If either is set back to
-- pending, set this to pending too and switch L15 off.
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('conditions_rating', 'VicProp conditions rating (derived)',
   'Derived work from CC BY 4.0 sources (ABS 2021 Census, Valuer-General Victoria)',
   'cleared',
   'Derived by VicProp from Australian Bureau of Statistics 2021 Census data (CC BY 4.0) and State of Victoria (Valuer-General Victoria) median prices (CC BY 4.0).',
   NULL, 'public',
   'Victorian apartment suburbs only: z(owner share) minus z(flat share) minus z(unoccupied share) across suburbs with at least 300 dwellings, all three markers and a unit price history. Written by pipeline/derive/rating.mjs and published only if the 2021-origin backtest still holds at 70% or better. Served only where market_validation says validated (AD-5).');

-- ---------------------------------------------------------------- layer switches. Every source listed is cleared, so the rights trigger accepts them.
-- All three are free for now: L15 is listed as paid in the catalogue, but nothing paid can be sold until payments and an
-- address-specific payableLayers exist. Moving L15 to paid is then one UPDATE here plus the tier in the layer.
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L05-return',     'free', true, ARRAY['vgv_medians', 'homes_victoria_rents']),
  ('L15-conditions', 'free', true, ARRAY['conditions_rating', 'abs_census_2021', 'vgv_medians']),
  ('L13-questions',  'free', true, ARRAY['gnaf', 'vgv_medians', 'homes_victoria_rents', 'abs_census_2021', 'conditions_rating']);

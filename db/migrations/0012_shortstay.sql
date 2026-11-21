-- 0012_shortstay: short-stay income for an apartment (L06-shortstay), fed by a live vendor adapter for the AirDNA rentalizer (RapidAPI host airdna1).
-- No data tables: the adapter answers at request time and caches only the parsed estimate and comparable listings (an id, distance, size, annual
-- revenue, review count and public link; no photo, title or listing text) in vendor_cache (AD-8), at most 30 days, keyed by address pid, bedrooms and
-- bathrooms. Needs the secret RAPIDAPI_KEY; without it the section is the one quiet line "Short-stay estimates are not available right now."
-- Rights ruling, owner, 2026-11-21: there is no licence issue for short stay.

-- ---------------------------------------------------------------- source (AD-4), before the layer row that lists it
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('airdna_rentalizer', 'AirDNA rentalizer short-stay estimates (via RapidAPI airdna1)',
   'Third-party market data (AirDNA via RapidAPI); reuse ruled acceptable by the owner 2026-11-21',
   'cleared',
   'Short-stay estimates use AirDNA market data (RapidAPI).',
   30, 'public',
   'AirDNA''s own last-12-months income estimate for the address (used only when AirDNA''s confidence is High) and the comparable listings it returns, from which VicProp works its own estimate (the median of the nearest 15 strong comparable listings, with the 25th to 75th percentile range) when AirDNA''s confidence is Medium or Low or missing: the method of the City Retreats CRM. Requested in Australian dollars with the bedrooms and bathrooms the report uses. Shown only when the estimated income is at least 1.4 times the same home''s long-term rent. Cached up to 30 days by address pid, bedrooms and bathrooms; only an id, distance, size, annual revenue, review count and public link per comparable listing are kept. Needs the secret RAPIDAPI_KEY (Cloudflare Worker secret). Rights cleared by the owner 2026-11-21.');

-- ---------------------------------------------------------------- layer switch (AD-4: the source above is cleared and inserted first)
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L06-shortstay', 'free', true, ARRAY['airdna_rentalizer', 'gnaf']);

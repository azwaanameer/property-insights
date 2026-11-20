-- 0002_seed: source registry with rights status (AD-4), rating validation switch (AD-5), layer switches.
-- Rights statuses follow ARCHITECTURE-SPINE AD-4 and OVERVIEW section 7. Change a status with an UPDATE; never edit this file after it has run.

INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('gnaf', 'G-NAF (Geoscape Geocoded National Address File)',
   'CC BY 4.0 plus Geoscape terms: no mailing-list compilation. Full licence text not yet read.',
   'pending',
   'Incorporates or developed using G-NAF, copyright Geoscape Australia, licensed under CC BY 4.0.',
   NULL, 'public',
   'full Geoscape licence unread; written OK outstanding. Seeded pending on purpose, so the address layer is not_covered in production until you clear it: UPDATE src_source SET rights_status = ''cleared'' WHERE source_id = ''gnaf''; then enable L01 in layer_config. Local development uses db/dev-seed.sql.'),
  ('abs_asgs_2021', 'ABS ASGS Edition 3 (2021): Suburbs and Localities',
   'CC BY 4.0', 'cleared',
   'Australian Bureau of Statistics, ASGS Edition 3, CC BY 4.0.',
   NULL, 'public', 'SAL 2021 codes and names. G-NAF localities are matched to SAL by name inside the pipeline; the match type is stored.'),
  ('abs_data_api', 'ABS Data API (Census, SEIFA, approvals)', 'CC BY 4.0', 'cleared',
   'Australian Bureau of Statistics, CC BY 4.0.', NULL, 'public', 'Not used until the free report step.'),
  ('datavic_vg_medians', 'Valuer-General Victoria median prices (DataVic)', 'CC BY 4.0', 'cleared',
   'State of Victoria (Valuer-General Victoria), CC BY 4.0.', NULL, 'public', 'Downloaded by hand; the site blocks scripts.'),
  ('dffh_rent', 'DFFH Victoria rental report', 'CC BY 4.0', 'cleared',
   'State of Victoria (Department of Families, Fairness and Housing), CC BY 4.0.', NULL, 'public', ''),
  ('vicmap_wfs', 'Vicmap open data (WFS)', 'CC BY 4.0', 'cleared',
   'State of Victoria (DTP), CC BY 4.0.', NULL, 'public', 'Planning zones and overlays, live per address.'),
  ('gtfs_vic', 'Public Transport Victoria GTFS', 'CC BY 4.0', 'cleared',
   'Public Transport Victoria, CC BY 4.0.', NULL, 'public', ''),
  ('com_open_data', 'City of Melbourne open data', 'CC BY 4.0', 'cleared',
   'City of Melbourne, CC BY 4.0.', NULL, 'public', 'Central Melbourne only.'),
  ('crm_building_register', 'City Retreats CRM building register (aggregate counts)', 'Own data', 'cleared',
   '', NULL, 'public', 'Aggregated only, no guest data. Use beyond aggregate counts needs a decision (OVERVIEW section 11 item 5).'),
  ('shortstay_vendor', 'Short-stay comps vendor (AirDNA today)', 'Vendor terms; resale rights unresolved', 'pending',
   '', 30, 'signed_in', 'Blocked for the paid product until written permission to show and aggregate estimates exists.'),
  ('microburbs', 'Microburbs API', 'Vendor terms; written permission pending', 'pending',
   '', 30, 'signed_in', 'Off by default. Per-user adapter only: never in shared tables or PDFs.'),
  ('rea_rapidapi', 'realestate.com.au via RapidAPI', 'Not licensed for redistribution', 'blocked',
   '', NULL, 'internal', 'Benchmark only. Do not ship.');

-- AD-5: the conditions rating is served only where validated. VIC units only today.
INSERT INTO market_validation (state, dwelling_type, status, pairwise_score_low, pairwise_score_high, windows, checked_on) VALUES
  ('VIC', 'unit', 'validated', 0.74, 0.80, '4 windows, 2016 to 2025 (backtest-multistate-2026-11-14)', '2026-11-14');

-- L01 Property is the only layer built in step 1. It starts switched off: it needs gnaf cleared (see the note above).
-- Later layers add their own rows.
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L01-property', 'free', false, ARRAY['gnaf', 'abs_asgs_2021']);

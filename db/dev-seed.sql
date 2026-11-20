-- Development and test seed. NEVER applied to a production database.
-- Applied by `node db/migrate.mjs --pglite`, by `node db/migrate.mjs --dev-seed` (localhost or PGlite targets only)
-- and by the test helper. Idempotent.
--
-- Production leaves gnaf `pending` (full Geoscape licence unread, written OK outstanding), so L01 is not_covered there.

UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'gnaf';
UPDATE layer_config SET enabled = true, updated_at = now() WHERE layer_id = 'L01-property';

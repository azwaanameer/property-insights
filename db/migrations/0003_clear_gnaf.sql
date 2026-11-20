-- Rights decision, 2026-11-14: the owner (Azwaan) told the build that Geoscape has approved use of G-NAF.
-- The build has NOT seen the written confirmation. Keep that email or licence where the business can find it.
-- To reverse: UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'gnaf';
UPDATE src_source
   SET rights_status = 'cleared',
       notes = notes || ' CLEARED 2026-11-14 on the owner''s statement that Geoscape approved; written confirmation not seen by the build.'
 WHERE source_id = 'gnaf';

UPDATE layer_config SET enabled = true, updated_at = now() WHERE layer_id = 'L01-property';

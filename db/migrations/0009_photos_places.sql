-- 0009_photos_places: neighbourhood photos (L19-photos) and nearby places (L20-places), the first layers fed by live vendor adapters.
-- No data tables: an adapter answers at request time and caches only metadata and URLs in vendor_cache (AD-8, at most 30 days). Images are
-- never stored; they load from the vendors' own servers. Rights rulings are the owner's, 2026-11-21: public images may be used, and
-- OpenStreetMap data may be used with the credit "© OpenStreetMap contributors".

-- ---------------------------------------------------------------- sources (AD-4)
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('openstreetmap', 'OpenStreetMap places (via the Overpass API)', 'ODbL 1.0', 'cleared',
   '© OpenStreetMap contributors',
   30, 'public',
   'Licence: Open Database Licence 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Credit "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright. Shops, cafes, parks, medical places, gyms and libraries near an address, read live and cached up to 30 days. Names and positions only: no ratings, reviews or scores exist in the data and none are shown. Rights cleared by the owner 2026-11-21.'),
  ('mapillary', 'Mapillary street-level images', 'CC BY-SA 4.0', 'cleared',
   'Photos: Mapillary contributors, CC BY-SA 4.0',
   3, 'public',
   'Licence: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); Mapillary states that images are shared under CC BY-SA and must be credited to the photographer (help.mapillary.com, checked 2026-11-21). Each image shows its creator, licence and a link to its mapillary.com page, unaltered. Metadata and signed thumbnail links only are cached, for 3 days, because thumbnail links are signed and Mapillary does not document how long they last. Needs the secret MAPILLARY_ACCESS_TOKEN; without it the section uses Wikimedia Commons only. Rights cleared by the owner 2026-11-21.'),
  ('wikimedia_commons', 'Wikimedia Commons place images', 'Per image: public domain, CC0, CC BY or CC BY-SA', 'cleared',
   'Images from Wikimedia Commons; each image carries its own author and licence',
   30, 'public',
   'Only files whose licence is public domain, CC0, CC BY or CC BY-SA are shown; every image shows its author, licence and a link to its Commons description page, unaltered. Photos only (no SVG, maps or diagrams). Metadata and thumbnail links only are cached. Rights cleared by the owner 2026-11-21.');

-- ---------------------------------------------------------------- layer switches (AD-4: the sources above are cleared and inserted first)
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L19-photos', 'free', true, ARRAY['mapillary', 'wikimedia_commons', 'gnaf']),
  ('L20-places', 'free', true, ARRAY['openstreetmap', 'gnaf']);

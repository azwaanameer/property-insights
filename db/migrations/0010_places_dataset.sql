-- 0010_places_dataset: nearby places (L20-places) are now read from a loaded OpenStreetMap extract instead of the public Overpass API.
-- The Overpass call timed out on the live Worker every time, and the public Overpass servers are a fair-use service that must not carry a
-- paid product's traffic. A pipeline (pipeline/ingest/osm-places-extract.py then osm-places.mjs) loads the Victorian places from the
-- Geofabrik Australia extract into ref_place under a dataset_version_id, and the layer reads them through src_dataset_current (AD-7).
-- Data is © OpenStreetMap contributors, ODbL 1.0; the owner ruled on 2026-11-21 that the credit "© OpenStreetMap contributors" is accepted.

-- ---------------------------------------------------------------- source (AD-4): already cleared in 0009; describe the new way it is read
UPDATE src_source
SET name = 'OpenStreetMap places (Geofabrik Australia extract, Victoria)',
    max_cache_days = NULL,
    notes = 'Licence: Open Database Licence 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Credit "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright. Shops, cafes, parks, medical places, gyms and libraries in Victoria, loaded from the Geofabrik Australia extract as a versioned dataset (ref_place); the report reads the loaded table, never the Overpass API or any other outside service. Names and positions only: no ratings, reviews or scores exist in the data and none are shown. Rights cleared by the owner 2026-11-21.'
WHERE source_id = 'openstreetmap';

-- ---------------------------------------------------------------- places
-- One row per place with one point (a way or relation took the centroid of its outline). osm_id is "node/N", "way/N" or "relation/N".
-- category is one of groceries, food, parks, medical, fitness, library (the rule in src/server/layers/shared/place-category.ts, mirrored
-- in osm-places-extract.py). name is null when the element has no name tag; such a place is counted but never listed by name.
-- The index serves the bounding-box prefilter (lat, lon) the layer starts from; the category index serves counts.
CREATE TABLE ref_place (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  osm_id             text NOT NULL,
  category           text NOT NULL CHECK (category IN ('groceries', 'food', 'parks', 'medical', 'fitness', 'library')),
  name               text,
  lat                double precision NOT NULL,
  lon                double precision NOT NULL,
  PRIMARY KEY (dataset_version_id, osm_id)
);
CREATE INDEX ref_place_geo_idx ON ref_place (dataset_version_id, lat, lon);
CREATE INDEX ref_place_category_idx ON ref_place (dataset_version_id, category);

-- ---------------------------------------------------------------- layer switch
-- L20-places stays as 0009 set it (free, enabled, sources openstreetmap and gnaf): the source is the same and no column needs the new
-- dataset. Nothing to insert or update here.

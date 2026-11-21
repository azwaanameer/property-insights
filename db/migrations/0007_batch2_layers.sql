-- 0007_batch2_layers: transport (L16), schools (L17), building (L11), new supply (L08), screener (L10) and attribution (L14, the sources list).
-- Tables are keyed by dataset_version_id and read only through src_dataset_current (AD-7); pipelines write them (AD-8).
-- Coordinates are plain lat/lon, as in 0001; there is no PostGIS. Spatial lookups are bounding-box prefilters in SQL, then
-- straight-line distance and point-in-polygon in the layer code, so every distance in the report is a straight line and says so.

-- ---------------------------------------------------------------- sources (AD-4)
-- gtfs_vic and com_open_data were seeded cleared in 0002. The three below are new.
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('vic_school_zones_2026', 'Victorian Government School Zones 2026 (Department of Education)', 'CC BY 4.0', 'cleared',
   'State of Victoria (Department of Education), Victorian Government School Zones 2026, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Adapted by VicProp: zone polygons are tested against an address.',
   NULL, 'public',
   'Zones exist for government neighbourhood schools only (no selective, specialist, English-language or community schools, and no non-government schools). The publisher says zones should not be relied on for property purchase decisions: the report carries that wording and a confirm-with-the-school line (research digest I1, 2026-11-14). Files downloaded by hand into data/raw/vic/schools. No school quality figure is stored or shown (My School, VCAA and ACECQA terms bar commercial use).'),
  ('vic_school_locations_2026', 'Victorian school locations 2026 (Department of Education)', 'CC BY 4.0', 'cleared',
   'State of Victoria (Department of Education), School Locations 2026, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Adapted by VicProp: only open schools are kept.',
   NULL, 'public',
   'One row per school with sector, type, address and coordinates. No enrolment and no quality figure.'),
  ('vicprop_registry', 'VicProp source registry (own data)', 'Own data', 'cleared',
   'VicProp source list, built from the sources registered in VicProp.',
   NULL, 'public',
   'Own data. Lets the attribution layer (L14) be switched on: it lists the sources the other layers in the report used, read from src_source and src_dataset_current.');

-- ---------------------------------------------------------------- transport stops (L16)
-- One row per stop or station. Platforms that share a parent_station are one row. `routes` is the list of route names serving it.
CREATE TABLE ref_transit_stop (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  stop_key           text NOT NULL,
  name               text NOT NULL,
  mode               text NOT NULL CHECK (mode IN ('train', 'tram', 'bus', 'coach')),
  lat                double precision NOT NULL,
  lon                double precision NOT NULL,
  routes             jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (dataset_version_id, stop_key)
);
CREATE INDEX ref_transit_stop_geo_idx ON ref_transit_stop (dataset_version_id, mode, lat, lon);

-- ---------------------------------------------------------------- school zones and school locations (L17)
-- One row per zone polygon. A secondary school whose zone is the same for several year levels is one row listing them.
-- `rings` is the GeoJSON polygon (outer ring first, then holes) as [[lon, lat], ...] rings in CRS84. The bounding box is
-- the SQL prefilter; the layer runs the point-in-polygon test. school_key is set only when the zone school was found in the
-- locations file (the zone's ENTITY_CODE carries the government school number, and government school numbers are unique), otherwise
-- school_key is null and only the zone name is kept.
CREATE TABLE ref_school_zone (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  zone_id            text NOT NULL,
  school_name        text NOT NULL,
  campus_name        text,
  entity_code        text,
  school_key         text,
  level              text NOT NULL CHECK (level IN ('primary', 'secondary')),
  year_levels        text NOT NULL,
  boundary_year      integer NOT NULL,
  min_lat            double precision NOT NULL,
  max_lat            double precision NOT NULL,
  min_lon            double precision NOT NULL,
  max_lon            double precision NOT NULL,
  rings              jsonb NOT NULL,
  PRIMARY KEY (dataset_version_id, zone_id)
);
CREATE INDEX ref_school_zone_box_idx ON ref_school_zone (dataset_version_id, min_lat, max_lat);

-- school_key = G or N plus the school number: government and non-government schools number separately, so a bare number is not
-- unique (Belmont Primary School and St Mary's College Melbourne are both 26). A second campus under one number gets a -2 suffix.
CREATE TABLE ref_school (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  school_key         text NOT NULL,
  school_no          text NOT NULL,
  name               text NOT NULL,
  sector             text NOT NULL CHECK (sector IN ('Government', 'Catholic', 'Independent')),
  school_type        text NOT NULL,
  address            text NOT NULL DEFAULT '',
  locality           text NOT NULL DEFAULT '',
  postcode           text,
  lat                double precision NOT NULL,
  lon                double precision NOT NULL,
  PRIMARY KEY (dataset_version_id, school_key)
);
CREATE INDEX ref_school_geo_idx ON ref_school (dataset_version_id, lat, lon);

-- ---------------------------------------------------------------- City of Melbourne buildings (L11) and development monitor (L08)
-- One row per City of Melbourne property that appears in the newest building census, with the facts of that census.
CREATE TABLE ref_com_building (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  property_id        text NOT NULL,
  building_name      text,
  street_address     text NOT NULL,
  clue_small_area    text,
  lat                double precision NOT NULL,
  lon                double precision NOT NULL,
  construction_year  integer,
  refurbished_year   integer,
  floors_above       integer,
  predominant_use    text,
  dwelling_count     integer,
  census_year        integer NOT NULL,
  PRIMARY KEY (dataset_version_id, property_id)
);
CREATE INDEX ref_com_building_geo_idx ON ref_com_building (dataset_version_id, lat, lon);

-- Which City of Melbourne property is the same building as a G-NAF building (AD-6). Matching to an outside record happens in the
-- pipeline and the match type is stored here. One row per G-NAF building at most: a G-NAF building with no unambiguous match has no row,
-- and no building fact is shown for it. Several G-NAF buildings can share one City of Melbourne property (a tower with several street
-- numbers is one City of Melbourne record). Match types: 'exact_street_number' (same street, same number or range, within 250 m) or
-- 'nearest_within_30m_same_street' (same street, within 30 m, and the G-NAF number lies inside the City of Melbourne number range).
CREATE TABLE ref_com_building_match (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  gnaf_building_id   text NOT NULL,
  property_id        text NOT NULL,
  match_type         text NOT NULL CHECK (match_type IN ('exact_street_number', 'nearest_within_30m_same_street')),
  PRIMARY KEY (dataset_version_id, gnaf_building_id),
  FOREIGN KEY (dataset_version_id, property_id) REFERENCES ref_com_building (dataset_version_id, property_id)
);
CREATE INDEX ref_com_building_match_property_idx ON ref_com_building_match (dataset_version_id, property_id);

-- One row per development in the City of Melbourne development activity monitor.
CREATE TABLE fact_supply_project (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  development_key    text NOT NULL,
  status             text NOT NULL CHECK (status IN ('COMPLETED', 'APPROVED', 'UNDER CONSTRUCTION', 'APPLIED')),
  year_completed     integer,
  street_address     text NOT NULL,
  clue_small_area    text,
  lat                double precision NOT NULL,
  lon                double precision NOT NULL,
  floors_above       integer,
  resi_dwellings     integer NOT NULL DEFAULT 0,
  studio_dwellings   integer NOT NULL DEFAULT 0,
  one_bed_dwellings  integer NOT NULL DEFAULT 0,
  two_bed_dwellings  integer NOT NULL DEFAULT 0,
  three_bed_dwellings integer NOT NULL DEFAULT 0,
  town_planning_application text,
  PRIMARY KEY (dataset_version_id, development_key)
);
CREATE INDEX fact_supply_project_geo_idx ON fact_supply_project (dataset_version_id, lat, lon);

-- ---------------------------------------------------------------- layer switches. Every source listed is cleared, so the rights trigger accepts them.
-- All six are free for now (same decision as 0006: nothing paid can be sold yet).
-- gnaf is listed where the address position or the unit count comes from G-NAF; if it goes back to pending these switch off with the rest.
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L16-transport', 'free', true, ARRAY['gtfs_vic', 'gnaf']),
  ('L17-schools',   'free', true, ARRAY['vic_school_zones_2026', 'vic_school_locations_2026', 'gnaf']),
  ('L11-building',  'free', true, ARRAY['gnaf', 'com_open_data']),
  ('L08-supply',    'free', true, ARRAY['com_open_data', 'gnaf']),
  ('L10-screener',  'free', true, ARRAY['gnaf_neighbours', 'abs_asgs_2021', 'vgv_medians', 'homes_victoria_rents', 'abs_census_2021', 'conditions_rating']),
  ('L14-attribution', 'free', true, ARRAY['vicprop_registry']);

-- L13 Questions now also asks from the transport, school-zone, building and supply sections, so it lists the sources of those facts.
-- (Every one is cleared, so the rights trigger accepts the update.)
UPDATE layer_config
SET source_ids = ARRAY['gnaf', 'vgv_medians', 'homes_victoria_rents', 'abs_census_2021', 'conditions_rating', 'gtfs_vic', 'vic_school_zones_2026', 'com_open_data'],
    updated_at = now()
WHERE layer_id = 'L13-questions';

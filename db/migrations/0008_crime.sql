-- 0008_crime: recorded crime (L18-safety), from the Crime Statistics Agency (CSA) "LGA Criminal Incidents, year ending June 2026" workbook.
-- Tables are keyed by dataset_version_id and read only through src_dataset_current (AD-7); the pipeline writes them (AD-8).
-- The CSA publishes counts by suburb (with postcode) and by local government area. It publishes a rate per 100,000 residents only for
-- a local government area, so nothing here is a suburb rate. No score, label or ranking is stored.

-- ---------------------------------------------------------------- source (AD-4)
-- Cleared only because the workbook's own Notes sheet states the licence: "This work is licenced under a Creative Commons Attribution 4.0
-- International License. When reporting this data you must attribute the Crime Statistics Agency (or CSA) as the source." The loader reads
-- that sentence from the file and refuses to load if it is missing.
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('csa_crime_incidents', 'Recorded crime, local government areas and suburbs (Crime Statistics Agency Victoria)', 'CC BY 4.0', 'cleared',
   'Source: Crime Statistics Agency, Victoria. Adapted by VicProp.',
   NULL, 'public',
   'Licence: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/), stated in the Notes of the workbook "Data Tables LGA Criminal Incidents Year Ending June 2026" from https://www.crimestatistics.vic.gov.au/crime-statistics/latest-victorian-crime-data/download-data. Tables 01 (council areas, with rates per 100,000) and 03 (suburb or town and postcode, by offence) are loaded. Victim, offender, family-incident, location-type and charge-status tables are not loaded. Counts only: no safety score, label or ranking is stored or shown.');

-- ---------------------------------------------------------------- suburb counts (Table 03)
-- One row per year, council area, postcode, suburb or town and offence subdivision (the CSA's subgroup rows added up within a subdivision).
-- suburb_key is the suburb name normalised the same way the address file is (upper case, apostrophes and full stops dropped, other
-- punctuation to a space) and then lower-cased; an address matches on suburb_key AND postcode. year_ending is the calendar year of a year
-- ending June. A suburb that lies in two council areas has a row for each.
CREATE TABLE fact_crime_suburb (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  year_ending        integer NOT NULL,
  lga                text NOT NULL,
  postcode           text NOT NULL,
  suburb             text NOT NULL,
  suburb_key         text NOT NULL,
  division           text NOT NULL,
  subdivision        text NOT NULL,
  incidents          integer NOT NULL CHECK (incidents >= 0),
  PRIMARY KEY (dataset_version_id, year_ending, lga, postcode, suburb, subdivision)
);
CREATE INDEX fact_crime_suburb_lookup_idx ON fact_crime_suburb (dataset_version_id, suburb_key, postcode);

-- ---------------------------------------------------------------- council area counts and rates (Table 01)
-- One row per year and council area (the region "Total" rows are not stored: adding them in would count every incident twice). Two rows
-- are not council areas (Justice Institutions and Immigration Facilities, Unincorporated Vic) and have no rate.
CREATE TABLE fact_crime_lga (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  year_ending        integer NOT NULL,
  police_region      text NOT NULL,
  lga                text NOT NULL,
  incidents          integer NOT NULL CHECK (incidents >= 0),
  rate_per_100k      double precision,
  PRIMARY KEY (dataset_version_id, year_ending, lga)
);

-- ---------------------------------------------------------------- the CSA's own notices, stored as published
-- Read from the Contents and Footnotes sheets of the workbook by the loader and shown verbatim in the report.
CREATE TABLE fact_crime_note (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  note_key           text NOT NULL,
  sheet              text NOT NULL,
  topic              text NOT NULL,
  seq                integer NOT NULL,
  note_text          text NOT NULL,
  PRIMARY KEY (dataset_version_id, note_key)
);

-- ---------------------------------------------------------------- layer switch (AD-4: the source above is cleared and inserted first)
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L18-safety', 'free', true, ARRAY['csa_crime_incidents', 'gnaf']);

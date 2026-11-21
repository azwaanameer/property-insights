-- 0004_vic_suburb_layers: Victorian suburb data for layers L02 Rent, L03 Price, L07 History, L09 Suburb compare (build order step 2a).
-- Tables are still keyed by dataset_version_id and read only through src_dataset_current (AD-7); pipelines write them (AD-8).
-- Suburb = ABS SAL 2021 code (AD-6). Names are matched to codes inside the pipelines and the match type is stored beside each row.
-- The series tables are empty at this point, so reshaping their keys is safe.

-- ---------------------------------------------------------------- series_price: period type, thin-data flags, match provenance
ALTER TABLE series_price DROP CONSTRAINT series_price_pkey;
ALTER TABLE series_price
  ADD COLUMN period_type     text NOT NULL DEFAULT 'year' CHECK (period_type IN ('year', 'quarter')),
  -- true when the source flags the median as resting on fewer than 10 sales ("^" in the Valuer-General files)
  ADD COLUMN low_count       boolean NOT NULL DEFAULT false,
  -- true when the source carried an earlier median forward because there were no sales ("*")
  ADD COLUMN carried_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN source_name     text,
  ADD COLUMN sal_match_type  text NOT NULL DEFAULT 'exact' CHECK (sal_match_type IN ('exact', 'suffix_stripped', 'qualified', 'code'));
-- period = last day of the period: a calendar year ends 12-31, a quarter on its quarter end.
ALTER TABLE series_price ADD PRIMARY KEY (dataset_version_id, sal_code, dwelling_type, period_type, period);
CREATE INDEX series_price_sal_idx ON series_price (dataset_version_id, sal_code);

-- ---------------------------------------------------------------- series_rent: bedrooms, 'all' dwellings, lettings count
ALTER TABLE series_rent DROP CONSTRAINT series_rent_pkey;
ALTER TABLE series_rent DROP CONSTRAINT series_rent_dwelling_type_check;
ALTER TABLE series_rent ADD CONSTRAINT series_rent_dwelling_type_check CHECK (dwelling_type IN ('house', 'unit', 'all'));
ALTER TABLE series_rent RENAME COLUMN bonds_count TO lettings_count;
ALTER TABLE series_rent
  -- 0 = all bedroom counts ("All properties" sheet)
  ADD COLUMN bedrooms       smallint NOT NULL DEFAULT 0 CHECK (bedrooms BETWEEN 0 AND 6),
  -- 'moving_year' = median of leases that began in the 12 months ending at `period` (Homes Victoria "moving annual" median)
  ADD COLUMN period_type    text NOT NULL DEFAULT 'moving_year' CHECK (period_type IN ('moving_year')),
  -- true when the median rests on fewer than 10 new lettings
  ADD COLUMN low_count      boolean NOT NULL DEFAULT false,
  ADD COLUMN source_name    text,
  ADD COLUMN sal_match_type text NOT NULL DEFAULT 'exact' CHECK (sal_match_type IN ('exact', 'suffix_stripped', 'qualified', 'code'));
ALTER TABLE series_rent ADD PRIMARY KEY (dataset_version_id, sal_code, dwelling_type, bedrooms, period_type, period);
CREATE INDEX series_rent_sal_idx ON series_rent (dataset_version_id, sal_code);

-- ---------------------------------------------------------------- suburb markers (Census 2021 and SEIFA 2021), long format
-- One row per suburb and marker under the dataset version of the source that produced it.
-- Money markers are integer cents (key ends _cents); shares are fractions 0..1; SEIFA keys carry the ABS index values.
CREATE TABLE fact_suburb_marker (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  marker_key         text NOT NULL,
  value              double precision,
  -- ABS quality flag where the source gives one (SEIFA OBS_STATUS "q")
  flag               text,
  PRIMARY KEY (dataset_version_id, sal_code, marker_key)
);
CREATE INDEX fact_suburb_marker_sal_idx ON fact_suburb_marker (dataset_version_id, sal_code);

-- ---------------------------------------------------------------- suburb adjacency from G-NAF locality neighbours
-- Both directions are stored. The match types say how each G-NAF locality name was matched to an ABS suburb.
CREATE TABLE ref_suburb_neighbour (
  dataset_version_id   bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code             text NOT NULL,
  neighbour_sal_code   text NOT NULL,
  sal_match_type       text NOT NULL,
  neighbour_match_type text NOT NULL,
  PRIMARY KEY (dataset_version_id, sal_code, neighbour_sal_code),
  CHECK (sal_code <> neighbour_sal_code)
);

-- ---------------------------------------------------------------- source rows set aside: not matched to a suburb, or a value outside its range.
-- Counted and listed, never guessed. 'out_of_range' rows are source values that fail the range check (for example a $7,000 unit median).
CREATE TABLE src_dataset_unmatched (
  unmatched_id       bigserial PRIMARY KEY,
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  file               text NOT NULL,
  source_name        text NOT NULL,
  reason             text NOT NULL CHECK (reason IN ('none', 'ambiguous', 'duplicate_sal', 'not_in_suburb_list', 'outside_vic', 'out_of_range')),
  detail             text NOT NULL DEFAULT ''
);
CREATE INDEX src_dataset_unmatched_version_idx ON src_dataset_unmatched (dataset_version_id);

-- ---------------------------------------------------------------- sources (AD-4): all CC BY 4.0
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('vgv_medians', 'Valuer-General Victoria median prices by suburb (DataVic)', 'CC BY 4.0', 'cleared',
   'State of Victoria (Valuer-General Victoria), CC BY 4.0.',
   NULL, 'public',
   'Annual medians 2015 to 2025 and five quarters to March 2026, units and houses. Files downloaded by hand into data/raw/vic/sales-valuer-general.'),
  ('homes_victoria_rents', 'Homes Victoria moving annual median rent by suburb and town', 'CC BY 4.0', 'cleared',
   'State of Victoria (Department of Families, Fairness and Housing), CC BY 4.0.',
   NULL, 'public',
   'New lettings only (rental bonds). Areas are suburbs or small groups of suburbs; grouped areas are not matched to a suburb.'),
  ('abs_census_2021', 'ABS 2021 Census General Community Profile, suburbs and localities', 'CC BY 4.0', 'cleared',
   'Australian Bureau of Statistics, 2021 Census of Population and Housing, CC BY 4.0.',
   NULL, 'public', 'SAL 2021 codes, so no name matching.'),
  ('abs_seifa_2021', 'ABS SEIFA 2021, suburbs and localities', 'CC BY 4.0', 'cleared',
   'Australian Bureau of Statistics, Socio-Economic Indexes for Areas 2021, CC BY 4.0.',
   NULL, 'public', 'SAL 2021 codes, so no name matching.'),
  ('gnaf_neighbours', 'G-NAF locality neighbours (adjacent suburbs)', 'CC BY 4.0 plus Geoscape terms (same as gnaf)', 'cleared',
   'Incorporates or developed using G-NAF, copyright Geoscape Australia, licensed under CC BY 4.0.',
   NULL, 'public',
   'Derived from the G-NAF locality neighbour table, so it follows the gnaf rights decision: CLEARED 2026-11-20 on the same owner statement as migration 0003 (Geoscape approved; written confirmation not seen by the build). If gnaf goes back to pending, set this to pending too and switch L09 off.');

-- ---------------------------------------------------------------- layer switches. All sources above are cleared, so the rights trigger accepts them.
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L02-rent',            'free', true, ARRAY['homes_victoria_rents', 'vgv_medians']),
  ('L03-price',           'free', true, ARRAY['vgv_medians']),
  ('L07-history',         'free', true, ARRAY['vgv_medians', 'homes_victoria_rents']),
  ('L09-suburb-compare',  'free', true, ARRAY['gnaf_neighbours', 'abs_asgs_2021', 'vgv_medians', 'homes_victoria_rents', 'abs_census_2021', 'abs_seifa_2021']);

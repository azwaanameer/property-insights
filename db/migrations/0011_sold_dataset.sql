-- 0011_sold_dataset: recent sales as reported on realestate.com.au listings (L21-sales) and the price-driver model fitted on them (L04-drivers).
-- The sold listings were harvested through the RapidAPI realty-in-au wrapper (scripts/27-sold-harvest.mjs and scripts/06-rp-harvest.mjs) and are loaded by
-- pipeline/ingest/rp-sold.mjs into a versioned table; pipeline/derive/price-drivers.mjs fits the model on the current version and publishes it as its own
-- dataset. The report never calls the listing site or RapidAPI: it reads the loaded tables through src_dataset_current (AD-7).
-- Rights ruling, owner, 2026-11-21: sale history has no licence issue and the sold listings may be used for the price-driver model.
-- No agent, agency or phone value is stored anywhere: the loader reads only the property fields below.

-- ---------------------------------------------------------------- sources (AD-4), before the layer rows that list them
INSERT INTO src_source (source_id, name, licence, rights_status, attribution_text, max_cache_days, display_scope, notes) VALUES
  ('rp_sold_listings', 'Recent sales as reported on realestate.com.au listings (via RapidAPI realty-in-au)',
   'Third-party listing data (realestate.com.au via RapidAPI realty-in-au); reuse ruled acceptable by the owner 2026-11-21',
   'cleared',
   'Recent sales as reported on realestate.com.au listings, retrieved by VicProp.',
   NULL, 'public',
   'Sold listings for 26 Victorian suburbs, harvested 2026-11-11 and 2026-11-21 and loaded as a versioned dataset (fact_reported_sale). Each sale shows its date, price, bedrooms, bathrooms, car spaces, address and a link to its realestate.com.au listing page, labelled as reported by that site, never as verified and never as a Victorian title record. Property fields only: no listing text, photos, agent, agency or phone is stored. Rights cleared by the owner 2026-11-21.'),
  ('rp_sold_model', 'VicProp price-driver model (derived)',
   'Derived work from the rp_sold_listings dataset (third-party listing data; reuse ruled acceptable by the owner 2026-11-21)',
   'cleared',
   'Price-driver model computed by VicProp from sales reported on realestate.com.au listings.',
   NULL, 'public',
   'Ordinary least squares on log sale price with suburb fixed effects, apartments only, over the sold listings of every harvested suburb pooled; written by pipeline/derive/price-drivers.mjs from the current rp_sold_listings dataset and published only if its checks pass. Effects are associations in past sales, never causes, and no price is predicted. Rights follow rp_sold_listings (cleared by the owner 2026-11-21).');

-- ---------------------------------------------------------------- sales
-- One row per sold listing. suburb is the suburb the listing gives; harvest_suburb is the suburb the harvest searched (the six inner suburbs
-- are the CRM suburbs, Melbourne CBD for 3000 and the St Kilda Road strip); sal_code is the ABS SAL 2021 code of the harvest suburb.
-- street_key is the street as G-NAF names it (upper case, last word spelled out), street_no keeps a range as "11-17", unit_no the flat number.
-- building_id is the G-NAF building (primary pid) the pipeline matched the street number and street to inside the same suburb and postcode;
-- no match leaves building_id and match_type null, and nothing is guessed (AD-6).
CREATE TABLE fact_reported_sale (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  listing_id         text NOT NULL,
  address_text       text NOT NULL,
  street_key         text,
  unit_no            text,
  street_no          text,
  suburb             text NOT NULL,
  suburb_key         text NOT NULL,
  postcode           text NOT NULL,
  harvest_suburb     text NOT NULL,
  sal_code           text,
  lat                double precision,
  lon                double precision,
  price_aud          integer NOT NULL,
  bed                integer,
  bath               integer,
  park               integer,
  property_type      text NOT NULL,
  sold_on            date NOT NULL,
  url                text NOT NULL,
  building_id        text,
  match_type         text CHECK (match_type IS NULL OR match_type IN ('exact_street_number')),
  PRIMARY KEY (dataset_version_id, listing_id),
  CHECK ((building_id IS NULL) = (match_type IS NULL))
);
CREATE INDEX fact_reported_sale_building_idx ON fact_reported_sale (dataset_version_id, building_id, sold_on DESC) WHERE building_id IS NOT NULL;
CREATE INDEX fact_reported_sale_street_idx ON fact_reported_sale (dataset_version_id, suburb_key, postcode, street_key, sold_on DESC);
CREATE INDEX fact_reported_sale_sal_idx ON fact_reported_sale (dataset_version_id, sal_code);

-- ---------------------------------------------------------------- the model (published under its own source, rp_sold_model)
-- One row per effect, in percent: effect_pct is (exp(coefficient) - 1) x 100 and se_pct the coefficient's standard error x 100 (both on the log
-- price scale, as scripts/23-price-drivers.mjs reported them). driver is bed_2, bed_3, bath_2plus, car_space, floor_10_19, floor_20_29,
-- floor_30plus or suburb:SAL (a suburb against the reference suburb, whose own row has effect 0 and is_reference true). n_used and n_total are
-- the sales the model used and the apartment sales it could have used; n_group the used sales that have the characteristic (or are in the suburb).
-- r_squared and residual_pct (the typical unexplained spread, in percent) describe the whole fit and repeat on every row.
CREATE TABLE derived_price_driver (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  driver             text NOT NULL,
  sal_code           text,
  suburb_name        text,
  is_reference       boolean NOT NULL DEFAULT false,
  effect_pct         double precision NOT NULL,
  se_pct             double precision NOT NULL,
  n_used             integer NOT NULL,
  n_total            integer NOT NULL,
  n_group            integer NOT NULL,
  window_from        date NOT NULL,
  window_to          date NOT NULL,
  r_squared          double precision NOT NULL,
  residual_pct       double precision NOT NULL,
  PRIMARY KEY (dataset_version_id, driver)
);

-- Median reported sale price by suburb and layout (bedrooms 1 to 3, bathrooms 1 or 2 and more, with or without a car space), only where
-- the suburb has at least 20 sales of that layout; a thinner cell has no row.
CREATE TABLE derived_layout_median (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  beds               integer NOT NULL CHECK (beds BETWEEN 1 AND 3),
  baths              integer NOT NULL CHECK (baths IN (1, 2)),
  has_car            boolean NOT NULL,
  median_price       integer NOT NULL,
  n                  integer NOT NULL,
  PRIMARY KEY (dataset_version_id, sal_code, beds, baths, has_car)
);

-- ---------------------------------------------------------------- layer switches (AD-4: the sources above are cleared and inserted first)
-- Both are free for now, like every other section: nothing paid can be sold until payments exist. L13 is left as it was.
INSERT INTO layer_config (layer_id, tier, enabled, source_ids) VALUES
  ('L21-sales',   'free', true, ARRAY['rp_sold_listings', 'gnaf']),
  ('L04-drivers', 'free', true, ARRAY['rp_sold_listings', 'rp_sold_model', 'gnaf']);

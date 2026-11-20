-- 0001_core: foundation schema. Table prefixes follow the spine: src_ ref_ series_ derived_ fact_ app_ vendor_cache.
-- Pipelines write ref_/series_/derived_/fact_/src_ ; the app writes app_ and vendor_cache only (AD-8).
-- Data tables are keyed by dataset_version_id; the serve plane reads only through src_dataset_current (AD-7).
-- Coordinates are plain lat/lon (GDA2020); PostGIS is deferred to the supply layer.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- source registry and versions (AD-4, AD-7)

CREATE TABLE src_source (
  source_id        text PRIMARY KEY,
  name             text NOT NULL,
  licence          text NOT NULL,
  rights_status    text NOT NULL CHECK (rights_status IN ('cleared', 'pending', 'blocked')),
  attribution_text text NOT NULL DEFAULT '',
  max_cache_days   integer,
  display_scope    text NOT NULL DEFAULT 'public' CHECK (display_scope IN ('public', 'signed_in', 'internal')),
  notes            text NOT NULL DEFAULT ''
);

CREATE TABLE src_dataset_version (
  dataset_version_id bigserial PRIMARY KEY,
  source_id          text NOT NULL REFERENCES src_source (source_id),
  retrieved_at       timestamptz NOT NULL,
  file_sha256        text,
  row_count          bigint NOT NULL DEFAULT 0,
  licence_snapshot   text NOT NULL,
  as_of              date NOT NULL,
  states             text[] NOT NULL DEFAULT '{}',   -- states this dataset covers (VIC only today)
  status             text NOT NULL DEFAULT 'loading' CHECK (status IN ('loading', 'published', 'failed')),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX src_dataset_version_source_idx ON src_dataset_version (source_id, dataset_version_id DESC);

-- The one pointer the serve plane reads. Moved only by pipeline/publish in a single transaction.
CREATE TABLE src_dataset_current (
  source_id          text PRIMARY KEY REFERENCES src_source (source_id),
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  published_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- reference data (AD-6 keys)

-- Suburb = ABS SAL 2021 code.
CREATE TABLE ref_suburb (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  name               text NOT NULL,
  state              text NOT NULL,
  area_sqkm          double precision,
  PRIMARY KEY (dataset_version_id, sal_code)
);

-- Building = G-NAF primary-address pid that has at least one live, principal secondary (alias rows excluded).
CREATE TABLE ref_building (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  building_id        text NOT NULL,
  sal_code           text,
  state              text NOT NULL,
  unit_count         integer NOT NULL,
  building_name      text,
  display_address    text NOT NULL,
  lat                double precision,
  lon                double precision,
  PRIMARY KEY (dataset_version_id, building_id)
);
CREATE INDEX ref_building_sal_idx ON ref_building (dataset_version_id, sal_code);

-- Address = G-NAF address_detail_pid. Only live, principal (non-alias) rows.
-- building_id is the primary pid (a unit points at its primary; a property-level row points at itself).
-- It is null only for a unit-like row with no PRIMARY_SECONDARY link.
CREATE TABLE ref_address (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  gnaf_pid           text NOT NULL,
  building_id        text,
  is_property_level  boolean NOT NULL,
  unit_number        text,
  flat_type          text,
  level_number       text,
  number_first       text,
  number_last        text,
  street_name        text,
  street_name_norm   text,
  street_type        text,
  street_suffix      text,
  building_name      text,
  locality_name      text NOT NULL,
  locality_norm      text NOT NULL,
  postcode           text,
  state              text NOT NULL,
  sal_code           text,
  sal_match_type     text NOT NULL DEFAULT 'none',
  lat                double precision,
  lon                double precision,
  display_address    text NOT NULL,
  search_text        text,
  PRIMARY KEY (dataset_version_id, gnaf_pid)
);
-- Exact resolver lookup: property-level row by street number and street.
CREATE INDEX ref_address_resolve_idx ON ref_address (dataset_version_id, number_first, street_name_norm) WHERE is_property_level;
-- Units under a building.
CREATE INDEX ref_address_building_idx ON ref_address (dataset_version_id, building_id, unit_number) WHERE NOT is_property_level;
-- Suggest: trigram search over property-level rows only (units resolve through the matched building).
CREATE INDEX ref_address_search_trgm_idx ON ref_address USING gin (search_text gin_trgm_ops) WHERE is_property_level;

-- ---------------------------------------------------------------- series, derived, validation (tables only; filled by later steps)

CREATE TABLE series_price (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  dwelling_type      text NOT NULL CHECK (dwelling_type IN ('house', 'unit')),
  period             date NOT NULL,
  median_cents       bigint,
  sales_count        integer,
  PRIMARY KEY (dataset_version_id, sal_code, dwelling_type, period)
);

CREATE TABLE series_rent (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  dwelling_type      text NOT NULL CHECK (dwelling_type IN ('house', 'unit')),
  period             date NOT NULL,
  median_weekly_rent_cents bigint,
  bonds_count        integer,
  PRIMARY KEY (dataset_version_id, sal_code, dwelling_type, period)
);

CREATE TABLE derived_rating (
  dataset_version_id bigint NOT NULL REFERENCES src_dataset_version (dataset_version_id),
  sal_code           text NOT NULL,
  dwelling_type      text NOT NULL CHECK (dwelling_type IN ('house', 'unit')),
  score              double precision NOT NULL,
  band               text,
  PRIMARY KEY (dataset_version_id, sal_code, dwelling_type)
);

-- AD-5: the only switch for serving the conditions rating.
CREATE TABLE market_validation (
  state               text NOT NULL,
  dwelling_type       text NOT NULL,
  status              text NOT NULL CHECK (status IN ('validated', 'not_validated', 'not_tested')),
  pairwise_score_low  double precision,
  pairwise_score_high double precision,
  windows             text NOT NULL DEFAULT '',
  checked_on          date,
  PRIMARY KEY (state, dwelling_type)
);

-- ---------------------------------------------------------------- layer switches (AD-4)

CREATE TABLE layer_config (
  layer_id   text PRIMARY KEY,
  tier       text NOT NULL CHECK (tier IN ('free', 'paid')),
  enabled    boolean NOT NULL DEFAULT false,
  source_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A layer can be switched on only if it lists sources and every one is cleared.
CREATE FUNCTION layer_config_check_rights() RETURNS trigger AS $$
DECLARE
  bad text;
BEGIN
  IF NEW.enabled THEN
    IF cardinality(NEW.source_ids) = 0 THEN
      RAISE EXCEPTION 'layer % cannot be enabled: it lists no sources', NEW.layer_id;
    END IF;
    SELECT string_agg(s, ', ') INTO bad
    FROM unnest(NEW.source_ids) AS s
    WHERE NOT EXISTS (SELECT 1 FROM src_source x WHERE x.source_id = s AND x.rights_status = 'cleared');
    IF bad IS NOT NULL THEN
      RAISE EXCEPTION 'layer % cannot be enabled: source(s) not cleared: %', NEW.layer_id, bad;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER layer_config_rights_gate
  BEFORE INSERT OR UPDATE ON layer_config
  FOR EACH ROW EXECUTE FUNCTION layer_config_check_rights();

-- ---------------------------------------------------------------- application tables (AD-8: written by the app)

CREATE TABLE app_user (
  user_id    text PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_org (
  org_id     text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_org_member (
  org_id  text NOT NULL REFERENCES app_org (org_id),
  user_id text NOT NULL REFERENCES app_user (user_id),
  role    text NOT NULL DEFAULT 'member',
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE app_subscription (
  subscription_id  text PRIMARY KEY,
  org_id           text REFERENCES app_org (org_id),
  user_id          text REFERENCES app_user (user_id),
  plan             text NOT NULL,
  status           text NOT NULL CHECK (status IN ('active', 'past_due', 'cancelled')),
  report_allowance integer,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  CHECK (org_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE TABLE app_report (
  report_id  text PRIMARY KEY,
  user_id    text REFERENCES app_user (user_id),
  gnaf_pid   text NOT NULL,
  status     text NOT NULL DEFAULT 'queued',
  r2_key     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stores only the matched pid, never the free text an anonymous user typed.
CREATE TABLE app_lookup_log (
  lookup_id      bigserial PRIMARY KEY,
  request_id     text NOT NULL,
  gnaf_pid       text NOT NULL,
  principal_kind text NOT NULL,
  principal_id   text,
  layers_served  jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- vendor cache (AD-4, AD-8: written by adapters)

CREATE TABLE vendor_cache (
  cache_key    text PRIMARY KEY,
  vendor       text NOT NULL,
  principal_id text,
  payload      jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CHECK (expires_at <= fetched_at + interval '30 days')
);

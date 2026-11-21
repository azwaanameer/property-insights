-- 0005_purchases: guest purchases identified by email (step 2c). The app writes app_ tables only (AD-8).
-- No card data is stored: only the provider's own references. A purchase is `one` (one address, 30 days) or `pro`
-- (monthly, every address while active). Access ends at expires_at, or when the provider reports a refund.

CREATE TABLE app_purchase (
  purchase_id               text PRIMARY KEY,                    -- random, unguessable: it is the bearer of the return link
  email                     text NOT NULL,                       -- lower case
  plan                      text NOT NULL CHECK (plan IN ('one', 'pro')),
  gnaf_pid                  text,                                -- the address a `one` purchase unlocks; null for pro
  status                    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  amount_cents              integer NOT NULL CHECK (amount_cents > 0),   -- GST included
  currency                  text NOT NULL DEFAULT 'AUD',
  provider                  text NOT NULL,                       -- 'stripe' or 'dev'
  provider_ref              text,                                -- checkout session id
  provider_payment_ref      text,                                -- payment intent or invoice id, used to find a purchase from a refund
  provider_subscription_ref text,                                -- pro only
  created_at                timestamptz NOT NULL DEFAULT now(),
  paid_at                   timestamptz,
  expires_at                timestamptz,
  refunded_at               timestamptz,
  ended_at                  timestamptz,                         -- pro only: the subscription was cancelled. Terminal: a late renewal cannot reopen it
  CHECK ((plan = 'one') = (gnaf_pid IS NOT NULL))
);
CREATE INDEX app_purchase_email_idx ON app_purchase (email);
CREATE INDEX app_purchase_provider_ref_idx ON app_purchase (provider, provider_ref);
CREATE INDEX app_purchase_payment_ref_idx ON app_purchase (provider, provider_payment_ref);
CREATE INDEX app_purchase_subscription_ref_idx ON app_purchase (provider, provider_subscription_ref);

-- One row per provider event. The primary key makes a repeated delivery a no-op once applied_at is set. A row with no
-- applied_at is a claim that was never finished (a worker died); after a couple of minutes a retry may take it over.
CREATE TABLE app_webhook_event (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  event_type  text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz,
  PRIMARY KEY (provider, event_id)
);

- source_spec: `spec-foundation-address-lookup.md`
  summary: Show the CC BY attribution text from `src_source.attribution_text` in the report and PDF (renders with L14 Sources).
  evidence: Attribution is seeded but never read; CC BY requires it. Launch blocker before any public use.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Add rate limiting and anti-enumeration to anonymous suggest, resolve and report endpoints.
  evidence: Open endpoints allow scraping of the address table (relevant to the Geoscape terms) and cost abuse.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Add dataset-version retention (keep current plus N) and a version-scoped search index.
  evidence: The GIN trigram index spans every version, so suggest slows with each reload.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Test `gnaf-extract.py` against a synthetic G-NAF zip, or spot-check unit counts against `scripts/32-gnaf-building-units.py` on the first real load.
  evidence: The loader tests use a hand-written TSV, so alias skipping and primary linking are unverified.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Run the app end to end (vite dev or preview) and test route wiring, including static versus dynamic route precedence.
  evidence: `vite dev` crashed on Windows (workerd stack overflow); the search page has never rendered. Unverified, medium if broken.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Build a golden set of real VIC addresses to measure resolver hit rate; handle street suffix words, ranges, locality-only text and an ambiguity code.
  evidence: Fixtures hold few real cases; `data/benchmark_addresses.json` holds real CRM addresses usable locally.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Dependency and repo hygiene: move `xlsx` to devDependencies, align version pins, add `engines`, `.dev.vars.example`, `python3` fallback.
  evidence: `xlsx@0.18.5` has known advisories and only pipelines use it.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Rights hardening: migration checksums and advisory lock, trigger on `src_source` downgrade, rights audit table, `vendor_cache` use of `max_cache_days` and a required principal.
  evidence: The gate checks rights at run time; the DB trigger checks them only when a layer row is inserted or updated.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Launch hardening: lookup-log indexes and retention, non-blocking log write, security headers, CI for typecheck and test, staging environment, README, log message scrubbing.
  evidence: Reported by the blind reviewer; none needed for local build.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Publish and loader guards: refuse an older version after a newer one, protect ROLLBACK from masking errors, reject short TSV rows, write extract files atomically.
  evidence: Edge reviewer; low likelihood with one operator.
- source_spec: `spec-foundation-address-lookup.md`
  summary: Word the L01 "suburb dataset not published" gap separately from "suburb not matched" (money formatting by `Figure.unit` landed in `src/render/format.ts` with spec-vic-suburb-layers-data).
  evidence: L01 still says the suburb is unknown for both cases.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Homes Victoria reports 66 rent areas as groups of suburbs ("Carlton-Parkville", "Prahran-Windsor", "Ballarat") that do not match one ABS suburb, so L02 shows a gap for them. Decide whether to add a hand-checked area-to-suburb table, or show the group figure labelled as an area.
  evidence: Real PGlite load, 79 of 146 areas matched per sheet. Names are never guessed in the pipeline (AD-6).
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Retention for the new datasets (`series_price`, `series_rent`, `fact_suburb_marker`, `ref_suburb_neighbour`): keep current plus N versions. Each re-run adds about 95,000 rows.
  evidence: Same gap as the G-NAF retention item; the new tables have no index that spans versions, so reads stay fast.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: The `gnaf_neighbours` source follows the `gnaf` rights decision (cleared 2026-11-20 on the owner's Geoscape statement). If gnaf is set back to pending, also set `gnaf_neighbours` to pending and switch L09 off; a trigger or a single rights row would remove the manual step.
  evidence: Migration 0004 notes.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Run the new layers against the real Neon database (HTTP driver) and through the running app; only PGlite was available to the build.
  evidence: Owner decision 2026-11-20: the owner runs the real migration and loads.

- source_spec: none
  summary: Build the Pine marketing site UI in the app (home, report, checkout and confirmation views, merged "What is in the report" grid) wired to the address suggest, resolve and report API, per the approved mockup pine-site.artifact.html.
  evidence: Split from the 2026-11-20 build request so the suburb data and layers (spec 2a) land first; the report page needs real L02 to L09 data to look right.
- source_spec: none
  summary: Checkout, payment adapter (Stripe when keys exist, dev-only unlock otherwise) and entitlement grants for purchased addresses and Pro, including the refund path and purchase identity (email token) since there is no login.
  evidence: Split from the 2026-11-20 build request; depends on the site UI and on a decision about purchase identity and the payment provider.

- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Show CC BY attribution per source in the report and footer from `src_source.attribution_text`.
  evidence: Review finding: attribution is seeded for five sources and never rendered; a launch blocker. Step 2b adds the footer credits; the per-source block is still needed.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Decide how to show the 66 grouped Homes Victoria rent areas (for example Carlton-Parkville, Richmond-Burnley) so inner-city apartment suburbs are not a gap in L02.
  evidence: They are core apartment markets and the numbers exist at area level; needs an owner decision on an Estimated area-level rent.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Check the 33 unmatched Valuer-General names name by name (Westgarth, Syndal, Studfield, Jolimont, Coburg East, Cheltenham East, Fishermans Bend) and add an alias table where a suburb exists.
  evidence: The stated cause was unverified and several are long-standing suburbs.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Store the count of G-NAF adjacency pairs dropped for ambiguous or unmatched localities and say so in L09.
  evidence: 536 pairs and 43 localities are dropped; a suburb next to one shows a shorter list with no disclosure.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Freshness and consistency pass: show the period of each median in L09 cells, read as_of and rows in one query so a pointer flip cannot split them, and list VGV rows whose name has unusual characters.
  evidence: Review findings on mixed quarters, a pointer-flip race and a regex that can drop rows without listing them; low likelihood with one operator.
- source_spec: `spec-vic-suburb-layers-data.md`
  summary: Add a small committed zip fixture for `readZipMembers` and restore a dev-seed behaviour test; tidy temp dirs and the duplicated money formatter.
  evidence: The zip path is only exercised by the real-file test, which is skipped when `data/raw` is absent.

- source_spec: `spec-marketing-site-ui.md`
  summary: Launch blocker: the marketing copy promises 20 sections for a house and 23 for a flat while the report has five layers (L01, L02, L03, L07, L09); build the layers or trim the copy before any public launch.
  evidence: Review finding and a misleading-conduct risk flagged by the claims review; recorded in the spec Design Notes.
- source_spec: `spec-marketing-site-ui.md`
  summary: Launch polish for the site: self-host fonts, privacy and terms links, mobile nav menu, focus and page-title update on report load, honest generating state, favicon and Open Graph, accessible type sizes and keyboard scrolling for wide tables.
  evidence: Blind review findings; none affect correctness but several matter before a public launch.
- source_spec: `spec-marketing-site-ui.md`
  summary: Add a DOM test environment (jsdom or similar) and interaction tests for the address combobox: arrows, Enter, Escape, pick keeps the unit, newer keystroke discards an older response.
  evidence: Verification-gap finding; the repo has only node-environment tests and the browser checks ran on a deleted temporary config.
- source_spec: `spec-marketing-site-ui.md`
  summary: Define and disclose Pro plan fair-use limits (or confirm there are none) before selling Pro.
  evidence: The claims review says any limit on a subscription described as covering client addresses must be disclosed near the price.

- source_spec: `spec-checkout-entitlements.md`
  summary: Run checkout once end to end in Stripe test mode (one report, Pro, renewal on a test clock, full refund) and fix any request or event shape that differs from the documentation the provider was written against.
  evidence: The Stripe provider was tested only against a stubbed fetch and self-signed fixtures. A Pro refund may not map to its purchase if Stripe omits the invoice id on the charge (the code also reads `payment_intent`, `invoice` and `metadata.purchase_id`).
- source_spec: `spec-checkout-entitlements.md`
  summary: Buyers cannot reopen a report after clearing cookies or switching browser, and cannot cancel Pro themselves. Add sign-in or an emailed link, a Stripe Customer Portal link, and email sending (receipt, access link).
  evidence: Design Notes of the spec; the pricing page already says "Cancel any time". Pro cancellation is only possible from the Stripe dashboard today.
- source_spec: `spec-checkout-entitlements.md`
  summary: Rate limiting and abuse control on `POST /api/v1/checkout` (anonymous callers can create pending purchase rows) and on the webhook endpoint; add a cleanup for old `pending` and `failed` purchases.
  evidence: Same gap as the open-endpoint item from the foundation spec; each call writes a row.
- source_spec: `spec-checkout-entitlements.md`
  summary: Production safety for the dev unlock: also refuse it when a production marker is set (for example a `ENVIRONMENT=production` var), and fail the deploy if `ALLOW_DEV_UNLOCK` is present in production secrets.
  evidence: The spec only requires `ALLOW_DEV_UNLOCK=1` and no Stripe key; nothing else stops a mistaken production setting when no Stripe key is set yet.
- source_spec: `spec-checkout-entitlements.md`
  summary: Consumer-law and tax items before taking money: refund wording and process (the copy promises a full refund if the report does not load, but refunds are manual in Stripe), GST invoice or receipt, Pro fair-use terms, and whether a 30 day reopen window is what the pricing page promises.
  evidence: The spec forbids automatic refunds; the checkout page repeats the FAQ refund sentence.

- source_spec: `spec-checkout-entitlements.md`
  summary: Before selling Pro: build a cancel path (self-serve or support process), because the copy promises cancel any time and the claims review requires easy cancellation of a subscription.
  evidence: Review finding; today Pro can only be cancelled from the Stripe dashboard. Pro must not be sold until this exists.
- source_spec: `spec-checkout-entitlements.md`
  summary: Before switching on the first paid layer: make payableLayers address-specific (the layer must cover the address) and verify the Pro refund-to-purchase match and a pinned Stripe API version in Stripe test mode.
  evidence: Review findings: any enabled paid layer makes every address payable; the Pro refund match relies on the charge carrying the invoice id, unverified against real Stripe.
- source_spec: `spec-checkout-entitlements.md`
  summary: Handle chargeback (charge.dispute.created), invoice.payment_failed and customer.subscription.updated events, and make access sharing harder (one-time token exchange for the return link, or login).
  evidence: Review findings; today the 32 day expiry is the only backstop and a bearer link opens Pro on any number of devices.

- source_spec: `spec-report-return-rating-questions.md`
  summary: Add a serve-time freshness check that the published rating was built from the current Census and Valuer-General dataset versions, and read both inputs inside one transaction in `pipeline/derive/rating.mjs`.
  evidence: Review findings: the rating records input versions in `file_sha256` but nothing compares them at serve time; a pointer move mid-run records the wrong inputs.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Make L05 and L13 state-aware (standard questions mention section 32 and owners corporation; L05 gap message is Victorian) before any non-Victorian state is loaded.
  evidence: Review finding; only Victorian addresses resolve today.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Extend the calculator with stamp duty, land tax, loan costs and an equity return, and test its edit and reset wiring in a real browser.
  evidence: Review findings; the section now states what it leaves out, and the repo has no DOM test tooling.
- source_spec: `spec-report-return-rating-questions.md`
  summary: Add negative tests for the rating publish checks (fifths, ordering, shrink below 80%), fix `getRating`'s unit-only unrated reason, and give the synthesis pass a shared time budget.
  evidence: Review findings; a weakened check would still pass today.

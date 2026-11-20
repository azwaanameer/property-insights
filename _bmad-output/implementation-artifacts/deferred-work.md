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
  summary: Format money figures by `Figure.unit` in the renderer, and word the "suburb dataset not published" gap separately.
  evidence: L01 has no money figures yet; applies when L02 and L03 land.

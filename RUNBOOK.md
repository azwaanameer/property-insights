# VicProp runbook: getting the site and its data running

Written 2026-11-21. Run every command from the repo root in PowerShell. `.env` must hold `DATABASE_URL` (a Neon connection string). Never paste it into chat. The old password was pasted into a chat earlier: rotate it in the Neon console first, then update `.env`.

## 0. What exists and what has run

| Piece | State |
|---|---|
| App (TanStack Start on Cloudflare), schema, migrations 0001 to 0005 | Built and tested in memory (358 tests, type check, production build all pass). Never run against your Neon database. |
| Address search and L01 Property (needs the G-NAF load) | Built. The G-NAF load into Neon has not completed: the log from 14 Nov stops at 2.1 million of 4.19 million rows. |
| Suburb data and layers L02 Rent, L03 Price, L07 History, L09 Suburb compare | Built. Loaders verified against your real files in memory. Not loaded into Neon. |
| Marketing site, report page, checkout and confirmation pages | Built and viewed in a browser against stand-in data. Not deployed. |
| Payments | Stripe code written, never run against Stripe. A dev-only unlock exists for localhost. |

## 1. Look at the database first (Neon SQL editor)

```sql
SELECT source_id, dataset_version_id, published_at FROM src_dataset_current;
SELECT source_id, status, count(*) FROM src_dataset_version GROUP BY 1, 2 ORDER BY 1;
SELECT pg_size_pretty(pg_database_size(current_database()));
```

Expect nothing yet, or a partial `gnaf` row from the old attempt. If a `gnaf` version is `loading` (the old run was killed, not failed cleanly), its rows still use storage. Inspect, then remove them:

```sql
SELECT dataset_version_id, status, row_count FROM src_dataset_version WHERE source_id = 'gnaf';
-- only for versions whose status is 'loading' or 'failed', never the published one:
DELETE FROM ref_address  WHERE dataset_version_id = <id>;
DELETE FROM ref_building WHERE dataset_version_id = <id>;
UPDATE src_dataset_version SET status = 'failed' WHERE dataset_version_id = <id>;
```

## 2. Decide the Neon plan before the G-NAF load

The Victorian G-NAF file is 4,187,113 addresses (583 MB as TSV, already extracted in `data/out/gnaf-vic/`). With the search index the table will be several times that size, well past the free tier's 0.5 GB. Use a paid Neon plan, or the load will stop partway again. Check `pg_database_size` after the load. Nothing else in this runbook is large (the five suburb loads add about 95,000 small rows).

## 3. Load order

```powershell
node --env-file=.env db/migrate.mjs                       # schema: tables, sources, layer switches
node --env-file=.env pipeline/ingest/suburbs-sal.mjs      # suburb list; the loaders need it
node --env-file=.env pipeline/ingest/gnaf-load.mjs        # addresses; long; TSV is already extracted
node --env-file=.env pipeline/ingest/vgv-medians.mjs      # Valuer-General prices
node --env-file=.env pipeline/ingest/homes-vic-rents.mjs  # Homes Victoria rents
node --env-file=.env pipeline/ingest/census-sal.mjs       # Census markers (needs python on PATH)
node --env-file=.env pipeline/ingest/seifa-sal.mjs        # SEIFA markers
node --env-file=.env pipeline/ingest/locality-neighbours.mjs   # adjacent suburbs (needs python on PATH)
```

Every loader prints rows, matches and anything set aside, exits non-zero if a check fails, and leaves the old data live in that case. Any loader can be dry-run in memory first with `--pglite` instead of `--env-file=.env`. To re-extract G-NAF from the zip instead of reusing the TSV: `python -I pipeline/ingest/gnaf-extract.py` first.

Check: `GET /api/v1/coverage` shows L01, L02, L03, L07 and L09 live, and the report for a Docklands unit (try `310/628 Flinders St Docklands`) returns them `ok`.

Roll back one layer without code: `UPDATE layer_config SET enabled = false WHERE layer_id = 'L09-suburb-compare';`. Roll a dataset back to its previous version, and retry a failed load: see the runbook in `_bmad-output/implementation-artifacts/spec-vic-suburb-layers-data.md`, steps 6 and 7.

## 4. Run the site locally

`npm run dev` crashes on this Windows machine (workerd). Use the Node host instead:

```powershell
npm run dev:node        # reads .env, serves http://localhost:5173
```

Pages: `/` home, `/report/<gnaf_pid>` report, `/checkout/<gnaf_pid>`, `/done`. The search needs the G-NAF load. Without a database every API call answers with a plain error, and the pages still render.

## 5. Deploy to Cloudflare (untested here)

```powershell
npm run build
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put ENTITLEMENT_SECRET      # 32+ random characters
npx wrangler deploy
```

Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` the same way only when you are ready to take payments. Never set `ALLOW_DEV_UNLOCK` in production. Run the Stripe test-mode steps in `_bmad-output/implementation-artifacts/spec-checkout-entitlements.md` (Implementation Notes) before using real keys. The Worker bundle and the Neon driver have not been exercised in workerd, so expect to fix small things on first deploy.

## 6. What is not done (read before launching)

Blockers before the public sees it:
- **The site promises more than the report holds.** The copy says 20 sections for a house and 23 for a flat. The report has five layers (L01, L02, L03, L07, L09). Build the layers or trim the copy.
- **Nothing can be sold yet.** No paid layer exists (sale history needs the reported web lookup, spec `spec-reported-web-lookup.md`, still a draft with rights `pending`). Checkout correctly answers "nothing to unlock".
- **Pro has no cancel path** but the copy says cancel any time. Do not sell Pro until it does.
- **Stripe is untested.** The Pro refund-to-purchase match and the API version pin need a test-mode run.
- **CC BY attribution per source, privacy and terms links, and the Geoscape wording** in the footer need checking and finishing.
- **No login or receipt email.** A buyer who clears cookies cannot reopen a purchase.
- **No rate limiting** on the anonymous search and checkout endpoints.

Known data gaps: 66 grouped Homes Victoria areas (Carlton-Parkville, Richmond-Burnley and others) give L02 a gap; 33 Valuer-General names (Westgarth, Syndal, Fishermans Bend and others) are unmatched. Everything deferred is in `_bmad-output/implementation-artifacts/deferred-work.md`.

Not started: layers for schools, transport, flood, bushfire, heritage, planning, the building and short-stay, the return calculator, and the A4 PDF.

## 7. Git

The foundation is committed (`8825e37`). Everything since is uncommitted in the working tree: migrations 0004 and 0005, the pipelines, layers, site, checkout, tests, specs and this file. Review it, then commit when you are ready. `.env` is ignored by git.

## 8. Live deployment (2026-11-21)

Worker `vicprop` is deployed at https://vicprop.agenticapps.workers.dev (Cloudflare account on the logged-in Wrangler). Secrets set: `DATABASE_URL`, `ENTITLEMENT_SECRET`. Not set, on purpose: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (checkout answers `payments_not_configured`) and `ALLOW_DEV_UNLOCK` (the dev route answers 404). Redeploy with `npm run build` then `npx wrangler deploy`. The branch `build/foundation` is pushed to origin; `main` is unchanged. The GitHub repo is public.

---
title: 'Checkout, payment adapter and entitlements (build order step 2c)'
type: 'feature'
created: '2026-11-20'
status: 'done'
route: 'dispatch'
baseline_commit: 'df4040d9fb9da86b795ca1e557583483a2d4a1d5'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-property-insights-2026-11-14/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-marketing-site-ui.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every request is anonymous, so a paid layer is always locked, and the approved site has a checkout and a confirmation page with nothing behind them.

**Approach:** Add guest purchases identified by email: a payment adapter (Stripe when keys exist, a dev-only unlock otherwise), a purchase table, a signed cookie that turns a paid purchase into a `user` principal, and the checkout and confirmation pages. Entitlement still decides in one place (AD-3).

## Boundaries & Constraints

**Always:** `entitlements()` stays the only reader of a plan; extend the principal, not the callers. A purchase is `one` (one address, 30 days, price 2400 cents including GST) or `pro` (monthly, 9900 cents including GST, every address while active). Prices are one config file and are proposals. Payments go through a `PaymentProvider` interface (`createCheckout`, `verifyWebhook`). The Stripe provider uses `fetch` against the Stripe REST API with webhook signature verification, no SDK, and cannot be tested against Stripe here, so say so. The dev provider exists only when `ALLOW_DEV_UNLOCK=1` and `STRIPE_SECRET_KEY` is unset, shows a visible "Dev unlock, no payment taken" banner, and can never run in production. Webhooks are idempotent on the provider event id. The entitlement cookie is HttpOnly, Secure outside dev, SameSite=Lax and HMAC-signed with `ENTITLEMENT_SECRET`; a bad signature means anonymous. Zod validates every request. No sale of nothing: checkout refuses to start when no paid layer is enabled and cleared for the address, with a plain message. Migration 0005 only; the reported-lookup spec's migration moves to 0006.

**Never:** No card data touches our server or logs. No email sending, login, password or magic link (deferred). No automatic refunds; record `refunded` only from a provider event. No commits. Never print `DATABASE_URL`, `STRIPE_*` or `ENTITLEMENT_SECRET`. Do not edit migrations 0001 to 0004 or `scripts/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start one-report checkout | Valid pid and email, a paid layer exists | Pending purchase and a provider checkout URL, or a dev unlock link in dev mode | N/A |
| No paid layer | Address has no enabled, cleared paid layer | 409 `nothing_to_unlock`, no purchase row | Page shows the message |
| Payment succeeds | Verified webhook or verified dev unlock | Purchase `paid`, `expires_at` set; return sets the cookie | Duplicate event is a no-op |
| Bad webhook signature | Tampered body | 400, no change | Logged without the body |
| Entitled request | Cookie for pid X, request for X | Paid layers return data | N/A |
| Other address | Same cookie, pid Y, plan `one` | Paid layers stay locked | N/A |
| Pro active | Cookie with active pro | Paid layers open on every address | Expired pro locks again |
| Tampered or expired cookie | Bad HMAC or past `expires_at` | Treated as anonymous | N/A |
| Dev unlock in production | `ALLOW_DEV_UNLOCK` unset | Dev route returns 404 | N/A |
| Refund event | Provider refund webhook | Purchase `refunded`, access ends | N/A |

</frozen-after-approval>

## Code Map

- `src/server/services/entitlements.ts`, `src/server/contracts/address.ts` -- `entitlements()`, `resolvePrincipal()`, `Principal`; extend the principal with the unlocked pids and plan from the cookie.
- `src/server/http/handlers.ts` -- `handleReport` already takes the principal; add checkout, webhook, purchase-status and dev-unlock handlers in the same style (`guarded`, `parse`).
- `src/server/repos/*`, `src/server/db.ts` -- repo pattern; the app may write `app_` tables only (AD-8).
- `db/migrations/0001_core.sql` -- existing `app_user`, `app_subscription`, `app_report`; read before adding `0005_purchases.sql` (`app_purchase`, `app_webhook_event`).
- `src/routes/api/v1/**` -- add route files for `checkout`, `webhooks/stripe`, `purchases/me`, `dev/unlock`.
- `src/routes/checkout.$gnafPid.tsx`, `src/routes/done.tsx`, `src/render/pine.css`, `src/site/copy.ts` -- checkout (plan choice, email, order summary with GST included, refund line) and confirmation pages per the mockup; step 2b created the styles and copy.

## Tasks & Acceptance

**Execution:**
- [x] `db/migrations/0005_purchases.sql` -- purchase and webhook-event tables
- [x] `src/server/payments/{types,stripe,dev,index}.ts`, `src/config/pricing.ts` -- adapter interface, Stripe REST provider, dev provider, price config
- [x] `src/server/services/{purchases,entitlement-cookie}.ts`, `src/server/repos/purchase.ts` -- create, mark paid, expire, refund; sign and verify the cookie
- [x] `src/server/services/entitlements.ts`, `src/server/contracts/address.ts` -- principal and decision for a purchased pid and for pro
- [x] `src/server/http/handlers.ts`, `src/routes/api/v1/**` -- endpoints
- [x] `src/routes/checkout.$gnafPid.tsx`, `src/routes/done.tsx` -- pages with plain error states
- [x] `src/**/*.test.ts` -- one test per matrix row on PGlite with a fake provider and signed fixtures
- [x] Record the env vars and the Stripe setup steps in Implementation Notes

**Acceptance Criteria:**
- Given a fake paid layer in a test, when a paid purchase exists for pid X, then the report for X returns that layer's figures and the report for Y returns a locked layer with no figures.
- Given `npm test`, `npx tsc --noEmit` and `npm run build`, then all pass.
- Given no `STRIPE_SECRET_KEY` and no `ALLOW_DEV_UNLOCK`, then checkout cannot complete and says payments are not configured.

## Implementation Notes

### Build notes (2026-11-21, subagent run)

**Built.** Migration `db/migrations/0005_purchases.sql` (`app_purchase`, `app_webhook_event`; the reported-lookup spec already names 0006). `src/config/pricing.ts` (2400 cents and 30 days; 9900 cents a month; GST is one eleventh; `src/site/copy.ts` now builds its dollar strings from it). `src/server/payments/{types,stripe,dev,index}.ts`, `src/server/{config,crypto}.ts`, `src/server/repos/purchase.ts`, `src/server/services/{purchases,entitlement-cookie}.ts`. `entitlements()` gained a third argument `{ gnaf_pid, now }`; the principal is now `anonymous` or `user` with `plan` (`none | one | pro`), `plan_expires_at` and `unlocked[]`, built by `resolvePrincipal(request, db)` (now async, DB-checked). `layer-runner` passes the address pid. Handlers `handleCheckoutInfo`, `handleCheckoutStart`, `handleStripeWebhook`, `handlePurchaseStatus`, `handleDevUnlock` in `handlers.ts`; routes `api/v1/{checkout,webhooks/stripe,purchases/me,dev/unlock}`; pages `checkout.$gnafPid.tsx` and `done.tsx` (components `CheckoutPage`, `DonePage`, `checkout-api.ts`); checkout styles in `pine.css`.

**Decisions.**
- The cookie (`vp_entitlement`) holds only signed purchase ids and its own expiry (400 days). Access is read from `app_purchase` on every request, so a refund or an expiry ends access even while the cookie is valid. A tampered, wrong-secret, malformed or expired cookie is anonymous. The existing `individual` plan name became `one`; its old "any paid plan opens everything" rule is gone and the two tests that used it were updated.
- The purchase id (`pur_` plus 32 hex) is the bearer in the return link `/done?purchase=...`. `GET /api/v1/purchases/me?purchase=` reports its status and, once paid, sets the cookie. The page polls it for 30 seconds while the webhook lands.
- Checking order in `POST /checkout`: body, then "payments configured" (provider and `ENTITLEMENT_SECRET`), then the address, then "a paid layer is enabled and cleared" (409 `nothing_to_unlock`), then the provider call. Missing `ENTITLEMENT_SECRET` counts as payments not configured, because a paid purchase could never become access.
- Webhooks claim the event id in `app_webhook_event` before applying and release it if applying throws, so a provider retry is handled. Every transition is conditional SQL (`pending` to `paid` once; refund only from `pending` or `paid`), so a payment arriving after a refund does not reopen access.
- Pro access runs `period_days` 32 from payment; an `invoice.paid` for a later cycle moves it on; `customer.subscription.deleted` ends it now.
- New error codes: `payments_not_configured` (503), `nothing_to_unlock` (409), `payment_failed` (502), `not_found` (404).
- Added to `src/server/http/handlers.ts` rather than a new file, as the Code Map says; the append was written in one block.

**Environment variables (secrets only in Cloudflare secrets or the gitignored `.dev.vars`, never in `wrangler.jsonc`).**
- `ENTITLEMENT_SECRET`: at least 32 random characters, for example `openssl rand -base64 48`. Required for any purchase to work. Rotating it signs every buyer out.
- `STRIPE_SECRET_KEY`: `sk_test_...` or `sk_live_...`. Its presence selects Stripe and switches the dev unlock off.
- `STRIPE_WEBHOOK_SECRET`: `whsec_...` of the endpoint below.
- `ALLOW_DEV_UNLOCK=1`: development only, in `.dev.vars`. Without a Stripe key it enables the dev provider, the "Dev unlock, no payment taken" banner and `GET /api/v1/dev/unlock`. Do not set it in production; with a Stripe key set it is ignored anyway.

**Stripe setup (test mode first).**
1. Create a Stripe account and switch to test mode. No Product or Price objects are needed: Checkout Sessions are created with inline `price_data` from `src/config/pricing.ts`.
2. `wrangler secret put STRIPE_SECRET_KEY` with the test secret key, and `wrangler secret put ENTITLEMENT_SECRET`.
3. Developers, Webhooks, add endpoint `https://<your-domain>/api/v1/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `invoice.paid`, `customer.subscription.deleted`. Copy its signing secret into `wrangler secret put STRIPE_WEBHOOK_SECRET`. For local work, `stripe listen --forward-to localhost:<port>/api/v1/webhooks/stripe` prints a `whsec_` for `.dev.vars`.
4. Enable at least one paid layer (a `layer_config` row with `tier = 'paid'`, `enabled = true`, every source cleared). Until then real checkout correctly answers `nothing_to_unlock`.
5. Buy once with card 4242 4242 4242 4242, confirm the purchase turns `paid`, open the report, refund it in the Stripe dashboard, confirm access ends. Then repeat with Pro and a renewal (Stripe test clock).
6. Set a GST and receipt policy in Stripe (price here includes GST; no Stripe Tax is configured), and add a Customer Portal link if Pro buyers are to cancel themselves (there is no cancel screen yet).

**Verification.** `npx tsc --noEmit` clean; `npm test` 324 pass (26 files; 83 are new, covering every matrix row on PGlite with a fake provider and HMAC-signed fixtures, the Stripe request shapes and signature checks against a stubbed fetch, the cookie, pricing and the two pages as rendered HTML); `npm run build` passes and regenerates the route tree. Not verified: anything against real Stripe (request and event shapes follow its documentation only); the real Neon HTTP driver (only PGlite); the pages in a browser (vite dev and wrangler crash on this machine, see deferred-work); the Worker bundle in workerd; `process.env` secrets inside a deployed Worker (relies on `nodejs_compat`, as `DATABASE_URL` already does).

### Review fixes (2026-11-21)

Fixed after review: only a failed provider call fails a purchase, and a verified paid event moves a `failed` purchase to paid; a Stripe key without `STRIPE_WEBHOOK_SECRET` counts as payments not configured; webhook events carry `applied_at` and a claim older than 2 minutes can be taken over; a refund, renewal or end that matches no purchase is released and answered 409 `event_unmatched` so Stripe resends it; renewals use `GREATEST` and an ended subscription (`ended_at`) cannot be reopened; a paid event must match the purchase's amount, currency and mode, `checkout.session.expired` and `async_payment_failed` fail the purchase, every Stripe call times out at 10 seconds; checkout refuses with 409 `already_entitled` (a one-report purchase is refused when the cookie already opens that address or Pro is active, a Pro purchase only when Pro is active, so a one-report holder can still upgrade); the cookie is rebuilt from the ids still active in the database, so the 20-id cap never drops an active Pro; the dev unlock also needs a `localhost` or `127.0.0.1` host; the confirmation page keeps polling through errors and offers a retry; the checkout page resets on browser Back; the copy no longer mentions a receipt or email.

### Before selling

Do not take real money until each of these is closed.
- The Pro refund-to-purchase matching and the Stripe API version are unverified against real Stripe. Pin the API version on the account or in the request, run a test-mode purchase, refund and renewal, and store and check the `payment_intent` too once its place in the events is seen.
- `payableLayers` is not address-specific. Before the first paid layer is switched on, it must check that the layer covers the address, or a buyer could pay for an address with nothing paid behind it.
- Pro has no cancel screen although the copy says "Cancel any time". Do not sell Pro until a cancel path exists (a Stripe Customer Portal link at minimum).
- Chargebacks (`charge.dispute.created`), `invoice.payment_failed` and `customer.subscription.updated` events are not handled, so a disputed or failing Pro purchase keeps access until its expiry.
- If `process.env` were missing under workerd, every secret would read as unset and payments would show as not configured. That fails closed, but check it on the first deploy.

## Spec Change Log

## Review Triage Log

| # | Finding (reviewer) | Verdict | Route | Evidence |
|---|--------------------|---------|-------|----------|
| 1 | Session created but the DB write fails: purchase marked failed, later paid event ignored (blind) | high | patch | Verified in `startCheckout`: one try/catch covers both calls and `markPaid` accepts only pending. Fixed with a failed-then-paid test. |
| 2 | Checkout works without STRIPE_WEBHOOK_SECRET, so money could be taken and never confirmed (blind) | high | patch | Verified: only the Stripe key and entitlement secret were checked. Now part of the not-configured check. |
| 3 | Webhook event claimed before applied; a kill between leaves the purchase pending forever; release errors swallowed (edge) | high | patch | Claim is not atomic with apply. `applied_at` added to the claim; stale claims re-claimable. |
| 4 | Unmatched refund, renewal or end events are claimed and dropped; refund-before-paid ends with a refunded buyer holding access (edge) | high | patch | Verified by reading `applyClaimedEvent`. Unmatched events now release and answer retryable. |
| 5 | Late renewal reopens a cancelled Pro; older renewal can shorten expiry (blind, edge) | medium | patch | `setExpiry` overwrites. GREATEST and a terminal ended state added, reorder test. |
| 6 | Paid event not checked against amount, currency and plan; session expiry and async failure unhandled; no Stripe timeout (blind, edge) | medium | patch | Verified. Checks, mappings, 10 second timeout added. |
| 7 | A buyer can pay again for access already held (blind, edge) | medium | patch | 409 already_entitled added; paid but no entitlement secret now answers not configured. |
| 8 | Second purchase added to an existing cookie untested; cookie cap can drop an active Pro id (gap, edge) | medium | patch | No test passes an existing cookie. Tests added; cap prunes inactive ids first; dev-unlock concurrency fixed. |
| 9 | Dev unlock gated only by env vars (blind, edge) | medium | patch | Also requires a localhost host, so a production deploy with the flag set still returns 404. |
| 10 | Done page stops polling on one failed check; checkout page stuck busy after Back; return link referrer leak (blind, gap, edge) | medium | patch | Verified. Polling extracted and tested, pageshow reset, no-referrer and no-store added. |
| 11 | Copy says a receipt is emailed and that email identifies the purchase; none is sent (blind) | medium | patch | Reworded to what is true. |
| 12 | Pro refund may not map back to its purchase; Stripe API version not pinned (blind, edge, gap) | high | defer | Cannot be settled without real Stripe. Recorded under "Before selling" in the spec notes and in deferred-work. |
| 13 | payableLayers is not address-specific (blind, edge) | medium | defer | Nothing is sellable today (no paid layer enabled). Must be fixed before the first paid layer is switched on. |
| 14 | Pro has no cancel screen though copy says cancel any time (blind) | high | defer | Pro must not be sold until a cancel path exists; recorded as a before-selling blocker. |
| 15 | Chargebacks, payment failed and subscription updated events unhandled (blind) | medium | defer | Recorded; the 32 day expiry is the backstop. |
| 16 | Route wrappers untested; DonePage and CheckoutPage not executed in a browser (gap) | medium | defer | Thin wrappers; the Stripe test-mode run in the notes would catch a swap. No DOM test environment exists. |
| 17 | Bearer return link is shareable for Pro on many devices; privacy and terms links absent next to the email field (blind) | medium | defer | Needs a one-time token exchange or login (deferred); privacy and terms already a launch item. |
| 18 | Silent empty environment under workerd; webhook body not zod-validated; pending rows never cleaned (blind, edge) | low | defer | Not wrong today; record for the first staging deploy. |


## Design Notes

Purchase identity is a signed cookie plus the purchase row keyed by email; a lost cookie means the buyer cannot reopen the report until login or a magic link is built (deferred). Today no paid layer exists, so real checkout correctly refuses; the dev provider and the fake paid layer in tests prove the wiring until paid layers land.

## Verification

**Commands:**
- `npm test` -- expected: all pass
- `npx tsc --noEmit` -- expected: clean
- `npm run build` -- expected: Worker bundle builds

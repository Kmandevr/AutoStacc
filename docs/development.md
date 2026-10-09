---
title: Development
summary: Running the site and store locally in test mode, environment variables, the three test suites, and how to extend the store (product types, providers, emails, routes).
updated: 2026-10-08
---

# Development

## Run it

```sh
npm install            # once: Wrangler (local Cloudflare), Better Auth, Stripe SDK
npm run dev            # site + store API on http://localhost:8788  (node scripts/dev.js [--port N] [--fresh])
node scripts/serve.js  # static pages only, store "offline" (what the SEO and verify-site checks use)
```

`npm run dev` builds (`scripts/build.js`), collects `dist/` (`scripts/dist.js`), creates `.dev.vars` with fresh local secrets if missing, applies migrations to a local D1 database, syncs the catalog, seeds test data and starts `wrangler pages dev`. Nothing touches Cloudflare. Local state lives in `.wrangler/state` (`--fresh` wipes it).

Test mode (local only):

- **Payments:** the mock provider. Checkout opens `/checkout?...&mock=...` with buttons: pay, decline, abandon. They go through the same pipeline as Stripe events.
- **Email:** kept in the database. Read verification and reset links at `http://localhost:8788/api/dev/outbox?to=<email>`.
- **Catalog:** every product is for sale (drafts included), plus `dev-free`, `dev-paused` and `dev-unpublished`, and each product has a small test file to download.
- **Admin:** sign up as `admin@autostacc.test` (in `.dev.vars` `ADMIN_EMAILS`), confirm via the outbox, open `/admin`.

## Environment variables

Plain settings are `[vars]` in `wrangler.toml` (per environment: top level = local, `env.preview`, `env.production`); secrets are `.dev.vars` locally and Pages secrets in production ([store-setup](store-setup.md)). Validated by `server/lib/config.js`.

| Name | Kind | Meaning |
| --- | --- | --- |
| `APP_ENV` | var | `development`, `test`, `preview` or `production` |
| `SITE_URL` | var | The site's own address (links in mail, Stripe return URLs, origin checks) |
| `PAYMENT_PROVIDER` | var | `stripe`, or `mock` (development/test only) |
| `EMAIL_PROVIDER` | var | `brevo`, or `log` (not in production) |
| `EMAIL_FROM` | var | `Name <address>` of a Brevo-verified sender for purchase mail (`store@`) |
| `EMAIL_FROM_NOREPLY` | var | the same for automated mail: account, password reset, alerts (`noreply@`) |
| `BETTER_AUTH_SECRET` | secret | 32+ chars, signs sessions |
| `DOWNLOAD_SIGNING_SECRET` | secret | 32+ chars, different, signs download links |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | secret | Stripe keys (`sk_live_` only in production, never elsewhere) |
| `STRIPE_MARKETPLACE_KEY`, `STRIPE_MARKETPLACE_WEBHOOK_SECRET`, `PLATFORM_COUNTRY` | secret, optional | The second Stripe account for creators' sales and payouts; off without the first two ([payouts-setup](payouts-setup.md)) |
| `BREVO_API_KEY` | secret | Brevo key |
| `ADMIN_EMAILS` | secret | Admin emails, comma-separated |
| `STRIPE_API_BASE` | var | Tests only: points the Stripe SDK at the fake Stripe server (ignored outside development/test) |

Bindings: `DB` (D1), `FILES` (private R2), `PREVIEWS` (R2 for preview clips).

## Database

Schema changes are new files in `db/migrations/` with the next number (`0007_....sql`), forward-only: add tables and columns, never drop or rewrite data in a migration. Apply locally by restarting `npm run dev`; the deploy applies them to production before publishing. `db/catalog.sql` is generated; never edit it.

## Tests

| Command | What | Time |
| --- | --- | --- |
| `node scripts/seo-test.js` | Search visibility (also checks the build is current) | seconds |
| `npm test` | Unit tests (`test/unit`): config refusals, download tokens, cart parsing, Stripe event mapping, router, catalog SQL, platform hierarchy and links (a second project added as data), Your Stacc views over one asset list | seconds |
| `npm run test:api` | API security suites (`test/api`) against two local stores: mock payments, and Stripe mode with a fake Stripe API (`test/support/fake-stripe.js`) and really signed webhooks | ~2 min |
| `npm run test:browser` | Browser and chaos tests (`test/browser`) in Chromium at phone and desktop sizes | ~1 min |
| `verify-site` skill | Every page in a browser with the store offline | ~1 min |

The API suites attack: the account pages' server gate (anonymous, forged, expired and signed-out sessions, open redirects, unknown Settings sections, nothing private in any page's HTML), account settings (another account's devices, tokens in answers, unknown or non-boolean email switches, the export leaking another customer, deletion without the right email or password, from another site, by an admin or creator owner, or while impersonating; what deletion keeps and removes), anonymous and forged/expired sessions, cross-account access, enumeration, reset abuse, rate limits, role escalation; price, id, quantity tampering, duplicate and racing checkouts; unsigned, mis-signed, replayed, duplicated, racing and mismatched webhooks; cancel, fail, refund, reconciliation; downloads without login or entitlement, someone else's file or link, edited, forged and expired links, guessed paths, unpublished files, revoked access; guest keys, adoption by verified email, account hijack by unverified email; follows and Auto-Stacc (free only, once, never paid), Pac/kind tags on files with downloads still per product, poll votes (one per verified account, closed polls, projects without polls); malformed input, cross-site requests, admin access. The browser suite walks the public cover, the gate (log in and land back where you were going) and the signed-in app's navigation and sign-out, and breaks the purchase flow with double clicks, the back button, refresh, offline, slow and failing API, store down, declined and abandoned payments, expired sessions and links, keyboard-only use, and checks overflow, tap targets and CSP errors at 320–1280px. CI: `.github/workflows/store.yml`.

When fixing a store bug, write the failing test first in the suite for that area.

## Extending

- **New product type:** one entry in `data/product-types.js`.
- **New payment provider:** a file in `server/payments/` with `name`, `livemode`, `createCheckout`, `retrieveCheckout` (and webhook verification producing the normalized event), plus one line in `server/payments/index.js` and its webhook route. Orders already store `provider`.
- **New email provider:** one function in `server/email/providers.js`. **New email:** one template in `server/email/templates.js`, sent with `sendEmail(app, kind, to, data, { dedupeKey })`.
- **New entitlement source** (bundle, subscription): grant with `grantStmt` and a new `source_type` (add it to the CHECK in a migration).
- **New API route:** add it to the owning module's `routes` table; a new module adds one import and one entry in `server/app.js`.

---
title: Store
summary: How the store works: architecture, product and release model, accounts, cart, checkout, payments, orders, entitlements, downloads, email, admin, analytics and the security model.
covers: [server/app.js, server/auth/, server/account/, server/pages/, server/catalog/, server/cart/, server/checkout/, server/payments/, server/orders/, server/entitlements/, server/downloads/, server/files/, server/storage/, server/email/, server/admin/, server/analytics/, server/revenue/, server/newsletter/, server/lib/, functions/, db/migrations/, scripts/lib/catalog.js, _headers, wrangler.toml, js/store.js, js/cart.js, js/checkout.js, js/library.js, js/settings*.js, js/admin*.js, js/impersonation.js, data/product-types.js]
updated: 2026-10-09
---

# Store

The store is a digital product system bolted onto the static site without turning it into an app. Pages stay static HTML on Cloudflare Pages; only `/api/*`, the media routes (`/media/previews/*`, `/media/sites/*`), the account and admin page gates and creators' pages run code, as Cloudflare Pages Functions (`functions/`). Setup for the owner: [store-setup](store-setup.md). Running and testing it locally: [development](development.md). Why it's built this way: [decisions](decisions.md).

```
static pages (HTML/CSS/JS, data/)          browser: cart in localStorage, ids + quantities only
        │  fetch /api/*
functions/api (catch-all)  →  server/app.js  →  one module per area (below)
        │                                   │
       D1 (db/migrations)          R2: FILES (private), PREVIEWS (public clips)
        │                                   │
Stripe Checkout + signed webhooks      Brevo (email, behind server/email/)
(main and marketplace accounts)
```

## Modules (`server/`)

Each folder owns one area and exports its own route table; `server/app.js` only loads config, hands `/api/auth/*` to Better Auth, checks the origin of state-changing requests and dispatches. Modules talk through plain functions and data, never shared state.

| Module | Owns | Routes |
| --- | --- | --- |
| `auth/` | Better Auth config, `currentUser`, `requireUser`, `requireAdmin` | `/api/auth/*` (Better Auth) |
| `account/` | who is signed in; Settings: devices, email preferences, the data export, deleting the account ([below](#accounts)) | `GET /api/account`, `/api/account/devices` (+ `/:id/sign-out`, `/sign-out-others`), `GET`/`PUT /api/account/email-preferences`, `POST /api/account/export`, `POST /api/account/delete` |
| `pages/` | the server-side gates: account pages (login redirect) and `/admin` (404 unless admin) | `/dashboard`, `/settings` and `/settings/<section>`, `/studio`, `/admin` (Pages Functions in `functions/`) |
| `catalog/` | reading products (price, availability; `state` with `ids` also gives each product's download size from its published files) | `GET /api/products`, `/api/products/state`, `/api/products/:id` |
| `cart/` | pricing a cart from the database | `POST /api/cart/price` |
| `checkout/` | cart → pending order → hosted payment page | `POST /api/checkout` |
| `payments/` | providers (Stripe, mock), which Stripe account takes a product's money (`accounts.js`), Connect payout accounts and transfers (`connect.js`), tax codes per product type (`tax-codes.js`), the one event pipeline, webhooks | `POST /api/webhooks/stripe`, `POST /api/webhooks/stripe-marketplace`, `POST /api/dev/mock-payment` |
| `orders/` | orders, status machine, fulfilment, guest keys, customer refunds (`refunds.js`) | `GET /api/orders`, `/api/orders/:id`, `POST /api/orders/:id/reconcile`, `POST /api/orders/:id/refund`, `POST /api/guest/key` |
| `entitlements/` | ownership, guest adoption, library, free claims, Auto-Stacc grants | `GET /api/library`, `POST /api/library/free` |
| `downloads/` | signed links, streaming private files | `POST /api/downloads`, `GET /api/downloads/:token` |
| `files/` | paid files' lifecycle (only published, active files are delivered) and upload limits | (used by downloads, library, admin) |
| `storage/` | R2 keys and access | (used by downloads, admin, previews) |
| `email/` | templates, providers (Brevo, log), send log | (used by auth, orders) |
| `admin/` | owner tools, paid files and previews (`files.js`), creators (`creators.js`), payout requests (`payouts.js`), customer preview, test purchases ([control center](admin.md)) | `/api/admin/*` |
| `analytics/` | daily counters | `POST /api/events` |
| `stats/` | admin statistics: sections of typed metrics | `GET /api/admin/stats`, `/api/admin/stats/:section` |
| `impersonation/` | support impersonation: rules, the per-request policy, start and exit | `POST /api/admin/customers/:userId/impersonate`, `POST /api/impersonation/exit` |
| `audit/` | the append-only admin audit log | `GET /api/admin/audit` |
| `promotions/` | sales and promo codes: what's running and what it takes off | `GET`/`POST /api/admin/promotions`, `POST /api/admin/promotions/:id/end` |
| `projects/` | projects (synced), follows | `GET /api/projects`, `PUT`/`DELETE /api/follows/:projectId` |
| `polls/` | generic polls and votes | `GET /api/polls/:pollId`, `POST /api/polls/:pollId/vote` |
| `creators/` | creators, members, Studio projects, slug holds, free-plan limits ([creators](creators.md)) | (used by studio, sites, revenue, admin) |
| `studio/` | the Studio API: claim a creator, projects, site drafts, preview, publish, images, products and their files, earnings and payout requests, the payout account | `/api/studio/*` |
| `sites/` | creator sites: the document, blocks, embeds, themes, rendering, publishing, images, public pages | `/<creator>[/<project>[/<page>]]` (`functions/[[path]].js`), `/media/sites/:id` |
| `revenue/` | who sold each order line and how its money splits (`split.js`), creators' earnings and the 14-day hold (`earnings.js`), payout requests (`payouts.js`) | (used by checkout, studio, admin) |
| `integrations/` | connected accounts: the provider registry (none switched on) | |
| `dev/` | test-mode helpers | `GET /api/dev/outbox` |
| `lib/` | config, HTTP, DB, crypto, router, rate limits | |

Frontend pieces, one script each: `js/store.js` (live buttons, STACC'D), `js/cart.js`, `js/auth.js` (login page), `js/account-nav.js` (signed-in or signed-out links in both frames, the account menu, sign-out), `js/dashboard.js`, `js/settings.js` (the Settings shell) + one script per section (`js/settings-profile.js`, `-security.js`, `-orders.js`, `-email.js`, `-privacy.js`), `js/library.js`, `js/checkout.js`, `js/admin.js` + `js/admin-records.js`, `js/admin-stats.js`, `js/admin-customer.js`, `js/admin-promotions.js`, `js/admin-creators.js`, `js/admin-payouts.js`, `js/admin-audit.js`, `js/admin-mobile.js` (tables as cards on phones), `js/impersonation.js` (banner), `js/studio.js` + `js/studio-editor.js`, `js/studio-blocks.js`, `js/studio-products.js`, `js/studio-earnings.js`; shared `GS.api`, `GS.cart`, `GS.track` in `js/util.js`.

## Platform layer

The store is the commerce half of AutoStacc. Projects, Stacclets, Pacs, assets, Your Stacc, follows, Auto-Stacc and polls are built on top of it without changing auth, checkout, payments, entitlements or download security: [architecture](architecture.md), [library](library.md). Schema: `db/migrations/0003_platform.sql` (`products.project_id`, `products.pacs`, `product_files.pac_id`, `product_files.kind`, `projects`, `follows`, `polls`, `poll_votes`).

## Product model

Products live in `data/products.js` (reviewed in git, rendered into static pages and search data) and are synced into D1 by `db/catalog.sql`, which `scripts/build.js` generates and the deploy applies. Checkout only ever reads the database copy, so the price charged is the price on the page. Fields: `id` (also the slug and page address), `title`, `description`, `type`, `price`, `currency` (defaults to `SITE.currency`), `image` (artwork), `preview` (audio clip), `tags`, `includes`, `metadata`, `featured`, `release`, `project` (who created it), `pacs` (the Pacs it delivers), `draft` (= unpublished). The database adds `created_at`, `updated_at`, `sales_paused` (the admin's switch), `max_quantity` and `deleted_at` (a product removed from data is unpublished and marked deleted, never dropped: orders and entitlements point at it).

Types are data too: `data/product-types.js` (music, stems, samples, sample packs, presets, visuals, VJ loops, other) with a label, max quantity per order and preview kind. A new kind of product is one line there.

Paid files are not in git: the owner uploads them in `/admin`; they go to the private `FILES` bucket under random keys (`product_files`), optionally tagged with one of the product's Pacs and a content kind so Your Stacc can file them. Preview clips go to the separate `PREVIEWS` bucket and play from `/media/previews/<file>`; a preview is never the paid file.

## Releases

Releases stay in `data/music.js` (title, slug/id, artwork, date, description, tracks, streaming links). A product points at its release with `release: "<id>"`; the release page lists those products under "From the shop" and the product page links back. Music and store stay separate modules joined only by that id.

## Accounts

[Better Auth](https://www.better-auth.com) with email and password on D1 (tables in `db/migrations/0001_auth.sql`). It owns password hashing (scrypt via the platform's `node:crypto`), session cookies (`gs.session_token`, httpOnly, Secure in production, SameSite=Lax), email verification, password reset, rate limits and its own origin checks. Configured in `server/auth/index.js`:

- Email must be verified before signing in, because purchases attach to accounts by email.
- Sign-up with an existing email answers exactly like a new sign-up and mails the owner of that email instead (no account enumeration); password reset answers the same for unknown emails.
- Reset links last 1 hour, verification links 24 hours; a reset logs out every session. Sessions last 30 days.
- Better Auth's own email change is off; AutoStacc's flow below moves the purchases tied to the address with it. `role` is server-only.
- The account pages (`/dashboard`, `/settings` and its sections, `/studio`) are gated on the server: `server/pages/guard.js` (run by `functions/dashboard.js` etc.) asks Better Auth for the session and answers 302 to `/login?next=<page>` without one (same test as the login page's "already signed in", so the two can't bounce a visitor between them), or serves the static page `Cache-Control: no-store`. The pages hold no data; it comes from the API. `/library` isn't gated (guest receipt links, see Entitlements); `/admin` answers the site's 404 page to anyone not signed in to an admin account (`guardAdminPage`), and the admin API answers 404 too. Login returns only to same-site paths (`GS.safeNext`), else to `/dashboard`.


### Settings

One area, `/settings`, with a page per section: Profile (name, change email), Security (password, signed-in devices), Orders, Emails, Privacy and data. `settings.html` is served for each known section by `functions/settings/[[path]].js` (`guardSettingsPage`: the same gate; an unknown section is the 404 page), and by a `_redirects` rewrite when the store is off. Computers show the section list beside the open section (`/settings` opens Profile); phones show the list at `/settings` and one section per page with a breadcrumb back. The old `/account` is a 301 to `/settings/orders`. Every section saves on its own; email switches save as they flip.

- **Devices:** `server/auth/devices.js` lists the account's live sessions (a device label guessed from the browser, IP, sign-in and last-active times) without ever returning a token; signing one out finds its token server-side and calls Better Auth's `revokeSession`, which checks it is this account's. Better Auth's own `/list-sessions` (which returns tokens) is switched off.
- **Change email:** `server/account/email-change.js`. `POST /api/account/email { email, password }` (password re-checked via `server/auth/password.js`; 5 per 10 minutes per client and per hour per account) mails a signed 1-hour link (`ec1.`, `server/lib/signed.js`, with `BETTER_AUTH_SECRET`, carrying the account's `updatedAt`) to the new address and a notice to the old one. An address that already has an account gets the usual "account exists" mail instead, and an `ADMIN_EMAILS` address gets nothing (admin is granted by address); the answer is always the same. The link opens Settings › Profile, where the same signed-in account presses **Confirm** (`POST /api/account/email/confirm { t }`): a mail scanner fetching the link, or anyone else, changes nothing. The confirm checks the account still has the old address and `updatedAt` (so a link works once and goes stale when the account changes), then in one guarded batch sets the email (verified), moves the account's entitlements, adopts guest orders and grants under the old address, logs out the account's other sessions and drops pending reset links; then adopts guest purchases made with the new address, moves the AutoStacc news list entry, and tells the old address again. Past orders keep the address their receipt went to.
- **Email preferences:** `email_preferences` (`db/migrations/0007_account.sql`, `server/email/preferences.js`): `newReleases` and `platformNews`, both off until switched on, no row = all off. Both are sent from the Control Center (see [email](#email)). Receipts and security mail have no switch.
- **Download your data:** `POST /api/account/export` returns one JSON file (account, email choices, devices without tokens, orders by account or email, library, follows, poll votes, creator memberships, which emails were sent). Each module answers for its own tables.
- **Delete your account:** the person types their email and password (checked with Better Auth's server-only `verifyPassword`). In one transaction: orders by account or email stay as sales records with `user_id` cleared, the email replaced by `deleted-<random>@deleted.invalid` and their guest keys cleared; entitlements are revoked and anonymised the same way; the email log keeps kinds and dates but not the address or body; follows, votes, email preferences, creator memberships, sessions, the password login, reset tokens and the user row are deleted; Better Auth's cookies are expired. The audit log is append-only and keeps its entries. Refused (409) for admin accounts, while the account owns a live creator space, and while a checkout of theirs could still be paid (a pending order under 35 minutes old), so a late payment never lands on an erased account. Password guesses are limited per client and per account. The same email can sign up again as a new account with nothing.
- **Never for support:** an impersonating admin can't see devices, export, delete or change anything here (writes are refused by the impersonation policy; the device list and export refuse themselves).

## Cart and checkout

The cart is ids and quantities in `localStorage`. `POST /api/cart/price` prices it from D1 and lists problems per line (gone, unpublished, paused, free, owned, too many). `POST /api/checkout` refuses any problem, creates a `pending` order with price snapshots, then a Stripe Checkout Session built from those server-side prices (`client_reference_id` and `metadata.order_id` = our order id; Stripe idempotency key per order; the payment page stays open 30 minutes: Stripe requires an expiry of at least 30 minutes after it *receives* the request, so the value sent carries a 2-minute margin, `expiresAtFor` in `server/payments/stripe.js`). An `Idempotency-Key` header from the cart page makes double clicks, refreshes and the back button return the same order; a signed-in customer's identical open order is reused too. Guests give an email and get an httpOnly order key cookie.

Creators' products are charged on a second Stripe account, the marketplace account, and AutoStacc's own on the main one (`server/payments/accounts.js`; everything is main with the mock provider). One payment page can't take both, so a cart holding both answers 409 `split_checkout` with the two groups and is paid in two steps; each order records its `payment_account`. Without the marketplace keys a creator's product answers 503 `creator_sales_closed`. The catalog API (`/api/products`, `/api/products/:id`, `/api/products/state`) adds, for a Studio product, its project's name and address, the creator and `verified` (the creator is trusted); every product has `source`, `verified` and `path`. Each order line records who sold it and how its money splits (platform fee and creator's share, `server/revenue/split.js`), fixed at checkout. Setup and payouts: [payouts-setup](payouts-setup.md).

## Payments and orders

Order states: `pending → paid → refunded`, `pending → failed`, `pending → cancelled` (expired). A verified payment also moves `failed`/`cancelled` to `paid` (the money was taken). Every move is compare-and-set in SQL, so racing events can't double-apply and a refunded order can't become paid again. Orders keep `provider`, `provider_session_id`, `provider_payment_id` and `livemode`, so another provider can be added later without reshaping them.

All outcomes go through `server/payments/events.js`, which accepts only verified events:

1. **Signature and freshness:** Stripe's library checks the `Stripe-Signature` HMAC and refuses timestamps older than 5 minutes (replays).
2. **Once per event:** `payment_events` keyed by event id; a duplicate is acknowledged and ignored; an attempt that errored, or died half-way (still processing after 5 minutes), is redone on Stripe's retry.
3. **Must match the order:** same provider and Stripe account (main or marketplace webhook), session or payment id, order id, live/test mode, and for payments the exact total (before tax) and currency.
4. **Then:** paid → grant entitlements and send the receipt (both idempotent, so a retry finishes a half-done job); expired → cancelled; async failure → failed; full refund → refunded and access revoked; partial refund → noted, access kept; chargeback opened → access suspended, won → restored. A refund or chargeback that arrives before its payment is held by payment id and applied the moment the payment lands. A paid event the store refuses (amount, mode or order mismatch) mails every admin and shows as an alert at the top of `/admin`.

Handled Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Others are logged and ignored. If a webhook is late, the checkout page calls `POST /api/orders/:id/reconcile`, which asks Stripe directly with the secret key and feeds the answer through the same pipeline. The browser's "success" page never changes anything.

Customer refunds: `POST /api/orders/:id/refund` refunds a paid order itself, within 14 days of payment and only if nothing from it was downloaded (`server/orders/refunds.js`; anything else goes to support). The money goes back through the provider, and the order, library and creators' earnings change through the same refund event a webhook would bring, so whichever arrives first wins. The order pages show whether an order can be refunded.

## Entitlements

Ownership is its own table, separate from orders: `entitlements(user_id, email, product_id, source_type, source_id, status, expires_at, ...)` with sources `purchase`, `free`, `promo`, `manual`, `bundle`, `subscription`, `replacement`. Every ownership check reads only this table. A grant is unique per (product, source, email), so replays never duplicate it. Refunds and admin revokes set `status = revoked` (kept for the record).

Guests: a purchase entitlement carries the buyer's email and no account. When someone proves that email (the confirmation link, or a password reset, which also confirms), `entitlements` and `orders` with that email get the account's id: adopted, not copied, and the address gets a "your purchases joined your account" mail with a reset link. Purchases after that link straight to the account. Signing up with someone else's email gets nothing (it can't be verified). Pre-registration is defused: the confirmation mail is sent once, at sign-up (never on sign-in attempts; Better Auth's resend endpoint is disabled), it warns not to click if you didn't sign up, the real owner can always take the account by resetting the password (which logs everyone else out), and adoption is announced by mail. Residual risk: an owner who clicks a confirmation link for an account they didn't create, and ignores the follow-up mail. Until then the guest reaches their order through its key: the cookie set at checkout, or the link in the receipt (`/library#key=...`, one order, 30 days).

## Downloads

`POST /api/downloads {fileId}` checks the requester (account or guest key), finds an active entitlement for the file's product, and returns `/api/downloads/<token>`: an HMAC-SHA256-signed statement (file, entitlement, requester, expiry in 5 minutes, signed with `DOWNLOAD_SIGNING_SECRET`). Redeeming it re-checks everything: signature, expiry, that the person holding the link is the one it was issued to, that the entitlement is still active (refunds revoke even issued links), and that the file belongs to that product. Then the Worker streams the object from the private bucket with `Content-Disposition: attachment` and `Cache-Control: private, no-store`. Storage keys never reach the browser, the bucket has no public URL, and every issue, serve and denial is logged in `download_events` (no IPs).

## Email

`server/email/index.js` sends a template through a provider and logs it in `email_events` (dedupe key so a receipt goes out once; failures are logged, never block a payment; the admin can resend). Templates (`server/email/templates.js`): verify email, reset password, account exists, purchases linked to the account, purchase confirmation, refund confirmation (once per fully refunded order), newsletter confirmation, payout paid or declined (to the creator who asked), new release and AutoStacc news (opt-in), and the admins' alerts (payment rejected; `server/email/alerts.js`: a payout request, a creator file waiting for approval), in the terminal style. Purchase mail goes from `EMAIL_FROM`, the rest from `EMAIL_FROM_NOREPLY`. Optional kinds (new releases, AutoStacc news) are opt-in per account ([settings](#settings)). Providers (`server/email/providers.js`): `brevo` (production) and `log` (development: bodies kept in the database, readable at `/api/dev/outbox`). Another provider or a new kind of mail (abandoned cart, release announcement) is one function or one template.

**Newsletters** (`server/newsletter/`, `js/newsletter.js`): a project page's sign-up posts `{ email, project }` to `/api/newsletter`, which mails a signed 7-day link (`nl1.` HMAC with `DOWNLOAD_SIGNING_SECRET`; same answer for any address; 5 per 10 minutes per client and 3 per 6 hours per address, counted by a hash of it). The link (`GET /api/newsletter/confirm`) adds the address to the project's Brevo list (`BREVO_NEWSLETTER_LISTS`) and returns to the project page with `?newsletter=confirmed|expired|invalid|error`. Only visible first-party projects with a list can be joined (Studio projects aren't trusted by default); nothing is stored on AutoStacc's side. The newsletters themselves are written and sent in Brevo.

**Opt-in mail** (`server/admin/news.js`, Control Center): AutoStacc news is written in the News tab and sent to verified accounts with it switched on; new-release mail goes from Products → Email followers to the project's followers with new-release emails on. Both send in batches of 25 per request (the page repeats until none are left) with a dedupe key per person (news: per issue, from a hash of its text; releases: per product), so a retry never mails twice; each mail links to Settings › Emails to switch it off, and each send is audited. With `BREVO_NEWS_LIST` set, switching AutoStacc news on or off also adds the address to or removes it from that Brevo list (`server/email/contacts.js`, best effort), so news can be sent from Brevo too; deleting the account removes it.

## Admin

`/admin` (the Control Center), for verified accounts whose email is in `ADMIN_EMAILS` (or whose `role` is `admin`); the API answers 404 to everyone else, including an admin who is impersonating a customer. It shows statistics, pauses/resumes sales, uploads, replaces, publishes and deactivates paid files (including creators' held uploads), uploads preview clips, lists and searches orders (with their payment events, entitlements and emails, and a resend-receipt button), customers (with a read-only preview, support impersonation and, in a test store, test purchases), entitlements (grant manual/promo/replacement access, revoke), sales and promo codes, creators, creators' payout requests and the audit log. How each works and its safety rules: [control center](admin.md). Releases are edited in `data/music.js`. The owner can change a price, title or description, publish a product out of draft, hide it, remove and restore it, and pause sales in the Control Center (`PATCH /api/admin/products/:id`), and reject a file (`PATCH /api/admin/files/:id`, with an optional reason; it can't be published again); a change other than pausing marks the product `admin_managed` (`db/migrations/0008_admin_catalog.sql`) so the deploy's catalog sync leaves it alone, and a product's very first appearance still comes from `data/products.js`.

## Analytics

`GS.track(event, id)` → `POST /api/events` → one counter per day, event and product/release id in `analytics_daily`. Events: `page_view` (page kind), `project_view`, `news_view` (post address), `release_view`, `product_view`, `preview_play`, `add_to_cart`, `checkout_start`, `purchase_complete`, `download_request`. Not counted while an admin impersonates a customer. The admin reads them, labelled approximate, in the statistics ([control center](admin.md#statistics-overview)). No cookies, IPs, user ids or user agents; skipped when the browser sends Do Not Track or Global Privacy Control; sent with `sendBeacon` so it never delays the page.

## Security model

- The browser is never trusted with prices, totals, ownership, payment status or order status. Prices come from D1, ownership from `entitlements`, payment status from verified Stripe events or Stripe's API.
- Secrets live only in Cloudflare (production) or `.dev.vars` (local, generated, gitignored). `server/lib/config.js` refuses to run with test Stripe keys or the mock provider in production, live keys outside production, the log mailer in production, or missing/short/reused secrets; the API then answers 503 "store offline" and the rest of the site works. The deploy runs the same check after setting the secrets and prints each broken rule (by name, never the value) as an error in the "Store resources" step.
- Unguessable ids everywhere (`ord_`, `ent_`, `pf_` + 128 random bits); guest and download keys are 256-bit or HMAC-signed; only hashes of guest keys are stored.
- Same-origin check on every state-changing store request (plus Better Auth's own), SameSite=Lax httpOnly cookies, rate limits per client on auth (Better Auth) and store endpoints (`server/lib/ratelimit.js`).
- Admin and unknown things answer 404; unpublished products look exactly like missing ones.
- Support impersonation is a separate, server-verified session bound to the admin's own sign-in, read-mostly, never live payments, always bannered and fully attributed in the append-only audit log ([control center](admin.md#impersonate-customer-support)).
- Signed-out visitors never receive the account pages (server gate above); public pages and their JSON-LD are static and carry nobody's data; `robots.txt` is a crawl hint, never the boundary.
- Headers (`_headers`): no framing by other sites, no MIME sniffing, a restricted referrer and permissions on every page; a strict Content Security Policy (only this site's scripts and API, no framing at all) on account and store pages. API responses are `no-store` and `noindex` (`server/lib/http.js`).
- Test mode can't leak into production: separate databases and buckets per environment (`wrangler.toml`), mock orders are always `livemode 0`, and live/test mismatches between an event and its order are rejected.
- Proven by tests that attack it: [development](development.md#tests).

## Not built yet

Bundles, subscriptions and licences have entitlement sources reserved but no checkout. Discounts are sales and promo codes ([control center](admin.md#sales-and-promo-codes-promotions)); there are no automatic bundle or quantity discounts. A price changed in the Control Center shows live on product cards and pages (`js/store.js`) and is what checkout charges, but the static HTML and search data keep the `data/products.js` price (and title and description) until the pages are built from the database.

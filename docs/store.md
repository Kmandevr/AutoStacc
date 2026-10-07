---
title: Store
summary: How the store works: architecture, product and release model, accounts, cart, checkout, payments, orders, entitlements, downloads, email, admin, analytics and the security model.
updated: 2026-10-07
---

# Store

The store is a digital product system bolted onto the static site without turning it into an app. Pages stay static HTML on Cloudflare Pages; only `/api/*` (and `/media/previews/*`) run code, as Cloudflare Pages Functions. Setup for the owner: [store-setup](store-setup.md). Running and testing it locally: [development](development.md). Why it's built this way: [decisions](decisions.md).

```
static pages (HTML/CSS/JS, data/)          browser: cart in localStorage, ids + quantities only
        │  fetch /api/*
functions/api (catch-all)  →  server/app.js  →  one module per area (below)
        │                                   │
       D1 (db/migrations)          R2: FILES (private), PREVIEWS (public clips)
        │                                   │
Stripe Checkout + signed webhooks      Brevo (email, behind server/email/)
```

## Modules (`server/`)

Each folder owns one area and exports its own route table; `server/app.js` only loads config, hands `/api/auth/*` to Better Auth, checks the origin of state-changing requests and dispatches. Modules talk through plain functions and data, never shared state.

| Module | Owns | Routes |
| --- | --- | --- |
| `auth/` | Better Auth config, `currentUser`, `requireUser`, `requireAdmin` | `/api/auth/*` (Better Auth) |
| `account/` | who is signed in | `GET /api/account` |
| `catalog/` | reading products (price, availability) | `GET /api/products`, `/api/products/state`, `/api/products/:id` |
| `cart/` | pricing a cart from the database | `POST /api/cart/price` |
| `checkout/` | cart → pending order → hosted payment page | `POST /api/checkout` |
| `payments/` | providers (Stripe, mock), the one event pipeline, webhooks | `POST /api/webhooks/stripe`, `POST /api/dev/mock-payment` |
| `orders/` | orders, status machine, fulfilment, guest keys | `GET /api/orders`, `/api/orders/:id`, `POST /api/orders/:id/reconcile`, `POST /api/guest/key` |
| `entitlements/` | ownership, guest adoption, library, free claims, Auto-Stacc grants | `GET /api/library`, `POST /api/library/free` |
| `downloads/` | signed links, streaming private files | `POST /api/downloads`, `GET /api/downloads/:token` |
| `storage/` | R2 keys and access | (used by downloads, admin, previews) |
| `email/` | templates, providers (Brevo, log), send log | (used by auth, orders) |
| `admin/` | owner tools | `/api/admin/*` |
| `analytics/` | daily counters | `POST /api/events` |
| `projects/` | projects (synced), follows | `GET /api/projects`, `PUT`/`DELETE /api/follows/:projectId` |
| `polls/` | generic polls and votes | `GET /api/polls/:pollId`, `POST /api/polls/:pollId/vote` |
| `dev/` | test-mode helpers | `GET /api/dev/outbox` |
| `lib/` | config, HTTP, DB, crypto, router, rate limits | |

Frontend pieces, one script each: `js/store.js` (live buttons, OWNED), `js/cart.js`, `js/auth.js` (login page), `js/account.js`, `js/library.js`, `js/checkout.js`, `js/admin.js` + `js/admin-records.js`; shared `GS.api`, `GS.cart`, `GS.track` in `js/util.js`.

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
- Email changes are off (purchases are tied to the address). `role` is server-only.

## Cart and checkout

The cart is ids and quantities in `localStorage`. `POST /api/cart/price` prices it from D1 and lists problems per line (gone, unpublished, paused, free, owned, too many). `POST /api/checkout` refuses any problem, creates a `pending` order with price snapshots, then a Stripe Checkout Session built from those server-side prices (`client_reference_id` and `metadata.order_id` = our order id; Stripe idempotency key per order; 30-minute expiry). An `Idempotency-Key` header from the cart page makes double clicks, refreshes and the back button return the same order; a signed-in customer's identical open order is reused too. Guests give an email and get an httpOnly order key cookie.

## Payments and orders

Order states: `pending → paid → refunded`, `pending → failed`, `pending → cancelled` (expired). A verified payment also moves `failed`/`cancelled` to `paid` (the money was taken). Every move is compare-and-set in SQL, so racing events can't double-apply and a refunded order can't become paid again. Orders keep `provider`, `provider_session_id`, `provider_payment_id` and `livemode`, so another provider can be added later without reshaping them.

All outcomes go through `server/payments/events.js`, which accepts only verified events:

1. **Signature and freshness:** Stripe's library checks the `Stripe-Signature` HMAC and refuses timestamps older than 5 minutes (replays).
2. **Once per event:** `payment_events` keyed by event id; a duplicate is acknowledged and ignored; an attempt that errored, or died half-way (still processing after 5 minutes), is redone on Stripe's retry.
3. **Must match the order:** same provider, session or payment id, order id, live/test mode, and for payments the exact total and currency.
4. **Then:** paid → grant entitlements and send the receipt (both idempotent, so a retry finishes a half-done job); expired → cancelled; async failure → failed; full refund → refunded and access revoked; partial refund → noted, access kept; chargeback opened → access suspended, won → restored. A refund or chargeback that arrives before its payment is held by payment id and applied the moment the payment lands. A paid event the store refuses (amount, mode or order mismatch) mails every admin and shows as an alert at the top of `/admin`.

Handled Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Others are logged and ignored. If a webhook is late, the checkout page calls `POST /api/orders/:id/reconcile`, which asks Stripe directly with the secret key and feeds the answer through the same pipeline. The browser's "success" page never changes anything.

## Entitlements

Ownership is its own table, separate from orders: `entitlements(user_id, email, product_id, source_type, source_id, status, expires_at, ...)` with sources `purchase`, `free`, `promo`, `manual`, `bundle`, `subscription`, `replacement`. Every ownership check reads only this table. A grant is unique per (product, source, email), so replays never duplicate it. Refunds and admin revokes set `status = revoked` (kept for the record).

Guests: a purchase entitlement carries the buyer's email and no account. When someone proves that email (the confirmation link, or a password reset, which also confirms), `entitlements` and `orders` with that email get the account's id: adopted, not copied, and the address gets a "your purchases joined your account" mail with a reset link. Purchases after that link straight to the account. Signing up with someone else's email gets nothing (it can't be verified). Pre-registration is defused: the confirmation mail is sent once, at sign-up (never on sign-in attempts; Better Auth's resend endpoint is disabled), it warns not to click if you didn't sign up, the real owner can always take the account by resetting the password (which logs everyone else out), and adoption is announced by mail. Residual risk: an owner who clicks a confirmation link for an account they didn't create, and ignores the follow-up mail. Until then the guest reaches their order through its key: the cookie set at checkout, or the link in the receipt (`/library#key=...`, one order, 30 days).

## Downloads

`POST /api/downloads {fileId}` checks the requester (account or guest key), finds an active entitlement for the file's product, and returns `/api/downloads/<token>`: an HMAC-SHA256-signed statement (file, entitlement, requester, expiry in 5 minutes, signed with `DOWNLOAD_SIGNING_SECRET`). Redeeming it re-checks everything: signature, expiry, that the person holding the link is the one it was issued to, that the entitlement is still active (refunds revoke even issued links), and that the file belongs to that product. Then the Worker streams the object from the private bucket with `Content-Disposition: attachment` and `Cache-Control: private, no-store`. Storage keys never reach the browser, the bucket has no public URL, and every issue, serve and denial is logged in `download_events` (no IPs).

## Email

`server/email/index.js` sends a template through a provider and logs it in `email_events` (dedupe key so a receipt goes out once; failures are logged, never block a payment; the admin can resend). Templates (`server/email/templates.js`): verify email, reset password, account exists, purchase confirmation, in the terminal style. Providers (`server/email/providers.js`): `brevo` (production) and `log` (development: bodies kept in the database, readable at `/api/dev/outbox`). Another provider or a new kind of mail (abandoned cart, release announcement, newsletter) is one function or one template.

## Admin

`/admin`, for verified accounts whose email is in `ADMIN_EMAILS` (or whose `role` is `admin`); the API answers 404 to everyone else. It pauses/resumes sales, uploads and deactivates paid files, uploads preview clips, lists and searches orders (with their payment events, entitlements and emails, and a resend-receipt button), customers, entitlements (grant manual/promo/replacement access, revoke), and the analytics counters. Titles, prices and descriptions are edited in `data/products.js` (see decisions); releases in `data/music.js`.

## Analytics

`GS.track(event, id)` → `POST /api/events` → one counter per day, event and product/release id in `analytics_daily`. Events: `release_view`, `product_view`, `preview_play`, `add_to_cart`, `checkout_start`, `purchase_complete`, `download_request`. No cookies, IPs, user ids or user agents; skipped when the browser sends Do Not Track or Global Privacy Control; sent with `sendBeacon` so it never delays the page.

## Security model

- The browser is never trusted with prices, totals, ownership, payment status or order status. Prices come from D1, ownership from `entitlements`, payment status from verified Stripe events or Stripe's API.
- Secrets live only in Cloudflare (production) or `.dev.vars` (local, generated, gitignored). `server/lib/config.js` refuses to run with test Stripe keys or the mock provider in production, live keys outside production, the log mailer in production, or missing/short/reused secrets; the API then answers 503 "store offline" and the rest of the site works.
- Unguessable ids everywhere (`ord_`, `ent_`, `pf_` + 128 random bits); guest and download keys are 256-bit or HMAC-signed; only hashes of guest keys are stored.
- Same-origin check on every state-changing store request (plus Better Auth's own), SameSite=Lax httpOnly cookies, rate limits per client on auth (Better Auth) and store endpoints (`server/lib/ratelimit.js`).
- Admin and unknown things answer 404; unpublished products look exactly like missing ones.
- Headers (`_headers`): no framing, no MIME sniffing, a restricted referrer and permissions on every page; a strict Content Security Policy (only this site's scripts and API) on account and store pages; API responses are `no-store` and `noindex`.
- Test mode can't leak into production: separate databases and buckets per environment (`wrangler.toml`), mock orders are always `livemode 0`, and live/test mismatches between an event and its order are rejected.
- Proven by tests that attack it: [development](development.md#tests).

## Not built yet

Bundles, subscriptions and licences have entitlement sources reserved but no checkout. Discounts have a column (`discount_cents`) but no codes. Account deletion is manual (admin). Editing titles and prices from the admin needs the static pages to be built from the database first.

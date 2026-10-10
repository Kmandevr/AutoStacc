---
title: Control Center
summary: The owner's admin (/admin): statistics and where each number comes from, sales and promo codes, customer preview, support impersonation, test purchases and the audit log, with their safety rules.
covers: [admin.html, js/admin*.js, js/impersonation.js, functions/admin.js, server/admin/, server/stats/, server/promotions/, server/cart/pricing.js, server/impersonation/, server/audit/, server/files/, server/revenue/payouts.js, server/payments/connect.js, db/migrations/0004_admin_ops.sql]
updated: 2026-10-10
---

# Control Center

`/admin`, for verified admin accounts (see [store](store.md#admin)). Anyone else, signed out, a customer, or an admin while impersonating, gets the site's ordinary 404 page from the server (`functions/admin.js` → `server/pages/guard.js`); the page itself is never sent to them. Everything here works on the store's real data; nothing is a mock-up. Tabs: Overview (statistics), Products, Orders, Customers, Entitlements, Promotions, Creators, Payouts, News, Test purchases, Audit log. News writes AutoStacc news to accounts that switched it on (send a test to yourself first); a published product's **Email followers** tells its project's followers who want new-release emails ([store](store.md#email)). Changing a product's title or description here also refreshes what store search matches ([discovery](discovery.md)). Admins are emailed when a creator asks for a payout or uploads a file waiting for approval. On phones a section menu replaces the tabs and tables become cards (`js/admin-mobile.js`). A **LIVE** or **TEST** badge at the top says whether this store takes real payments.

## Statistics (Overview)

`GET /api/admin/stats?days=&mode=live|test`, built from sections in `server/stats/` (sales, customers, products, downloads, promotions, creators, activity); `days` is 1–365 (default 30), `mode` defaults to what the store takes. One section alone: `GET /api/admin/stats/:section`. Each number is labelled with its source, and the page shows that label next to it:

| Label | Source | Trust |
| --- | --- | --- |
| Payment records | orders the payment provider confirmed | authoritative for money |
| Store records | accounts, entitlements, the download log | exact |
| Approximate · browser counts | the anonymous daily counters (`POST /api/events`) | ad blockers, bots and repeat views skew them |
| Estimate | calculated from the others (average order value, view → buy) | never a measurement; rates appear only from 50 views |

- Money is paid orders, before provider fees, per currency; refunds are counted apart. **Live** figures read only live-mode orders, so test orders can never show up as revenue; **Test** reads only test orders.
- Activity counters (page, project, product, release and news views; cart and checkout steps) store an event, an id and a day, nothing about the visitor. Event pages aren't counted because events have no page of their own.
- An admin browsing as a customer (impersonation) is never counted as a visitor, and their downloads are counted apart from customers'.
- No statistic names a customer: sections return counts and product titles only.
- Adding a metric: add it to a section's `metrics()` (or a new section file in `SECTIONS`), returning one of the shapes in `server/stats/metric.js`; the page draws it without changes. Put its SQL in the section's `queries` so the plan test checks it.
- Cost: every range query searches an index (`db/migrations/0004_admin_ops.sql`); only the all-time totals (accounts, accounts without purchases, people who own something) read a whole index, a covering one. `test/api/stats.suite.js` fails if a query starts scanning a growing table.

## Sales and promo codes (Promotions)

Two kinds, both set up in the Promotions tab and applied by the store itself (`server/promotions/`, `server/cart/pricing.js`):

- **Sale:** prices drop on their own while it runs. Cards, product pages and the cart show the catalog price struck through, the sale price and the sale's name. If two sales cover one product, the lower price wins.
- **Promo code:** the buyer types it in the cart; it takes money off the order. Codes are case-insensitive, unique and never reused. Limits: total uses, and once per customer (by email, accounts and guests alike). A code applies on top of sale prices.

Each one is a percentage (1–90%) or an amount, on everything, chosen products, or one project's products, from a start (now or later) to an optional end. Floors: a sale never takes a paid product below $0.50, and a code never takes an order below $0.50 (Stripe's minimum). Giving something away for free is an entitlement grant (Entitlements tab), not a promotion.

- **Can't be gamed from the browser:** the browser only sends the code; the store prices everything. Trying codes is rate limited, and a code that hasn't started answers like one that doesn't exist.
- **Usage limits:** a use is a paid (or refunded) order, or another signed-in buyer's open payment page. They're checked when the cart is priced and again by the database as the order is written, so two signed-in buyers reaching for the last use at once can't both get it. Unpaid guest checkouts never hold a use and once-per-customer counts paid orders only, so nobody can lock a code up, or spend someone else's, with throwaway checkouts. The cost: two guests paying at the very same moment could take a limited code one use over. Once per customer matches the exact email, so `name+tag@` addresses count as different people.
- **Charged exactly:** Stripe is sent each line at the price charged, with a code's share folded into the line, so the payment equals the order total to the cent (anything else is refused, as before).
- **Recorded:** each order keeps the catalog price and sale per line, and the code and discount; the receipt shows the discount. The tab lists every promotion with its status (scheduled, running, ended), paid orders and how much it took off; the Overview has a "Sales & promo codes" section. Creating and ending one are in the audit log.
- **Not edited, ended:** "end now" (or "cancel" before it starts) stops it at once; orders already placed keep what they got. To change terms, end it and create another, so every order points at the terms it actually got.
- **Static pages:** the price written into the static product pages and search results stays the catalog price; the live price on the page (and what checkout charges) is the sale price.

## Customer preview

Customers → **preview**. Read-only: their account, what their library shows (the same entitlement lookup Your Stacc uses), orders, entitlements, recent downloads, follows and past impersonations. Opening it is recorded in the audit log. It changes nothing and doesn't sign you in as them.

## Impersonate customer (support)

From a customer's preview. Opens the store as that customer so you can reproduce what they see ("why can't they see their product?").

- **Server-side, every request:** the browser holds only a random token (httpOnly cookie, its hash stored in `impersonations`). It counts only while the row is open, under 2 hours old, used in the last 30 minutes, and presented with the same admin account *and the same sign-in session* that started it. The admin must still be an admin, and the customer must exist and not be one. Anything else ends it.
- **They stay a customer:** every route sees the customer, with role forced to customer; admin routes answer 404; the admin's own guest orders are hidden.
- **Read-mostly:** reading anything they can read is allowed. Writes are refused unless a route opts in (`{ impersonation: "allow" }`): pricing the cart, asking a download link (to check access), reconciling an order, the anonymous activity counter (which then doesn't count). Checkout and the mock payment page opt in as `"test-payments"`, refused whenever the store is live. Changing their account, refunding an order, claiming free items, following, voting, guest keys and every Better Auth endpoint (password, profile, sign-out) are refused.
- **Idle means idle:** the banner's own once-a-minute check doesn't count as activity, so an open but unused tab still times out after 30 minutes.
- **Never silent:** a hazard-striped banner on every page names the customer and you, with time left and **Exit impersonation**. If it ends anywhere else (time limit, idle, signed out, cookie copied), every request fails with `impersonation_ended` and the banner turns into an "ended" warning until you exit; the browser never quietly falls back to your own session.
- **Attributed:** each allowed write is logged before it runs as "admin → as customer → `METHOD /route`" (route patterns, never tokens), plus start, end and why it ended. Orders and downloads made inside carry `impersonation_id`, so they are never mistaken for the customer's own.

Code: `server/impersonation/` (`sessions.js` rules, `policy.js` gate, `routes.js` start/exit), `js/impersonation.js` + `css/impersonation.css` (banner, loaded by `js/account-nav.js` only while impersonating).

## Test purchases

Only in a **TEST** store (mock payments, or Stripe with a test key: local `npm run dev` or a preview deployment). A live store refuses them, and the store's config already refuses test keys in production, so a test can't become revenue.

1. Customers → preview a customer → choose a product → **Start test purchase**. This opens an impersonation (purpose "test-purchase") and takes you to the product's own page.
2. Buy it the normal way: cart, checkout, the payment page (Stripe test card `4242 4242 4242 4242`).
3. Open Your Stacc, download a file, then **Exit impersonation**.
4. **Test purchases** tab → **verify**: test order, paid, entitlement created, in their library, download authorized (same checks the store uses), downloaded during the test, receipt email.

A test purchase is a real purchase in that test store: the customer's order history and library show it (that is what you are checking), with "placed by an admin" in their preview, and the receipt goes to their address through the store's email setup. Use a test customer account if that matters. Live statistics never include it (test orders are livemode 0).

It is the production checkout, not a copy: the order is created by `POST /api/checkout` and fulfilled by the payment pipeline. The only differences are that the order is stamped with the impersonation, and that it never reuses (or is reused as) the customer's own pending order.

## Audit log

`admin_audit`, append-only (database triggers refuse updates and deletes), read in the Audit log tab (`GET /api/admin/audit`, admin only). Recorded:

- admin signed in; impersonation started, ended (with reason) and every write inside it; test purchase started; customer previewed
- product sales paused or resumed, product changed in the Control Center (price, published, removed), file added, replaced (new version), published, held back, rejected or deactivated, preview uploaded; receipt resent; entitlement granted or revoked; promotion created or ended; creator updated; payout paid or declined
- by the database itself, as "catalog sync": product created, price changed, published, unpublished, removed; project created, published, unpublished

Not recorded here: news and events, which are edited in `data/` and published by deploy. Their history is git's. No passwords, tokens, keys, card data or customer emails are stored in entries; customers are identified by account id and shown by email only when an admin reads the log.

## Creators

Every creator (first-party and Studio) with its address, live and draft projects, storage used, quota and platform fee ([creators](creators.md)). **Trust** lets search engines index a creator's pages (new creators are noindex) and publishes their file uploads without review, **Suspend** takes its pages and images offline at once and stops it publishing, and a quota (MB) or fee (basis points, 100 = 1%) set here overrides the platform default; empty means the default. Every change is audited (`creator.updated`). The Overview's **Creators** statistics show sites, image storage, and paid sales split into platform fees and creators' shares.

## Payouts

Creators' payout requests (`GET`/`PATCH /api/admin/payouts`, `server/admin/payouts.js`), each with the amount and how the creator wants to be paid. A request from a creator with a connected Stripe account shows **Send via Stripe**: one Connect transfer from the marketplace account, keyed by the request so a retry never pays twice; if Stripe refuses, nothing is marked paid and its reason is shown. Without one, pay by hand and press **Mark paid**. **Decline** closes it (the API takes an optional note). Settling happens once and is audited (`payout.paid`, `payout.declined`). Setup: [payouts-setup](payouts-setup.md).

## Packs (Pack Builder)

Pick a Pac, choose one of the products that sell it and upload the Pac's contents as one ZIP (`js/admin-packs.js`, `js/admin-packs-upload.js`). The upload goes in 64 MiB parts and resumes where it stopped if the same file is chosen again. The processing engine then checks every file: what it kept, what it refused and why, and its suggested kinds, instruments, tempos and keys (with how sure it is) appear in the tab. Before publishing, review it: files that need a decision come first, every value shows where it comes from (yours, a folder's default, a suggestion you accepted, or one the engine is sure of), unsure suggestions have ✓ and ✕, and the tools above the table set a value on the selected files or as a default for a folder (everything below it inherits it), send files back to inheriting, or move them (the tab says first which inherited values would change; your own values move with the file). **Publish** replaces the Pac's files in every product that sells it (unchanged files keep their id; replaced ones stay with earlier buyers for 30 days); **Discard** drops the version. Publishing and discarding are in the audit log. How it works: [packs](packs.md). Feature switch `packs.builder`.

## Paid files: hold back, then publish

An upload can be held back ("Hold back until I publish it"): it is stored but reaches no customer until you press **publish** on it in Products. Creators' own uploads arrive the same way, held back, unless the creator is trusted; publishing one is the approval. To refuse one, press **reject** (with an optional reason): owners lose it and it can't be published again. Only published, active files are delivered, and a creator's product with no deliverable file left is taken off sale. `PATCH /api/admin/files/:id` sets a file published, pending or rejected; `DELETE` deactivates it. Uploads are limited to known file types (audio, MIDI, presets, project files, zip, images, video, documents; `server/files/policy.js`), 95 MB each and 100 per product.


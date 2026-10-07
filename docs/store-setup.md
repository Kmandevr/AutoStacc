---
title: Store setup
summary: The owner's checklist to switch the store on: Cloudflare token permissions, secrets, Stripe and Brevo setup, first admin, uploading files, going live.
updated: 2026-10-07
---

# Store setup (owner)

The code is complete and tested locally. Until the steps below are done, the live site deploys exactly as before (static) and the store pages say the store is offline. Nothing here goes in the repository: keys go into GitHub secrets, and the deploy copies them into Cloudflare. How it works: [store](store.md).

## 1. Cloudflare API token

The existing `CLOUDFLARE_API_TOKEN` secret can only edit Pages. Edit the token (Cloudflare → My Profile → API Tokens) to also allow, on your account:

- **D1: Edit** (the deploy creates the `autostacc` database and applies migrations)
- **Workers R2 Storage: Edit** (the deploy creates the `autostacc-files` and `autostacc-previews` buckets)
- **Cloudflare Pages: Edit** (already there)

R2 must be enabled once in the dashboard (Cloudflare → R2 → Purchase/enable; the free tier covers a small store).

## 2. Secrets (GitHub → Settings → Secrets and variables → Actions → Secrets)

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Signs sessions | Make one: `openssl rand -hex 32` |
| `DOWNLOAD_SIGNING_SECRET` | Signs download links (must differ from the one above) | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Live secret key (`sk_live_...`; a restricted key `rk_live_...` with Checkout Sessions write is better) | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` of the webhook endpoint in step 3 | Stripe → Developers → Webhooks → the endpoint → Signing secret |
| `BREVO_API_KEY` | Transactional email key | Brevo → SMTP & API → API keys |
| `ADMIN_EMAILS` | Your email(s), comma-separated: those accounts become admins once verified | You |

Then **Variables** tab: add `STORE_ENABLED` = `true`. The next deploy (push to `main`, or Actions → Deploy → Run workflow) provisions D1 and R2, applies migrations, syncs the catalog, sets the secrets in Cloudflare and checks `https://autostacc.com/api/account` answers. If a secret is missing, the deploy warns and the store stays "offline"; the site is unaffected.

Production refuses test keys: `sk_test_` keys only work in development and previews (`server/lib/config.js`).

## 3. Stripe

1. Activate the Stripe account (business details, payouts). Set the statement descriptor and branding (Settings → Branding) so Checkout looks like Glitches & Stitches.
2. Developers → Webhooks → Add endpoint: `https://autostacc.com/api/webhooks/stripe`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Payment methods: cards work out of the box; delayed methods (bank debits) are supported through the async events above.
4. Refunds are done in the Stripe dashboard; the webhook revokes access automatically.

## 4. Brevo

1. Senders, domains & dedicated IPs → Domains: add `autostacc.com` and add the DNS records Brevo shows (in Cloudflare DNS) so mail is authenticated (SPF/DKIM/DMARC).
2. Add the sender `store@autostacc.com` (or change `EMAIL_FROM` in `wrangler.toml` to the address you want; it must be a verified sender).
3. Create the API key (step 2 table).

## 5. First admin and products

1. Create an account at `https://autostacc.com/login#signup` with an email listed in `ADMIN_EMAILS`, confirm it, then open `/admin`.
2. For each real product: set the real title, price, description and type in `data/products.js` and remove `draft: true` (the `add-product` skill does this), push, let it deploy. Then in `/admin` upload its paid file(s) and, if wanted, a preview clip (and set `preview: { file: "..." }` on the product).
3. Buy one yourself with a real card and refund it from Stripe: you should get the receipt, see it in your library, download it, then lose access after the refund.

## Previews and test mode

Local development needs none of this (mock payments, emails in the database): see [development](development.md). For a Stripe test-mode run before going live, use test keys locally with `PAYMENT_PROVIDER=stripe` in `.dev.vars` and the Stripe CLI (`stripe listen --forward-to localhost:8788/api/webhooks/stripe`).

## What is still needed from you (issue #44)

- The Cloudflare token permissions and R2 enabled (step 1).
- Stripe account activation, live keys and the webhook endpoint (step 3).
- Brevo account, domain authentication and API key (step 4).
- Real products, prices and files (issue #5) — every product is still a placeholder (`draft: true`), so nothing can be bought on the live site yet even when the store is on.

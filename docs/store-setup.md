---
title: Store setup
summary: The owner's checklist to switch the store on: Cloudflare token permissions, secrets, Stripe and Brevo setup, first admin, uploading files, going live.
covers: [.github/workflows/deploy.yml, scripts/cloudflare.js, scripts/deploy-check.js, server/lib/config.js, wrangler.toml, server/payments/stripe.js, server/payments/tax-codes.js, server/email/providers.js]
updated: 2026-10-21
---

# Store setup (owner)

The code is complete and tested locally. Until the steps below are done, the live site deploys exactly as before (static) and the store pages say the store is offline. Nothing here goes in the repository: keys go into GitHub secrets, and the deploy copies them into Cloudflare. How it works: [store](store.md).

## 1. Cloudflare API token

The existing `CLOUDFLARE_API_TOKEN` secret can only edit Pages. Edit the token (Cloudflare → My Profile → API Tokens) to also allow, on your account:

- **D1: Edit** (the deploy creates the `autostacc` database and applies migrations)
- **Workers R2 Storage: Edit** (the deploy creates the `autostacc-files` and `autostacc-previews` buckets)
- **Cloudflare Pages: Edit** (already there)
- **Queues: Edit**, **Workers Scripts: Edit**, **Containers: Edit**, **Account Settings: Read** (the processing engine's deploy, [engine](engine.md); the site's production config binds the engine's queue `autostacc-engine-jobs` as `JOBS`, so the engine deploy, which creates the queue, must have run once before the site's)

R2 must be enabled once in the dashboard (Cloudflare → R2 → Purchase/enable; the free tier covers a small store).

## 2. Secrets (GitHub → Settings → Secrets and variables → Actions → Secrets)

Before the repository goes public (and from then on), keep these in the `production` Environment rather than as repository secrets (GitHub → Settings → Environments → production → Environment secrets, with "Deployment branches" limited to `main`): the deploy jobs use that Environment, and no other job or branch can read them. The deploy never prints them; a failed email shows its reason with any address blanked.

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Signs sessions | Make one: `openssl rand -hex 32` |
| `DOWNLOAD_SIGNING_SECRET` | Signs download links (must differ from the one above) | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Live secret key (`sk_live_...`; a restricted key `rk_live_...` with write access to Checkout Sessions and Refunds is better: customers' own refunds go through it, and closing an open payment page is a Checkout Sessions write) | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` of the webhook endpoint in step 3 | Stripe → Developers → Webhooks → the endpoint → Signing secret |
| `BREVO_API_KEY` | API key `xkeysib-...` (not the SMTP key `xsmtpsib-...`; the deploy refuses that) | Brevo → SMTP & API → API keys |
| `ADMIN_EMAILS` | Your email(s), comma-separated: those accounts become admins once verified (optional to the deploy, but without it nobody can open `/admin`) | You |
| `FIRST_PARTY_OWNERS` | Who owns each first-party creator in the Studio: `<creator>=<email>` pairs, comma-separated, e.g. `autostacc=<your email>` (owner, 2026-10-21, #172). That account becomes the creator's owner the first time it opens `/studio` once its email is verified (audited). It is a secret so the address stays out of the public repository. Optional to the deploy, but without it nobody can manage `autostacc`'s products, releases and events. A creator named twice is refused | You |

Optional, for AutoStacc news in Brevo: `BREVO_NEWS_LIST` = the id of a Brevo list for it. Accounts that switch on AutoStacc news are kept in it. You can also send news straight from the Control Center's News tab without it.

Optional, for a project's newsletter sign-up: `BREVO_NEWSLETTER_LISTS` = `glitches-and-stitches:<list id>` (Brevo → Contacts → Lists → create a list; its id is the number in the list). Sign-ups are confirmed by email first; write and send the newsletter itself in Brevo (Campaigns), which adds the unsubscribe link.

Optional, for creators' sales and payouts on a second Stripe account: `STRIPE_MARKETPLACE_KEY`, `STRIPE_MARKETPLACE_WEBHOOK_SECRET`, `PLATFORM_COUNTRY` ([payouts-setup](payouts-setup.md)). `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are already there for the static deploy.

Optional: `SWEEP_TOKEN` (any random string of 32+ characters, for example from `openssl rand -hex 32`) turns on the daily clean-up of Pack Builder storage (retired files after 30 days, unused originals, abandoned drafts); both deploys copy it where it's needed.

Then **Variables** tab: add `STORE_ENABLED` = `true`. The next deploy (push to `main`, or Actions → Deploy → Run workflow) first checks that the committed pages match `data/` and runs the SEO and unit tests (a failure stops it before anything is published), then provisions D1 and R2, applies migrations, syncs the catalog, sets the secrets in Cloudflare, checks them against the store's production rules, and after publishing checks that `https://autostacc.com/api/account` and `/api/products` answer and the webhook address exists (`scripts/deploy-check.js`). If a secret is missing, the deploy warns and the store stays "offline"; a secret that breaks a rule is printed (by name, never its value) as an error. The site is unaffected either way. Deleting a GitHub secret doesn't remove the copy already in Cloudflare.

Production refuses test keys: `sk_test_` keys only work in development and previews (`server/lib/config.js`).

## 3. Stripe

1. Activate the Stripe account (business details, payouts). Set the statement descriptor and branding (Settings → Branding) so Checkout and bank statements show AutoStacc (the store sells for every project; owner, 2026-10-09).
2. Developers → Webhooks → Add endpoint: `https://autostacc.com/api/webhooks/stripe`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` (a lost dispute is recorded against its order; what it does to balances is still the owner's call, #129).
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Payment methods: cards work out of the box; delayed methods (bank debits) are supported through the async events above. The code expects this account to sell through Stripe's Managed Payments: each Checkout line carries a digital-goods tax code per product type (`server/payments/tax-codes.js`, to confirm with your tax adviser; site templates use the general code, and so does paid creator storage, `STORAGE_TAX_CODE`, until confirmed: #142), and the store checks the total before tax. Paid storage statements are paid on this account and confirmed by the same webhook (`checkout.session.*`, `charge.refunded`, `charge.dispute.*`); no new event is needed.
4. Customers can refund an order themselves within 14 days if they haven't downloaded anything from it (Settings › Orders, or the order's checkout result page for a guest holding its key); other refunds are done in the Stripe dashboard. Either way the webhook revokes access automatically. A chargeback suspends access until it's resolved. If the store ever refuses a paid event (it should not), every `ADMIN_EMAILS` address gets a "Store alert" mail and `/admin` shows it at the top.

## 4. Brevo

1. Senders, domains & dedicated IPs → Domains: add `autostacc.com` and add the DNS records Brevo shows (in Cloudflare DNS) so mail is authenticated (SPF/DKIM/DMARC).
2. Senders → add both senders (they must be verified, or be on the authenticated domain): `store@autostacc.com` sends purchase mail (receipts, "your purchases joined your account"; `EMAIL_FROM` in `wrangler.toml`), `noreply@autostacc.com` sends automated mail (confirm email, password reset, account exists, store alerts; `EMAIL_FROM_NOREPLY`).
3. Create the API key (step 2 table).
4. Security → Authorised IPs: deactivate the IP blocking. The store sends from Cloudflare's servers, whose addresses change, so with blocking on Brevo refuses every mail (401 "unrecognised IP address").

If mail doesn't arrive: each deploy warns how many sends failed in the last 7 days and of which kinds (the "Store resources" step; the log is public, so it never shows reasons or addresses), and `/admin` shows them per order. For Brevo's reasons, run `npx wrangler d1 execute DB --remote --env production --command "SELECT kind, error, created_at FROM email_events WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5"` on your own computer. 401 = wrong key type or IP blocking, 400 = sender or domain not verified.

## 5. First admin and products

1. Create an account at `https://autostacc.com/login#signup` with an email listed in `ADMIN_EMAILS`, confirm it, then open `/admin`.
2. Sign in with the account `FIRST_PARTY_OWNERS` names and open `/studio`: you are now `autostacc`'s owner. For each real product, create it in Glitches & Stitches' product list and the Product Studio (title, price, description, type, files or a whole pack, preview clip), then publish it (the `add-product` skill walks through it). Its page appears at `/shop/<id>`. Releases and events go in the project's Music and Events editors ([creators](creators.md#music-and-events)).
3. Once, after the first deploy with it: in `/admin`, run the release artwork move (`POST /api/admin/content/artwork/move`), which copies HAIL's cover from `img/releases/` into storage ([admin](admin.md#release-artwork-move)).
4. Buy one yourself with a real card and refund it from Stripe: you should get the receipt, see it in your library, download it, then lose access after the refund.

## Switching on two-step sign-in

Built but off (owner, 2026-10-15). It adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Aegis and the like) after the password, for admin accounts only. When you have an app:

1. In `wrangler.toml`, under `[env.production.vars]`, add `FEATURES_ON = "auth.adminTwoFactor"` (if `FEATURES_ON` is already there, add the name after a comma), push to `main` and let it deploy. (Production's variables come from that file, not the Cloudflare dashboard.)
2. Sign in to your admin account, open **Settings › Security**, and under **Two-step sign-in** type your password. Add the key it shows to your app (type it, or on the phone tap the link), save the ten backup codes somewhere safe (they're shown once), then type the app's code to switch it on.
3. Log out and in again to check it asks for the code.

Lost the phone: sign in with a backup code, then switch it off and set it up again. Lost the codes too: remove `auth.adminTwoFactor` from `FEATURES_ON` in `wrangler.toml` and deploy: sign-in is password only again until it's switched back on. Nobody else is ever asked to use it.

## Previews and test mode

Local development needs none of this (mock payments, emails in the database): see [development](development.md). For a Stripe test-mode run before going live, use test keys locally with `PAYMENT_PROVIDER=stripe` in `.dev.vars` and the Stripe CLI (`stripe listen --forward-to localhost:8788/api/webhooks/stripe`).

## What is still needed from you (issue #44)

- The Cloudflare token permissions and R2 enabled (step 1).
- Stripe account activation, live keys and the webhook endpoint (step 3).
- Brevo account, domain authentication and API key (step 4).
- `FIRST_PARTY_OWNERS` set to your account (step 2), and the real products, prices and files made in the Studio (issue #5). The placeholders were deleted (#173), so nothing can be bought on the live site until you publish products, even when the store is on.

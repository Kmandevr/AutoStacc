---
title: Payouts setup
summary: How creators get paid (Stripe Connect on a second Stripe account), what the owner sets up in Stripe and GitHub to switch it on, and how the code behaves until then.
covers: [server/payments/connect.js, server/payments/accounts.js, server/payments/stripe.js, server/payments/routes.js, server/revenue/, server/studio/earnings.js, server/studio/payout-account.js, server/admin/payouts.js, server/checkout/routes.js, server/lib/config.js, server/creators/policy.js, db/migrations/0011_marketplace_payouts.sql, js/admin-payouts.js, js/studio-earnings.js, scripts/cloudflare.js]
updated: 2026-10-11
---

# Payouts setup

Creators' products are sold on a **second Stripe account** (the "marketplace" account), and creators are paid from it through **Stripe Connect**. AutoStacc's own products stay on the first account with Managed Payments, which Stripe doesn't allow for marketplaces ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)). Owner decisions behind this: [decisions](decisions.md).

## How it works

1. A creator owner opens the Studio, picks the country of their bank account and presses **Set up payouts**. Stripe's own page collects their ID, tax and bank details (none reach AutoStacc; we keep the Stripe account id and whether it is ready). Creators can be in the United States, the United Kingdom, Canada, Switzerland or the European Economic Area: those are the regions Stripe's self-serve payouts from a US platform reach ([cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)). Other countries need Stripe's separate Global Payouts product, which isn't built; the Studio doesn't offer them.
2. A buyer pays for a creator's product on the marketplace account (Stripe Tax on). A cart with both kinds is paid in two steps; each order records its account (`orders.payment_account`) and each account has its own webhook, believed only for its own orders.
3. Each sale line records its split: AutoStacc keeps **20%** (the platform default, `server/creators/policy.js`, or a per-creator fee set in the Control Center) and the creator's share is the rest, fixed when the order is written.
4. A sale is held 14 days (the refund window). After that the creator presses **Request a payout** (minimum $10, one open request at a time); with the marketplace account on, their payout account must be ready first. The admins get an email about it.
5. In the Control Center → **Payouts** the owner presses **Send via Stripe**: one Stripe transfer keyed by the request, so a retry never pays twice. If Stripe refuses (for example not enough balance) nothing is marked paid and the reason is shown. The creator is emailed when a request is paid or declined.
6. A sale refunded after it was paid out leaves a negative balance, taken from the creator's next sales before anything more is available.

Until the keys below are set, creator products can be listed and added to carts but not checked out (the cart says creator checkout isn't open yet; checkout answers 503 `creator_sales_closed`) and payouts stay manual (the creator types how they want to be paid, you pay and mark it paid).

## What the owner does

**Status (2026-10-11):** done. The marketplace account is "AutoStacc Payments", with its own key and webhook in GitHub. Recommended in Stripe: branding as the main account (`img/autostacc-mark.svg`, brand `#15171c`, accent `#0a716a`) and tax behaviour exclusive (the store checks the total before tax and splits revenue on it). Creator purchases still need **Allow creator purchases** in the Control Center.

1. **Create the second Stripe account** (a new Stripe account, in the same legal entity) and activate it. Turn on **Connect** (Settings → Connect), fill in the platform profile, and turn on **Stripe Tax** with your tax registrations (Settings → Tax). Check these with a tax adviser: you decide where you must register.
2. **API key:** Developers → API keys → create a restricted key (`rk_live_...`) with write access to Checkout Sessions, Refunds, Accounts, Account Links and Transfers, and read access to Charges and Payment Intents. Put it in GitHub (Settings → Secrets → Actions) as `STRIPE_MARKETPLACE_KEY`.
3. **Webhook:** Developers → Webhooks → Add endpoint `https://autostacc.com/api/webhooks/stripe-marketplace` with the same events as the main one ([store-setup](store-setup.md#3-stripe)): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Put its signing secret in GitHub as `STRIPE_MARKETPLACE_WEBHOOK_SECRET`.
4. Optional: `PLATFORM_COUNTRY` as a GitHub secret (two capital letters, default `US`; the platform must be in the US, UK, EEA, Canada or Switzerland for these payouts). `STRIPE_MARKETPLACE_TAX=off` switches Stripe Tax off, for testing only; the deploy doesn't copy it, so it is set in `.dev.vars` or by hand in Cloudflare.
5. Deploy (push to `main`, or Actions → Deploy → Run workflow). The store refuses to start ("store offline", with the reason in the deploy log) if the key is set without its webhook secret, if the key is the main account's, if production isn't given a live key, or if a live key is used outside production. A webhook secret without the key is ignored and the marketplace stays off.
6. **Test in Stripe test mode first** (the same setup with `sk_test_` keys on a preview or locally with `npm run dev`), then switch to live keys.

Keep the marketplace account's balance funded: transfers come out of it, and charges become available after Stripe's usual delay (the 14-day hold covers it).

## Not covered

Tax forms for creators (Stripe's connected-account onboarding handles identity; whether you must file forms for US creators is a question for your tax adviser), payouts to creators outside the regions above (Global Payouts), and a webhook for account changes (the Studio asks Stripe for the account's state whenever it opens the payout section).

**After adding the keys:** creator purchases open on the next deploy. If you paused them in the Control Center (Creators, Creator purchases), press **Allow creator purchases** too; both must be in place.

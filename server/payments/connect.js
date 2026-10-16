// Stripe Connect on the marketplace account: a creator's payout account (an Express account Stripe collects their ID,
// tax and bank details for, so none of it passes through AutoStacc) and the transfers that pay a payout request out
// to it. Money is charged on the marketplace account, held for the refund window (server/revenue/earnings.js), and sent
// on request. Every call that creates something carries an idempotency key, so a retry or a double click is the same one.
import { stripeClient } from "./stripe.js";
import { run, first } from "../lib/db.js";
import { fail } from "../lib/http.js";

const client = (app) => stripeClient(app.config, "marketplace");

function requireMarketplace(app) {
  if (!app.config.marketplaceEnabled) fail(503, "payouts_closed", "Payout accounts aren't open yet.");
}

// Where a creator's bank account can be. Stripe's self-serve payouts from a US platform cover the US, the UK, the European
// Economic Area, Canada and Switzerland (docs.stripe.com/connect/cross-border-payouts); anywhere else needs a different Stripe
// product (Global Payouts) and isn't built. js/studio-earnings.js shows the same list (a unit test keeps them equal).
export const PAYOUT_COUNTRIES = ["US", "CA", "GB", "CH", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

// Opens (or resumes) Stripe's onboarding for the creator and returns the page to send them to. The country can't change
// after the account exists, so it is asked for first; Stripe refuses countries it can't pay and says so.
export async function openPayoutAccount(app, creator, { country }) {
  requireMarketplace(app);
  const c = client(app);
  let accountId = creator.stripe_account_id;
  if (!accountId) {
    if (!/^[A-Z]{2}$/.test(country || "")) fail(400, "invalid_field", "Pick the country your bank account is in.", { field: "country" });
    if (!PAYOUT_COUNTRIES.includes(country)) fail(400, "unsupported_country", "AutoStacc can pay creators with bank accounts in the United States, the United Kingdom, Canada, Switzerland and the European Economic Area for now.", { field: "country" });
    try {
      const account = await c.accounts.create({
        type: "express",
        country,
        capabilities: { transfers: { requested: true } },
        metadata: { creator_id: creator.id }
      }, { idempotencyKey: `acct-${creator.id}` });
      accountId = account.id;
    } catch (e) {
      console.error("payout account failed", e && e.type, e && e.code, e && e.message);
      // 503, not 502 (Cloudflare replaces a Function's 502 with its own page); Stripe's own words stay in the log.
      fail(503, "payout_account_failed", "Stripe couldn't open a payout account just now. Try again in a minute, or contact support if it keeps happening.");
    }
    // Only the first writer wins; a second tab's account is simply never used.
    await run(app.db, "UPDATE creators SET stripe_account_id = ?, payout_country = ? WHERE id = ? AND stripe_account_id IS NULL", accountId, country, creator.id);
    const mine = await first(app.db, "SELECT stripe_account_id FROM creators WHERE id = ?", creator.id);
    accountId = mine.stripe_account_id;
  }
  const back = `${app.config.siteUrl}/studio`;
  const link = await c.accountLinks.create({ account: accountId, refresh_url: back, return_url: back, type: "account_onboarding" });
  return { url: link.url };
}

// Asks Stripe where onboarding stands and remembers whether payouts can be sent.
export async function syncPayoutAccount(app, creator) {
  if (!creator.stripe_account_id) return { connected: false, payoutsEnabled: false, detailsSubmitted: false, country: null, due: 0 };
  requireMarketplace(app);
  const account = await client(app).accounts.retrieve(creator.stripe_account_id);
  const enabled = Boolean(account.payouts_enabled && account.capabilities && account.capabilities.transfers === "active");
  await run(app.db, "UPDATE creators SET payouts_enabled = ? WHERE id = ?", enabled ? 1 : 0, creator.id);
  return { connected: true, payoutsEnabled: enabled, detailsSubmitted: Boolean(account.details_submitted), country: account.country || creator.payout_country || null,
    due: account.requirements && account.requirements.currently_due ? account.requirements.currently_due.length : 0 };
}

// Sends one payout request's money to the creator's account. The key is the request id: sending it twice is one transfer.
export async function sendPayout(app, payout) {
  requireMarketplace(app);
  return client(app).transfers.create({
    amount: payout.amount_cents,
    currency: String(payout.currency || "USD").toLowerCase(),
    destination: payout.stripe_account_id,
    transfer_group: payout.id,
    metadata: { payout_id: payout.id, creator_id: payout.creator_id }
  }, { idempotencyKey: `payout-${payout.id}` });
}

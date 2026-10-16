// Studio API, money: a creator's owner sees what they've earned (sales, AutoStacc's fee, their share, what's on hold and
// what can be paid out) and asks for a payout. Editors can't: it's the owner's money. No buyer is ever identified here.
import { json, readJson, str, fail } from "../lib/http.js";
import { isOpen } from "../settings/settings.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireCreator } from "../creators/creators.js";
import { paymentProvider } from "../payments/index.js";
import { syncPayoutAccount } from "../payments/connect.js";
import { earningsOf } from "../revenue/earnings.js";
import { requestPayout, payoutsOf, publicPayout } from "../revenue/payouts.js";
import { alertAdmins } from "../email/alerts.js";

const owner = async (app, creatorId) => {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, ["owner"]);
  return { user, creator, livemode: paymentProvider(app).livemode(app.config) };
};

async function earnings(app, { creatorId }) {
  const { creator, livemode } = await owner(app, creatorId);
  const [e, payouts] = await Promise.all([earningsOf(app.db, creator, { livemode }), payoutsOf(app.db, creator.id)]);
  return json({ earnings: e, payouts: payouts.map((p) => publicPayout(p)) }, 200, { "Cache-Control": "no-store" });
}

const alertPayout = (app, creator, r) => alertAdmins(app, { key: `payout:${r.id}`, title: "a creator asked for a payout",
  lines: [`${creator.name} (/${creator.slug}) asked for a payout of $${(r.amountCents / 100).toFixed(2)}.`, "Pay or decline it in the Control Center, Payouts."] });

async function ask(app, { creatorId }) {
  const { user, creator, livemode } = await owner(app, creatorId);
  await limit(app, "studio-payout", 10, 3600);
  // Settings › Switches: payout requests can be paused; earnings stay visible and earlier requests are untouched.
  if (!(await isOpen(app.db, "payout_requests"))) fail(503, "payouts_paused", "Payout requests are paused for now. Your earnings are safe; try again later.");
  const body = await readJson(app.request, 2048);
  // With the marketplace account set up, money goes to the creator's connected Stripe account, which must be ready; without
  // it, they say how they want to be paid and AutoStacc pays by hand.
  if (app.config.marketplaceEnabled) {
    const acct = await syncPayoutAccount(app, creator);
    if (!acct.payoutsEnabled) fail(409, "payouts_not_ready", "Finish setting up your payout account first (Payout account, above), then ask again.");
    const r = await requestPayout(app.db, { creator, user, details: `Stripe account ${creator.stripe_account_id}`, livemode, stripeAccountId: creator.stripe_account_id });
    await alertPayout(app, creator, r);
    return json({ payout: r }, 201);
  }
  const details = str(body.details, "details", { min: 5, max: 200 }).trim();
  const r = await requestPayout(app.db, { creator, user, details, livemode });
  await alertPayout(app, creator, r);
  return json({ payout: r }, 201);
}

export const routes = [
  ["GET", "/api/studio/creators/:creatorId/earnings", earnings],
  ["POST", "/api/studio/creators/:creatorId/payouts", ask]
];

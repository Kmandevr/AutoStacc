// Studio API, payout account: a creator's owner connects the Stripe account they are paid into (Stripe collects their
// details; none reach AutoStacc) and sees whether it is ready. Editors can't: it's the owner's money.
import { json, readJson } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireCreator } from "../creators/creators.js";
import { openPayoutAccount, syncPayoutAccount } from "../payments/connect.js";

const owner = async (app, creatorId) => {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, ["owner"]);
  return creator;
};

async function status(app, { creatorId }) {
  const creator = await owner(app, creatorId);
  if (!app.config.marketplaceEnabled) return json({ open: false }, 200, { "Cache-Control": "no-store" });
  await limit(app, "payout-account-status", 60, 3600);
  return json({ open: true, platformCountry: app.config.platformCountry, ...(await syncPayoutAccount(app, creator)) }, 200, { "Cache-Control": "no-store" });
}

async function connect(app, { creatorId }) {
  const creator = await owner(app, creatorId);
  await limit(app, "payout-account", 10, 3600);
  const body = await readJson(app.request, 1024);
  return json(await openPayoutAccount(app, creator, { country: typeof body.country === "string" ? body.country.toUpperCase() : "" }), 201);
}

export const routes = [
  ["GET", "/api/studio/creators/:creatorId/payout-account", status],
  ["POST", "/api/studio/creators/:creatorId/payout-account", connect, { copyright: "allow" }]
];

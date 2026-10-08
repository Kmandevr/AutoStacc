// Studio API, money: a creator's owner sees what they've earned (sales, AutoStacc's fee, their share, what's on hold and
// what can be paid out) and asks for a payout. Editors can't: it's the owner's money. No buyer is ever identified here.
import { json, readJson, str } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireCreator } from "../creators/creators.js";
import { paymentProvider } from "../payments/index.js";
import { earningsOf } from "../revenue/earnings.js";
import { requestPayout, payoutsOf, publicPayout } from "../revenue/payouts.js";

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

async function ask(app, { creatorId }) {
  const { user, creator, livemode } = await owner(app, creatorId);
  await limit(app, "studio-payout", 10, 3600);
  const body = await readJson(app.request, 2048);
  const details = str(body.details, "details", { min: 5, max: 200 }).trim();
  const r = await requestPayout(app.db, { creator, user, details, livemode });
  return json({ payout: r }, 201);
}

export const routes = [
  ["GET", "/api/studio/creators/:creatorId/earnings", earnings],
  ["POST", "/api/studio/creators/:creatorId/payouts", ask]
];

// API security and break tests: starts the local stores once (mock payments + Stripe mode with a fake Stripe API),
// then runs every suite against them. Usage: npm run test:api  (needs `npm install`; takes about a minute and a half).
import { before, after } from "node:test";
import { startStores } from "../support/servers.js";
import auth from "./auth.suite.js";
import commerce from "./commerce.suite.js";
import webhooks from "./webhooks.suite.js";
import downloads from "./downloads.suite.js";
import guests from "./guests.suite.js";
import hygiene from "./hygiene.suite.js";
import admin from "./admin.suite.js";
import platform from "./platform.suite.js";
import pages from "./pages.suite.js";
import impersonation from "./impersonation.suite.js";
import stats from "./stats.suite.js";
import promotions from "./promotions.suite.js";
import creators from "./creators.suite.js";
import account from "./account.suite.js";
import selling from "./selling.suite.js";
import refunds from "./refunds.suite.js";

const ctx = {};
before(async () => Object.assign(ctx, await startStores()), { timeout: 240000 });
after(() => ctx.stop && ctx.stop());

for (const suite of [auth, commerce, webhooks, downloads, guests, hygiene, admin, platform, pages, impersonation, stats, promotions, creators, account, selling, refunds]) suite(ctx);

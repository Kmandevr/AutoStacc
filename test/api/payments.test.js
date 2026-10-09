// API security and break tests, payments group: prices and checkout, Stripe webhooks, impersonation and test purchases,
// promotions, creators selling, refunds and payouts, against its own mock-payments store and a Stripe-mode store with
// the fake Stripe API. Runs beside accounts.test.js (npm run test:api).
import { runGroup } from "./group.js";
import commerce from "./commerce.suite.js";
import webhooks from "./webhooks.suite.js";
import impersonation from "./impersonation.suite.js";
import promotions from "./promotions.suite.js";
import selling from "./selling.suite.js";
import refunds from "./refunds.suite.js";
import payouts from "./payouts.suite.js";

runGroup({ name: "payments", ports: { mock: 8804, stripe: 8802, fakeStripe: 8812 } },
  [commerce, webhooks, impersonation, promotions, selling, refunds, payouts]);

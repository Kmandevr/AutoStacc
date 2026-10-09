// Payment-provider webhooks and the dev-only mock payment buttons. Both end in processPaymentEvent.
import { json, fail, readJson, str } from "../lib/http.js";
import { stripeProvider, marketplaceProvider } from "./stripe.js";
import { mockEvent } from "./mock.js";
import { processPaymentEvent } from "./events.js";
import { getOrder } from "../orders/orders.js";

// Stripe calls this. Anything unsigned, mis-signed or older than 5 minutes is refused before it touches the database.
const webhook = (provider, configured) => async (app) => {
  if (!configured(app.config)) fail(404, "not_found", "Nothing here.");
  let ev;
  try {
    ev = await provider.verifyWebhook(app, app.request);
  } catch {
    fail(400, "bad_signature", "Webhook signature check failed.");
  }
  const result = await processPaymentEvent(app, ev);
  return json({ received: true, outcome: result.outcome });
};
const stripeWebhook = webhook(stripeProvider, (c) => c.stripeWebhookSecret);
// The marketplace account (creators' sales) has its own endpoint, signing secret and key.
const marketplaceWebhook = webhook(marketplaceProvider, (c) => c.marketplaceEnabled && c.marketplaceWebhookSecret);

// Development and tests only: simulate what Stripe would report for a mock checkout.
async function mockPayment(app) {
  if (!app.config.devLike || app.config.paymentProvider !== "mock") fail(404, "not_found", "Nothing here.");
  const body = await readJson(app.request);
  const outcome = str(body.outcome, "outcome", { pattern: /^(paid|failed|expired|refunded)$/ });
  const order = await getOrder(app.db, str(body.orderId, "orderId", { max: 40 }));
  if (!order || order.provider !== "mock" || order.provider_session_id !== body.sessionId) fail(404, "not_found", "No mock checkout like that.");
  const result = await processPaymentEvent(app, mockEvent(order, outcome));
  return json({ outcome: result.outcome });
}

export const routes = [
  ["POST", "/api/webhooks/stripe", stripeWebhook, { external: true }],
  ["POST", "/api/webhooks/stripe-marketplace", marketplaceWebhook, { external: true }],
  ["POST", "/api/dev/mock-payment", mockPayment, { impersonation: "test-payments" }]
];

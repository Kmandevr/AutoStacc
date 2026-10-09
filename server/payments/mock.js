// Mock provider for local development and tests (never runs in preview or production; server/lib/config.js refuses).
// Checkout sends the browser to the site's own /checkout page, where test buttons (POST /api/dev/mock-payment) feed
// fake events through the same pipeline Stripe events use. Mock orders are always livemode 0.
import { randomToken } from "../lib/db.js";

export const mockProvider = {
  name: "mock",
  livemode: () => false,

  async createCheckout(app, { order }) {
    const sessionId = `mock_cs_${randomToken(12)}`;
    return { sessionId, url: `${app.config.siteUrl}/checkout?order=${order.id}&mock=${sessionId}` };
  },

  // Nothing to send anywhere: the order is changed by the refund event the caller processes next.
  async refund() {
    return { id: "mock_re" };
  },

  async retrieveCheckout(app, sessionId) {
    // The mock has no remote state: whatever the test buttons did is already in the database.
    return { type: "pending", sessionId };
  }
};

// Builds the provider-neutral event for a test outcome.
export function mockEvent(order, outcome) {
  const base = { provider: "mock", id: `mock_evt_${randomToken(12)}`, rawType: `mock.${outcome}`, livemode: false, orderId: order.id };
  const session = { sessionId: order.provider_session_id, amount: order.total_cents, currency: order.currency };
  switch (outcome) {
    case "paid":
      return { ...base, ...session, type: "paid", paymentId: `mock_pi_${order.id}` };
    case "failed":
      return { ...base, ...session, type: "failed" };
    case "expired":
      return { ...base, ...session, type: "expired" };
    case "refunded":
      return { ...base, type: "refunded", paymentId: order.provider_payment_id, amount: order.total_cents, currency: order.currency };
    default:
      return null;
  }
}

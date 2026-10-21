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

  // A storage statement's test page is the Studio itself; POST /api/dev/mock-storage-payment plays the outcome.
  async createStorageCheckout(app, { statement, successUrl }) {
    const sessionId = `mock_cs_${randomToken(12)}`;
    return { sessionId, url: `${successUrl}&mock=${sessionId}&statement=${statement.id}` };
  },

  // Nothing to send anywhere: the order is changed by the refund event the caller processes next.
  async refund() {
    return { id: "mock_re" };
  },

  // The mock's payment page is the site's own: nothing remote to close.
  async expireCheckout() {},

  async retrieveCheckout(app, sessionId) {
    // The mock has no remote state: whatever the test buttons did is already in the database.
    return { type: "pending", sessionId };
  },

  // Saved cards for storage billing (server/billing/cards.js, charges.js). No remote state: the setup session id
  // carries its creator, and every setup saves the same test card; every charge succeeds.
  async ensureCustomer(app, { creatorId }) {
    return { customerId: `mock_cus_${creatorId}` };
  },
  async createCardSetup(app, { creatorId, successUrl }) {
    const sessionId = `mock_cs_setup_${randomToken(12)}.${creatorId}`;
    return { sessionId, url: `${successUrl}&mock=${sessionId}` };
  },
  async retrieveCardSetup(app, sessionId) {
    const creatorId = String(sessionId).split(".").slice(1).join(".") || null;
    return { status: "complete", creatorId, customerId: creatorId && `mock_cus_${creatorId}`, paymentMethodId: "mock_pm",
      brand: "visa", last4: "4242", livemode: false };
  },
  async detachCard() {},
  async chargeCard(app, { statement, attempt }) {
    return { paymentId: `mock_pi_charge_${statement.id}_${attempt}`, status: "succeeded", declineCode: null, livemode: false,
      amount: statement.amount_cents, currency: statement.currency };
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

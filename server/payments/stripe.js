// Stripe provider: hosted Checkout Sessions built from server-side prices, webhook verification with Stripe's own
// library (signature + timestamp tolerance), and session lookups for reconciliation. Normalizes Stripe events into the
// provider-neutral shape that server/payments/events.js processes.
import Stripe from "stripe";

const clients = new Map();
function client(config) {
  const key = config.stripeKey + "|" + config.stripeApiBase;
  if (!clients.has(key)) {
    const opts = { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 20000 };
    if (config.stripeApiBase) {
      // Local tests point the SDK at a fake Stripe server (development/test only; see server/lib/config.js).
      const u = new URL(config.stripeApiBase);
      Object.assign(opts, { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(":", "") });
    }
    clients.set(key, new Stripe(config.stripeKey, opts));
  }
  return clients.get(key);
}

const crypto = Stripe.createSubtleCryptoProvider();

// One Checkout line per order line, at the price the store charged (after any sale). A line carrying part of a promo
// code's discount becomes a single line at its exact discounted amount, so the session total always equals the
// order total to the cent (server/payments/events.js refuses a payment that doesn't).
function lineItem(order, i) {
  const currency = order.currency.toLowerCase();
  const product_data = { name: i.title, metadata: { product_id: i.productId } };
  if (!i.discountCents) return { quantity: i.quantity, price_data: { currency, unit_amount: i.unitPriceCents, product_data } };
  const name = `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ""} (${order.promo_code || "discount"})`;
  return { quantity: 1, price_data: { currency, unit_amount: i.unitPriceCents * i.quantity - i.discountCents, product_data: { ...product_data, name } } };
}

export const stripeProvider = {
  name: "stripe",
  livemode: (config) => config.stripeLive,

  async createCheckout(app, { order, items, successUrl, cancelUrl }) {
    const { config } = app;
    const session = await client(config).checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      customer_email: order.email,
      metadata: { order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id } },
      line_items: items.map((i) => lineItem(order, i)),
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + config.checkoutTtlMinutes * 60
    }, { idempotencyKey: `checkout-${order.id}` });
    return { sessionId: session.id, url: session.url };
  },

  async retrieveCheckout(app, sessionId) {
    const s = await client(app.config).checkout.sessions.retrieve(sessionId);
    return normalizeSession(s, s.payment_status === "paid" ? "paid" : s.status === "expired" ? "expired" : "pending");
  },

  // Throws on a bad signature or a stale timestamp (older than 5 minutes = replay).
  async verifyWebhook(app, request) {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new Error("missing signature");
    const body = await request.text();
    const event = await client(app.config).webhooks.constructEventAsync(body, signature, app.config.stripeWebhookSecret, 300, crypto);
    return normalizeEvent(event);
  }
};

function normalizeSession(s, type) {
  return {
    type,
    sessionId: s.id,
    orderId: (s.metadata && s.metadata.order_id) || s.client_reference_id || null,
    paymentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent && s.payment_intent.id,
    amount: s.amount_total,
    currency: String(s.currency || "").toUpperCase(),
    livemode: Boolean(s.livemode)
  };
}

export function normalizeEvent(event) {
  const o = event.data && event.data.object ? event.data.object : {};
  const base = { provider: "stripe", id: event.id, rawType: event.type, livemode: Boolean(event.livemode) };
  switch (event.type) {
    case "checkout.session.completed":
      // Card payments are paid here; delayed methods (bank debits) settle later with async_payment_succeeded.
      return { ...base, ...normalizeSession(o, o.payment_status === "paid" ? "paid" : "awaiting") };
    case "checkout.session.async_payment_succeeded":
      return { ...base, ...normalizeSession(o, "paid") };
    case "checkout.session.async_payment_failed":
      return { ...base, ...normalizeSession(o, "failed") };
    case "checkout.session.expired":
      return { ...base, ...normalizeSession(o, "expired") };
    case "charge.refunded":
      return {
        ...base,
        type: o.refunded ? "refunded" : "partial_refund",
        paymentId: typeof o.payment_intent === "string" ? o.payment_intent : null,
        amount: o.amount_refunded,
        currency: String(o.currency || "").toUpperCase()
      };
    case "charge.dispute.created":
      return { ...base, type: "disputed", paymentId: typeof o.payment_intent === "string" ? o.payment_intent : null };
    case "charge.dispute.closed":
      return { ...base, type: o.status === "won" ? "dispute_won" : "ignored", paymentId: typeof o.payment_intent === "string" ? o.payment_intent : null };
    default:
      return { ...base, type: "ignored" };
  }
}

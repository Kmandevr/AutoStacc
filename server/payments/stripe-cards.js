// Saved cards for creator storage billing on Stripe's main account: one Customer per creator space, a setup-mode
// Checkout to save a card (card details stay at Stripe), off-session monthly charges, and the webhook shapes those
// produce. server/payments/stripe.js spreads cardMethods into the main provider; server/billing/ drives them.

// Client and expiry helpers come from stripe.js (passed in, so the two files don't import each other).
export const cardMethods = (account, { stripeClient, expiresAtFor }) => ({
  // One Stripe Customer per creator space and mode. The key makes a retried request the same customer.
  async ensureCustomer(app, { creatorId, email, name, key }) {
    const live = Boolean(app.config.stripeLive);
    const customer = await stripeClient(app.config, account).customers.create({
      email: email || undefined,
      name: name || undefined,
      metadata: { storage_creator_id: creatorId }
    }, { idempotencyKey: key || `storage-customer-${creatorId}-${live ? "live" : "test"}` });
    return { customerId: customer.id };
  },

  // Stripe's hosted page to save a card for later monthly charges (no payment is taken here).
  async createCardSetup(app, { customerId, creatorId, key, successUrl, cancelUrl }) {
    const { config } = app;
    const session = await stripeClient(config, account).checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      payment_method_types: ["card"],
      customer: customerId,
      metadata: { storage_creator_id: creatorId },
      setup_intent_data: { metadata: { storage_creator_id: creatorId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: expiresAtFor(config)
    }, key ? { idempotencyKey: key } : undefined);
    return { sessionId: session.id, url: session.url };
  },

  // What a setup page ended as, looked up with our secret key: the saved card's brand and last 4 only.
  async retrieveCardSetup(app, sessionId) {
    const stripe = stripeClient(app.config, account);
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    const result = {
      status: s.status === "complete" ? "complete" : s.status === "expired" ? "expired" : "open",
      creatorId: (s.metadata && s.metadata.storage_creator_id) || null,
      customerId: idOf(s.customer),
      paymentMethodId: null, brand: null, last4: null,
      livemode: Boolean(s.livemode)
    };
    const setupIntentId = idOf(s.setup_intent);
    if (result.status !== "complete" || !setupIntentId) return result;
    const si = await stripe.setupIntents.retrieve(setupIntentId);
    const pmId = idOf(si.payment_method);
    if (!pmId) return result;
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const card = pm.card || {};
    return { ...result, paymentMethodId: pm.id, brand: card.brand ? String(card.brand).slice(0, 20) : null, last4: card.last4 ? String(card.last4).slice(-4) : null };
  },

  // Removes the card from the Customer at Stripe; it can't be charged again.
  async detachCard(app, paymentMethodId) {
    await stripeClient(app.config, account).paymentMethods.detach(paymentMethodId);
  },

  // One off-session charge of a statement's remainder. The key is per statement and attempt, so a retried request is
  // the same charge and a new attempt is a new one. Outcomes are recorded only through verified events (events.js).
  async chargeCard(app, { statement, customerId, paymentMethodId, attempt }) {
    try {
      const pi = await stripeClient(app.config, account).paymentIntents.create({
        amount: statement.amount_cents,
        currency: String(statement.currency).toLowerCase(),
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `AutoStacc storage, ${statement.period}`,
        metadata: { storage_statement_id: statement.id, storage_charge_attempt: String(attempt) }
      }, { idempotencyKey: `storage-charge-${statement.id}-${attempt}` });
      const status = pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action"
        : pi.status === "processing" ? "processing" : "declined";
      return { paymentId: pi.id, status, declineCode: null, livemode: Boolean(pi.livemode), amount: pi.amount_received ?? pi.amount, currency: String(pi.currency || "").toUpperCase() };
    } catch (e) {
      if (e && e.type === "StripeCardError") {
        // Only Stripe's ids and codes are kept, never card data.
        const pi = (e.raw && e.raw.payment_intent) || {};
        const requiresAction = e.code === "authentication_required" || pi.status === "requires_action";
        return { paymentId: pi.id || null, status: requiresAction ? "requires_action" : "declined",
          declineCode: String(e.decline_code || e.code || "card_declined").slice(0, 60), livemode: Boolean(pi.livemode) };
      }
      throw e;
    }
  }
});

const idOf = (v) => (typeof v === "string" ? v : v && v.id) || null;

// Stripe events for saved cards and off-session storage charges, or null for any other event. A payment_intent event
// counts only with our storage_charge_attempt marker: the pay page's own PaymentIntents arrive through Checkout events.
export function normalizeCardEvent(event, base) {
  const o = event.data && event.data.object ? event.data.object : {};
  const meta = o.metadata || {};
  switch (event.type) {
    case "checkout.session.completed":
      if (o.mode !== "setup") return null;
      return { ...base, type: "card_saved", sessionId: o.id, creatorId: meta.storage_creator_id || null,
        customerId: idOf(o.customer), setupIntentId: idOf(o.setup_intent) };
    case "checkout.session.expired":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      // An abandoned setup page changes nothing (no order or statement behind it).
      return o.mode === "setup" ? { ...base, type: "ignored" } : null;
    case "payment_intent.succeeded":
      if (!meta.storage_charge_attempt) return { ...base, type: "ignored" };
      return { ...base, type: "paid", statementId: meta.storage_statement_id || null, paymentId: o.id,
        amount: o.amount_received ?? o.amount, currency: String(o.currency || "").toUpperCase(), chargeAttempt: Number(meta.storage_charge_attempt) };
    case "payment_intent.payment_failed": {
      if (!meta.storage_charge_attempt) return { ...base, type: "ignored" };
      const err = o.last_payment_error || {};
      return { ...base, type: "charge_failed", statementId: meta.storage_statement_id || null, paymentId: o.id,
        chargeAttempt: Number(meta.storage_charge_attempt), declineCode: String(err.decline_code || err.code || "card_declined").slice(0, 60),
        requiresAction: err.code === "authentication_required" || o.status === "requires_action" };
    }
    default:
      return null;
  }
}

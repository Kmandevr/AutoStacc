// Refunds a customer can take themselves: a paid order that is still inside the refund window and has had nothing
// downloaded from it (docs: /refunds, data/legal.js). The money goes back through the payment provider; the order,
// the library and the creators' earnings then change through the same refund event a provider webhook would send
// (server/payments/events.js), so the two can arrive in either order and only the first changes anything.
// Anything else (downloaded, too old, free) is a conversation with support, not a button.
import { first } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { providerForOrder } from "../payments/index.js";
import { processPaymentEvent } from "../payments/events.js";

export const REFUND_DAYS = 14;

// { eligible, reason, until }: reason is "" when eligible, else one of paid-only, free, disputed, expired, downloaded.
// The browser shows a line per reason; it never decides eligibility itself.
export async function refundStatus(db, order, nowMs = Date.now()) {
  if (order.status !== "paid") return { eligible: false, reason: "paid-only", until: null };
  const until = new Date(Date.parse(order.paid_at) + REFUND_DAYS * 86400000).toISOString();
  if (!order.total_cents || !order.provider_payment_id) return { eligible: false, reason: "free", until };
  // A chargeback (open, or closed without a win) has its grants revoked as "disputed": the bank holds the money, so
  // Stripe would refuse a refund. Support handles it instead.
  const disputed = await first(db,
    `SELECT 1 AS n FROM entitlements WHERE source_type = 'purchase' AND source_id = ? AND status = 'revoked' AND revoke_reason = 'disputed' LIMIT 1`, order.id);
  if (disputed) return { eligible: false, reason: "disputed", until };
  if (Date.parse(until) < nowMs) return { eligible: false, reason: "expired", until };
  // Any link issued or file served from this order counts, whoever asked; an admin's impersonated downloads don't.
  const used = await first(db,
    `SELECT 1 AS n FROM download_events d JOIN entitlements e ON e.id = d.entitlement_id
     WHERE e.source_id = ? AND d.event IN ('issued', 'served') AND d.impersonation_id IS NULL LIMIT 1`, order.id);
  return used ? { eligible: false, reason: "downloaded", until } : { eligible: true, reason: "", until };
}

const MESSAGES = {
  "paid-only": "Only a paid order can be refunded.",
  free: "A free order has nothing to refund.",
  disputed: "This order is in a payment dispute with your bank, so it can't be refunded here. Contact support and we'll sort it out.",
  expired: `Refunds here are open for ${REFUND_DAYS} days after paying. Contact support if something is wrong with your purchase.`,
  downloaded: "You've downloaded files from this order, so it can't be refunded here. If something is wrong with them, contact support."
};

export async function refundOrder(app, order) {
  const state = await refundStatus(app.db, order);
  if (!state.eligible) fail(409, "not_refundable", MESSAGES[state.reason] || "This order can't be refunded here.", { reason: state.reason });
  try {
    // The provider call carries a per-order idempotency key (refund-<order id>), so a retry after a timeout is the same refund.
    await providerForOrder(app, order).refund(app, order);
  } catch (e) {
    console.error("refund failed", e && e.type, e && e.code, e && e.message);
    fail(503, "refund_unavailable", "We couldn't confirm the refund. If it went through, your order will show it shortly; trying again never refunds twice. If it keeps happening, contact support.");
  }
  await processPaymentEvent(app, { provider: order.provider, id: `selfrefund-${order.id}`, rawType: "customer.refund", livemode: Boolean(order.livemode),
    type: "refunded", paymentId: order.provider_payment_id, amount: order.total_cents, currency: order.currency });
}

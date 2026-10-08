// What a creator has earned, from the split already written on each order line (server/revenue/split.js): the creator's
// share, less any refund, counted only for real-money orders (a test store's never count). A sale is "on hold" for
// SELLING.holdDays (the refund and chargeback window); after that it is "cleared" and can be paid out. Payout requests
// (server/revenue/payouts.js) take from what has cleared. Pure arithmetic in shareAfterRefund and summarise, SQL in earningsOf.
// Nothing here reveals who bought: only the product, the date and the amounts.
import { all, first } from "../lib/db.js";
import { SELLING, feeBpsOf } from "../creators/policy.js";

// A line's share after refunds: a full refund (order status "refunded") leaves nothing, a partial one takes its
// proportion of the order off every line.
export function shareAfterRefund({ creatorShareCents, orderTotalCents, orderRefundedCents, orderStatus }) {
  if (orderStatus === "refunded") return 0;
  if (!(orderRefundedCents > 0) || !(orderTotalCents > 0)) return creatorShareCents;
  const ratio = Math.min(1, orderRefundedCents / orderTotalCents);
  return creatorShareCents - Math.round(creatorShareCents * ratio);
}

// Lines (as earningsOf reads them) → totals, per product and the latest sales. nowMs is injected so tests can age sales.
export function summarise(lines, { nowMs, holdDays = SELLING.holdDays, paidOutCents = 0, requestedCents = 0 }) {
  const holdUntil = (paidAt) => Date.parse(paidAt) + holdDays * 86400000;
  let net = 0, fee = 0, share = 0, onHold = 0;
  const byProduct = new Map();
  const sales = lines.map((l) => {
    const effective = shareAfterRefund(l);
    const refunded = l.orderStatus === "refunded" || l.orderRefundedCents > 0;
    const held = effective > 0 && holdUntil(l.paidAt) > nowMs;
    net += l.netCents; fee += l.platformFeeCents; share += effective;
    if (held) onHold += effective;
    const p = byProduct.get(l.productId) || { productId: l.productId, title: l.title || l.productId, sales: 0, shareCents: 0 };
    p.sales += 1; p.shareCents += effective; byProduct.set(l.productId, p);
    return { orderRef: l.orderId.slice(-6), productId: l.productId, title: l.title || l.productId, paidAt: l.paidAt, netCents: l.netCents, shareCents: effective,
      state: l.orderStatus === "refunded" ? "refunded" : l.orderRefundedCents > 0 ? "partly refunded" : held ? "on hold" : "cleared", refunded };
  });
  const cleared = share - onHold;
  return {
    salesCount: lines.length, netCents: net, platformFeeCents: fee, shareCents: share, onHoldCents: onHold, clearedCents: cleared,
    paidOutCents, requestedCents, availableCents: Math.max(0, cleared - paidOutCents - requestedCents),
    products: [...byProduct.values()].sort((a, b) => b.shareCents - a.shareCents), recent: sales.slice(0, 30)
  };
}

export async function earningsOf(db, creator, { livemode, nowMs = Date.now() }) {
  const lines = (await all(db,
    `SELECT oi.product_id, p.title, oi.net_cents, oi.platform_fee_cents, oi.creator_share_cents, o.id AS order_id, o.paid_at, o.total_cents, o.refunded_cents, o.status
     FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.creator_id = ? AND o.status IN ('paid', 'refunded') AND o.livemode = ? AND o.paid_at IS NOT NULL ORDER BY o.paid_at DESC`, creator.id, livemode ? 1 : 0))
    .map((r) => ({ productId: r.product_id, title: r.title, netCents: r.net_cents || 0, platformFeeCents: r.platform_fee_cents || 0, creatorShareCents: r.creator_share_cents || 0,
      orderId: r.order_id, paidAt: r.paid_at, orderTotalCents: r.total_cents, orderRefundedCents: r.refunded_cents || 0, orderStatus: r.status }));
  const payouts = await first(db, `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END), 0) AS paid,
    COALESCE(SUM(CASE WHEN status = 'requested' THEN amount_cents END), 0) AS requested FROM payout_requests WHERE creator_id = ?`, creator.id);
  return { ...summarise(lines, { nowMs, paidOutCents: payouts.paid, requestedCents: payouts.requested }),
    feeBps: feeBpsOf(creator), holdDays: SELLING.holdDays, minPayoutCents: SELLING.minPayoutCents, currency: "USD" };
}

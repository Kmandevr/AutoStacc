// The reads behind a product's Insights and Overview summary (docs/studio.md): its paid order lines (this store's own
// livemode only, a test store's orders never mix with live ones), free claims, delivered downloads and per-day page
// views, each bounded by product id and date range and bucketed by UTC day. Stores nothing. Money figures come from
// the split written on each order line (server/revenue/split.js); refunds take their proportion like earnings do.
import { all } from "../lib/db.js";
import { paymentProvider } from "../payments/index.js";
import { shareAfterRefund } from "../revenue/earnings.js";

const DAY = 86400000;
export const dayOf = (iso) => String(iso).slice(0, 10);
const zero = () => ({ orders: 0, units: 0, grossCents: 0, discountCents: 0, netCents: 0, platformFeeCents: 0, creatorShareCents: 0, refundsCents: 0, freeClaims: 0, downloads: 0, views: 0 });

// Reads [since, until) for one product (both UTC midnights, so page views' days line up): { lines, claims, downloads, views } (the last three as { day, n }).
export async function readRange(app, productId, since, until) {
  const db = app.db;
  const live = paymentProvider(app).livemode(app.config) ? 1 : 0;
  const [s, u] = [since.toISOString(), until.toISOString()];
  const [lines, claims, downloads, views] = await Promise.all([
    all(db, `SELECT i.quantity, i.unit_price_cents, i.list_price_cents, i.line_total_cents, i.discount_cents, i.net_cents, i.platform_fee_cents, i.creator_share_cents,
        i.sale_id, o.paid_at, o.status, o.total_cents, o.refunded_cents
      FROM order_items i CROSS JOIN orders o ON o.id = i.order_id
      WHERE i.product_id = ? AND o.status IN ('paid', 'refunded') AND o.livemode = ? AND o.paid_at >= ? AND o.paid_at < ?`, productId, live, s, u),
    all(db, `SELECT substr(granted_at, 1, 10) AS day, COUNT(*) AS n FROM entitlements
      WHERE status IN ('active', 'revoked') AND source_type = 'free' AND product_id = ? AND granted_at >= ? AND granted_at < ? GROUP BY day`, productId, s, u),
    all(db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM download_events
      WHERE created_at >= ? AND created_at < ? AND event = 'served' AND product_id = ? AND impersonation_id IS NULL GROUP BY day`, s, u, productId),
    all(db, "SELECT day, SUM(count) AS n FROM analytics_daily WHERE event = 'product_view' AND subject = ? AND day >= ? AND day < ? GROUP BY day",
      productId, dayOf(s), dayOf(u))
  ]);
  return { lines, claims, downloads, views };
}

// One order line → its figures (net before refunds; the refund is the line's proportion of what the order refunded).
function lineFigures(l) {
  const list = (l.list_price_cents ?? l.unit_price_cents) * l.quantity;
  const net = l.net_cents ?? Math.max(0, l.line_total_cents - (l.discount_cents || 0));
  const share = l.creator_share_cents || 0;
  const netAfter = shareAfterRefund({ creatorShareCents: net, orderTotalCents: l.total_cents, orderRefundedCents: l.refunded_cents || 0, orderStatus: l.status });
  const shareAfter = shareAfterRefund({ creatorShareCents: share, orderTotalCents: l.total_cents, orderRefundedCents: l.refunded_cents || 0, orderStatus: l.status });
  return { orders: 1, units: l.quantity, grossCents: list, discountCents: Math.max(0, list - net), netCents: net, platformFeeCents: l.platform_fee_cents || 0,
    creatorShareCents: shareAfter, refundsCents: net - netAfter };
}

const add = (t, f) => { for (const k of Object.keys(f)) t[k] += f[k]; };

/** Totals and per-day rows (every day of the range, zeros included) of what readRange read. */
export function summarise(data, since, until) {
  const totals = zero();
  const days = new Map();
  for (let t = since.getTime(); t < until.getTime(); t += DAY) days.set(dayOf(new Date(t).toISOString()), { day: dayOf(new Date(t).toISOString()), ...zero() });
  const bucket = (day) => days.get(day) || null;
  for (const l of data.lines) {
    const f = lineFigures(l);
    add(totals, f);
    const b = bucket(dayOf(l.paid_at));
    if (b) add(b, f);
  }
  for (const [key, rows] of [["freeClaims", data.claims], ["downloads", data.downloads], ["views", data.views]]) {
    for (const r of rows) {
      totals[key] += r.n;
      const b = bucket(r.day);
      if (b) b[key] += r.n;
    }
  }
  return { totals, daily: [...days.values()] };
}

/** Totals for one product over [since, until), for the Overview's summary. */
export async function periodTotals(app, productId, since, until) {
  return summarise(await readRange(app, productId, since, until), since, until).totals;
}

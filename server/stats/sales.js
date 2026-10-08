// Sales statistics: from orders and order items only (what the payment provider confirmed), for live or test orders.
// Money is "paid" orders (refunds counted apart), by the currency it was charged in.
import { all } from "../lib/db.js";
import { count, money, series, rows, daily } from "./metric.js";

export const queries = {
  byStatus: `SELECT status, COUNT(*) AS n FROM orders WHERE livemode = ? AND created_at >= ? GROUP BY status`,
  revenue: `SELECT currency, status, COUNT(*) AS n, SUM(total_cents) AS cents FROM orders
    WHERE livemode = ? AND paid_at >= ? AND status IN ('paid', 'refunded') GROUP BY currency, status`,
  revenueByDay: `SELECT substr(paid_at, 1, 10) AS day, currency, SUM(total_cents) AS cents, COUNT(*) AS n FROM orders
    WHERE livemode = ? AND paid_at >= ? AND status = 'paid' GROUP BY day, currency ORDER BY day`,
  ordersByDay: `SELECT substr(created_at, 1, 10) AS day, SUM(status = 'paid') AS paid, COUNT(*) AS n FROM orders
    WHERE livemode = ? AND created_at >= ? GROUP BY day ORDER BY day`,
  products: `SELECT i.product_id AS productId, MAX(i.title) AS title, o.currency, SUM(i.quantity) AS units, SUM(i.line_total_cents) AS cents
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.livemode = ? AND o.paid_at >= ? AND o.status = 'paid' GROUP BY i.product_id, o.currency ORDER BY units DESC, cents DESC LIMIT 50`,
  recent: `SELECT i.product_id AS productId, i.title, o.paid_at AS paidAt FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.livemode = ? AND o.paid_at IS NOT NULL AND o.status = 'paid' ORDER BY o.paid_at DESC LIMIT 10`
};

export default {
  queries,
  id: "sales",
  title: "Sales",
  async metrics({ db, live, since, sinceDay, untilDay }) {
    const [byStatus, revenue, revenueByDay, ordersByDay, products, recent] = await Promise.all([
      all(db, queries.byStatus, live, since), all(db, queries.revenue, live, since), all(db, queries.revenueByDay, live, since),
      all(db, queries.ordersByDay, live, since), all(db, queries.products, live, since), all(db, queries.recent, live)
    ]);
    const n = (s) => byStatus.filter((r) => s.includes(r.status)).reduce((t, r) => t + r.n, 0);
    const paid = revenue.filter((r) => r.status === "paid");
    const refunded = revenue.filter((r) => r.status === "refunded");
    const currencies = [...new Set(paid.map((r) => r.currency))];
    return [
      count("orders", "Orders started", "payment", n(["pending", "paid", "failed", "refunded", "cancelled"]), "Every checkout that created an order, paid or not."),
      count("paid", "Successful orders", "payment", n(["paid"])),
      count("failed", "Failed or cancelled", "payment", n(["failed", "cancelled"]), "Declined, expired or abandoned payment pages."),
      count("pending", "Still pending", "payment", n(["pending"])),
      money("revenue", "Revenue", "payment", paid, "Paid orders, before payment-provider fees. Refunded orders are not included."),
      money("refunds", "Refunded", "payment", refunded, `${refunded.reduce((t, r) => t + r.n, 0)} refunded order(s).`),
      money("aov", "Average order value", "derived", paid.map((r) => ({ currency: r.currency, cents: r.n ? Math.round(r.cents / r.n) : 0 })), "Revenue ÷ paid orders."),
      ...currencies.map((c) => series(`revenue-${c}`, `Revenue per day (${c})`, "payment",
        daily(sinceDay, untilDay, revenueByDay.filter((r) => r.currency === c).map((r) => ({ day: r.day, value: r.cents }))), { format: "money", currency: c })),
      series("orders-by-day", "Orders per day", "payment", daily(sinceDay, untilDay, ordersByDay.map((r) => ({ day: r.day, value: r.n, paid: r.paid })))),
      rows("product-sales", "Product sales", "payment", ["Product", "Units", "Revenue"],
        products.map((p) => [p.title, p.units, { cents: p.cents, currency: p.currency }])),
      rows("popular", "Most popular products", "payment", ["Product", "Units"], products.slice(0, 5).map((p) => [p.title, p.units])),
      rows("recent", "Recently purchased", "payment", ["Product", "Paid"], recent.map((r) => [r.title, r.paidAt]), "Products only; who bought them is in Orders.")
    ];
  }
};


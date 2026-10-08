// Promotion statistics: per sale and per promo code, the paid orders that got it and how much it took off, from the
// orders themselves (what was actually charged), for live or test orders.
import { all } from "../lib/db.js";
import { count, money, rows } from "./metric.js";

export const queries = {
  codes: `SELECT o.promotion_id AS id, o.currency, COUNT(*) AS orders, SUM(o.discount_cents) AS off, SUM(o.total_cents) AS revenue
    FROM orders o WHERE o.livemode = ? AND o.paid_at >= ? AND o.status = 'paid' AND o.promotion_id IS NOT NULL GROUP BY o.promotion_id, o.currency`,
  sales: `SELECT i.sale_id AS id, o.currency, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS units,
      SUM((i.list_price_cents - i.unit_price_cents) * i.quantity) AS off, SUM(i.line_total_cents) AS revenue
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.livemode = ? AND o.paid_at >= ? AND o.status = 'paid' AND i.sale_id IS NOT NULL GROUP BY i.sale_id, o.currency`,
  names: `SELECT id, name, kind, code FROM promotions`
};

export default {
  queries,
  id: "promotions",
  title: "Sales & promo codes",
  async metrics({ db, live, since }) {
    const [codes, sales, names] = await Promise.all([all(db, queries.codes, live, since), all(db, queries.sales, live, since), all(db, queries.names)]);
    const label = new Map(names.map((p) => [p.id, p.code ? `${p.name} (${p.code})` : p.name]));
    const byCurrency = (list) => Object.values(list.reduce((t, r) => ((t[r.currency] = { currency: r.currency, cents: (t[r.currency] ? t[r.currency].cents : 0) + r.off }), t), {}));
    return [
      count("code-orders", "Paid orders with a code", "payment", codes.reduce((t, r) => t + r.orders, 0)),
      money("code-discounts", "Taken off by codes", "payment", byCurrency(codes)),
      money("sale-discounts", "Taken off by sales", "payment", byCurrency(sales), "Catalog price minus sale price, for items sold."),
      rows("by-promotion", "By promotion", "payment", ["Promotion", "Paid orders", "Taken off", "Revenue"], [
        ...sales.map((r) => [label.get(r.id) || "removed sale", r.orders, { cents: r.off, currency: r.currency }, { cents: r.revenue, currency: r.currency }]),
        ...codes.map((r) => [label.get(r.id) || "removed code", r.orders, { cents: r.off, currency: r.currency }, { cents: r.revenue, currency: r.currency }])
      ], "Revenue is what those orders (or, for sales, those items) were charged.")
    ];
  }
};

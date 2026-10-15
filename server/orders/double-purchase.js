// Spots a possible double purchase as an order becomes paid: one of its products is already actively owned by the same
// buyer (email, or account) through a different paid order, e.g. two tabs with different carts paid one after the
// other. Nothing is refused or refunded automatically (the money is already taken); the event records it and the
// admins get one alert per order, to check and refund one in Stripe. Called by server/payments/events.js before granting.
import { all } from "../lib/db.js";
import { alertAdmins } from "../email/alerts.js";

export async function checkDoublePurchase(app, order) {
  const rows = await all(app.db,
    `SELECT DISTINCT i.product_id, i.title, e.source_id FROM order_items i
     JOIN entitlements e ON e.product_id = i.product_id AND e.source_type = 'purchase' AND e.source_id != i.order_id
       AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > ?) AND (e.email = ? OR (? IS NOT NULL AND e.user_id = ?))
     JOIN orders o ON o.id = e.source_id AND o.status = 'paid'
     WHERE i.order_id = ? ORDER BY i.title`,
    new Date().toISOString(), String(order.email).toLowerCase(), order.user_id, order.user_id, order.id);
  if (!rows.length) return null;
  const detail = `possible double purchase: ${rows.map((r) => `${r.product_id} (also in ${r.source_id})`).join(", ")}`;
  await alertAdmins(app, { key: `double-purchase:${order.id}`, title: "possible double purchase",
    lines: rows.map((r) => `Possible double purchase of ${r.title} (${r.product_id}) by order ${order.id}: the buyer already owns it through order ${r.source_id}.`)
      .concat("Check both orders and refund one in Stripe if it was a mistake.") });
  return detail.slice(0, 300);
}

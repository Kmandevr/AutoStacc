// Order API for customers: their order history, one order's status (the checkout result page polls it), asking the
// provider directly when a webhook is late (reconcile), and redeeming a guest order key from the confirmation email.
import { json, fail, readJson, str } from "../lib/http.js";
import { all } from "../lib/db.js";
import { requireUser, currentUser } from "../auth/session.js";
import { getOrder, orderItems, publicOrder } from "./orders.js";
import { guestOrderIds, checkGuestKey, guestCookie, guestKeysFromRequest } from "./guest.js";
import { providerByName } from "../payments/index.js";
import { processPaymentEvent } from "../payments/events.js";
import { limit } from "../lib/ratelimit.js";

// The order, only for its owner (account or guest key). Everyone else gets the same 404 as a missing order.
async function ownedOrder(app, orderId) {
  const order = /^ord_[a-z2-7]{26}$/.test(orderId) ? await getOrder(app.db, orderId) : null;
  if (order) {
    const user = await currentUser(app);
    if (user && user.emailVerified && order.user_id === user.id) return order;
    if ((await guestOrderIds(app)).includes(order.id)) return order;
  }
  fail(404, "not_found", "No order with that id.");
}

async function mine(app) {
  const user = await requireUser(app);
  const orders = await all(app.db, `SELECT * FROM orders WHERE user_id = ? AND (status != 'pending' OR created_at > ?) ORDER BY created_at DESC LIMIT 100`,
    user.id, new Date(Date.now() - 86400000).toISOString());
  const out = [];
  for (const o of orders) out.push(publicOrder(o, await orderItems(app.db, o.id)));
  return json({ orders: out });
}

async function one(app, { orderId }) {
  const order = await ownedOrder(app, orderId);
  return json({ order: publicOrder(order, await orderItems(app.db, order.id)) });
}

// Asks the payment provider (with our secret key) whether a pending order was paid. Safe to call any number of times.
async function reconcile(app, { orderId }) {
  await limit(app, "reconcile", 30, 60);
  const order = await ownedOrder(app, orderId);
  if (order.status === "pending" && order.provider_session_id) {
    const provider = providerByName(order.provider);
    try {
      const ev = await provider.retrieveCheckout(app, order.provider_session_id);
      if (ev.type === "paid" || ev.type === "expired") {
        await processPaymentEvent(app, { ...ev, provider: order.provider, id: `reconcile-${order.provider_session_id}-${ev.type}`, rawType: `reconcile.${ev.type}` });
      }
    } catch (e) {
      console.error("reconcile failed", e && e.message);
    }
  }
  const fresh = await getOrder(app.db, order.id);
  return json({ order: publicOrder(fresh, await orderItems(app.db, fresh.id)) });
}

// The library link in a guest's confirmation email carries an order key; this stores it in the guest cookie.
async function redeemGuestKey(app) {
  await limit(app, "guest-key", 10, 300);
  const { key } = await readJson(app.request);
  const order = await checkGuestKey(app, str(key, "key", { max: 120 }));
  if (!order) fail(404, "invalid_key", "That library link has expired or isn't valid. Log in, or create an account with the email you paid with.");
  const keys = [...guestKeysFromRequest(app.request).filter((k) => !k.startsWith(order.id + ".")), key];
  return json({ orderId: order.id }, 200, { "Set-Cookie": guestCookie(app.config, keys) });
}

export const routes = [
  ["GET", "/api/orders", mine],
  ["POST", "/api/guest/key", redeemGuestKey],
  ["GET", "/api/orders/:orderId", one],
  ["POST", "/api/orders/:orderId/reconcile", reconcile]
];

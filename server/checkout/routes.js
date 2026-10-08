// POST /api/checkout: turns a cart into a pending order and a hosted payment page. The browser sends product ids,
// quantities and (for guests) an email; prices, totals and the payment amount come from the database only.
// Nothing is owned until a verified payment event arrives (server/payments/events.js).
import { json, readJson, fail, email as emailField, str } from "../lib/http.js";
import { sha256 } from "../lib/crypto.js";
import { parseItems, priceCart } from "../cart/pricing.js";
import { currentUser, impersonationIdOf } from "../auth/session.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { createOrder, attachCheckout, transition, findReusablePending, getOrderByIdempotencyKey } from "../orders/orders.js";
import { newGuestKey, guestCookie, guestKeysFromRequest } from "../orders/guest.js";
import { paymentProvider } from "../payments/index.js";
import { limit } from "../lib/ratelimit.js";

async function checkout(app) {
  const { db, config, request } = app;
  await limit(app, "checkout", 12, 60);
  const body = await readJson(app.request);
  const items = parseItems(body.items);
  const user = await currentUser(app);
  if (user && !user.emailVerified) fail(403, "email_unverified", "Confirm your email first.");
  const email = user ? String(user.email).toLowerCase() : emailField(body.email);

  // Same Idempotency-Key from the same buyer = the same order (double submit, refresh mid-request).
  const rawKey = request.headers.get("idempotency-key");
  const idemKey = rawKey ? await sha256(`${user ? user.id : email}:${str(rawKey, "Idempotency-Key", { max: 100 })}`) : null;
  if (idemKey) {
    const prior = await getOrderByIdempotencyKey(db, idemKey);
    // Reused only while its payment page is still open (it expires after checkoutTtlMinutes).
    const fresh = prior && Date.now() - Date.parse(prior.created_at) < (config.checkoutTtlMinutes - 5) * 60000;
    if (prior && prior.status === "pending" && prior.checkout_url && fresh) return json({ orderId: prior.id, url: prior.checkout_url, reused: true });
    if (prior) fail(409, "checkout_finished", "That checkout already finished. Refresh the cart.", { orderId: prior.id, status: prior.status });
  }

  const owned = user ? await ownedProductIds(db, { user }) : [];
  const cart = await priceCart(db, items, { owned });
  if (cart.problems.length) fail(409, "cart_changed", "Some items can't be bought right now.", { problems: cart.problems, cart });
  if (cart.totalCents <= 0) fail(409, "cart_changed", "Nothing in the cart costs money; claim free items from their page.");

  const lines = cart.lines.map((l) => ({ productId: l.productId, title: l.title, unitPriceCents: l.unitPriceCents, quantity: l.quantity }));
  // An admin's test purchase never picks up the customer's own pending order (or the other way round).
  const impersonationId = impersonationIdOf(app);
  const reusable = impersonationId ? null : await findReusablePending(db, user && user.id, lines, config.checkoutTtlMinutes - 5);
  if (reusable) return json({ orderId: reusable.id, url: reusable.checkout_url, reused: true });

  const provider = paymentProvider(app);
  const guestKey = user ? null : await newGuestKey();
  let order;
  try {
    order = await createOrder(db, {
      userId: user ? user.id : null, email, currency: cart.currency, items: lines, provider: provider.name,
      livemode: provider.livemode(config), idempotencyKey: idemKey, accessKeyHash: guestKey ? guestKey.hash : null, impersonationId
    });
  } catch (e) {
    // Lost a race with an identical request carrying the same Idempotency-Key.
    if (idemKey && /UNIQUE/.test(String(e.message))) fail(409, "checkout_in_progress", "This checkout is already starting. Try again in a second.");
    throw e;
  }

  let session;
  try {
    session = await provider.createCheckout(app, {
      order,
      items: lines,
      successUrl: `${config.siteUrl}/checkout?order=${order.id}&status=success`,
      cancelUrl: `${config.siteUrl}/cart?cancelled=${order.id}`
    });
  } catch (e) {
    await transition(db, order.id, "failed");
    console.error("checkout: provider error", e && e.message);
    fail(502, "payment_unavailable", "The payment service didn't answer. Nothing was charged; try again in a minute.");
  }
  await attachCheckout(db, order.id, session.sessionId, session.url);

  const headers = {};
  if (guestKey) headers["Set-Cookie"] = guestCookie(config, [...guestKeysFromRequest(request), guestKey.join(order.id)]);
  return json({ orderId: order.id, url: session.url }, 201, headers);
}

// Allowed while impersonating only with test payments (server/impersonation/policy.js refuses live ones).
export const routes = [["POST", "/api/checkout", checkout, { impersonation: "test-payments" }]];

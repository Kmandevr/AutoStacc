// POST /api/checkout: turns a cart into a pending order and a hosted payment page. The browser sends product ids,
// quantities, (for guests) an email and maybe a promo code; prices, sales, discounts, totals and the payment amount
// come from the database only (server/cart/pricing.js). A code's usage limits are enforced again by the database
// as the order is written (trigger promotions_limit), so concurrent checkouts can't overspend one.
// Nothing is owned until a verified payment event arrives (server/payments/events.js).
import { json, readJson, fail, email as emailField, str } from "../lib/http.js";
import { isOpen } from "../settings/settings.js";
import { sha256 } from "../lib/crypto.js";
import { parseItems, priceCart, publicCart as publicView } from "../cart/pricing.js";
import { currentUser, impersonationIdOf } from "../auth/session.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { createOrder, attachCheckout, transition, findReusablePending, getOrderByIdempotencyKey } from "../orders/orders.js";
import { newGuestKey, guestCookie, guestKeysFromRequest } from "../orders/guest.js";
import { providerForAccount } from "../payments/index.js";
import { accountsOfProducts, MAIN, MARKETPLACE } from "../payments/accounts.js";
import { creatorSalesState, pausedByCopyright } from "../payments/creator-sales.js";
import { attributeLines } from "../revenue/split.js";
import { limit } from "../lib/ratelimit.js";

const CREATOR_SALES_CLOSED = "Creators' products can't be bought yet. They stay in your cart until creator checkout opens.";

const PROMO_PROBLEMS = {
  invalid: "That code doesn't exist.",
  ended: "That code has ended.",
  used_up: "That code has been used up.",
  already_used: "You've already used that code.",
  not_applicable: "That code doesn't cover anything in your cart."
};

async function checkout(app) {
  const { db, config, request } = app;
  await limit(app, "checkout", 12, 60);
  // Settings › Switches: with sales paused nothing can be bought (the cart keeps its items).
  if (!(await isOpen(db, "store_sales"))) fail(503, "sales_paused", "Sales are paused for a moment. Your cart is saved; try again soon.");
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

  // Creators' products are paid on the marketplace Stripe account, AutoStacc's own on the main one; one payment page can't
  // take both, so a cart with both is paid in two steps, one account at a time (the browser says which).
  const accountOf = config.paymentProvider === "stripe" ? await accountsOfProducts(db, items.map((i) => i.productId)) : new Map();
  const present = [...new Set(items.map((i) => accountOf.get(i.productId) || MAIN))];
  let account = present[0] || MAIN;
  if (present.length > 1) {
    const chosen = body.account === MAIN || body.account === MARKETPLACE ? body.account : null;
    if (!chosen) {
      fail(409, "split_checkout", "Your cart has AutoStacc items and creators' items, which are paid separately. Pay for one group first.", {
        groups: { [MAIN]: items.filter((i) => accountOf.get(i.productId) !== MARKETPLACE).map((i) => i.productId),
          [MARKETPLACE]: items.filter((i) => accountOf.get(i.productId) === MARKETPLACE).map((i) => i.productId) } });
    }
    account = chosen;
    items.splice(0, items.length, ...items.filter((i) => (accountOf.get(i.productId) === MARKETPLACE) === (chosen === MARKETPLACE)));
  }
  if (account === MARKETPLACE && !config.marketplaceEnabled) fail(503, "creator_sales_closed", CREATOR_SALES_CLOSED);
  const creatorSales = await creatorSalesState(app);

  const owned = user ? await ownedProductIds(db, { user }) : [];
  const promoCode = typeof body.promoCode === "string" ? body.promoCode.slice(0, 40) : "";
  if (promoCode.trim()) await limit(app, "promo", 15, 60);
  const copyrightPaused = await pausedByCopyright(db, items.map((i) => i.productId));
  const cart = await priceCart(db, items, { owned, promoCode, email, userId: user ? user.id : null, creatorSales, copyrightPaused });
  // A creator space whose selling is paused by copyright strikes: those products can't be paid for.
  if (cart.held.some((h) => h.reason === "seller_paused")) fail(409, "seller_paused", "Some items' creator can't sell right now.", { held: cart.held, cart: publicView(cart) });
  // Creators' products while creator sales are closed: the cart holds them back, so a request with them is refused.
  if (cart.held.length) fail(503, "creator_sales_closed", CREATOR_SALES_CLOSED, { held: cart.held, cart: publicView(cart) });
  const publicCart = publicView(cart);
  if (cart.problems.length) fail(409, "cart_changed", "Some items can't be bought right now.", { problems: cart.problems, cart: publicCart });
  if (cart.promoProblem) fail(409, "promo_invalid", PROMO_PROBLEMS[cart.promoProblem] || "That code can't be used.", { promoProblem: cart.promoProblem, cart: publicCart });
  if (cart.totalCents <= 0) fail(409, "cart_changed", "Nothing in the cart costs money; claim free items from their page.");

  // Each line knows who sold it and how its money splits (server/revenue/split.js), fixed now for the record.
  const lines = await attributeLines(db, cart.lines.map((l) => ({ productId: l.productId, title: l.title, type: l.type, unitPriceCents: l.unitPriceCents, quantity: l.quantity,
    listPriceCents: l.listPriceCents, saleId: l.sale ? l.sale.id : null, discountCents: l.discountCents })));
  // An admin's test purchase never picks up the customer's own pending order (or the other way round).
  const impersonationId = impersonationIdOf(app);
  const reusable = impersonationId ? null : await findReusablePending(db, user && user.id, lines, config.checkoutTtlMinutes - 5, cart.promotionId);
  if (reusable) return json({ orderId: reusable.id, url: reusable.checkout_url, reused: true });

  const provider = providerForAccount(app, account);
  const guestKey = user ? null : await newGuestKey();
  let order;
  try {
    order = await createOrder(db, {
      userId: user ? user.id : null, email, currency: cart.currency, items: lines, provider: provider.name,
      livemode: provider.livemode(config), idempotencyKey: idemKey, accessKeyHash: guestKey ? guestKey.hash : null, impersonationId,
      discountCents: cart.discountCents, promotionId: cart.promotionId, promoCode: cart.promoCode, paymentAccount: account
    });
  } catch (e) {
    // Lost a race with an identical request carrying the same Idempotency-Key.
    if (idemKey && /UNIQUE/.test(String(e.message))) fail(409, "checkout_in_progress", "This checkout is already starting. Try again in a second.");
    // The database's own check on the code's limits (two buyers reaching for the last use at once).
    const limit = String(e.message).match(/promotion_(used_up|already_used)/);
    if (limit) fail(409, "promo_invalid", PROMO_PROBLEMS[limit[1]], { promoProblem: limit[1], cart: publicCart });
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
    // The provider's own error type and code say why (a bad key, an account not yet activated, a rejected request).
    // They go in the logs; the answer carries them only outside production, so visitors never learn how payments are set up.
    // 503, not 502: Cloudflare replaces a 502 from a Function with its own empty error page, hiding this answer.
    const why = { type: e && e.type, code: e && e.code, status: e && e.statusCode, param: e && e.param, message: e && e.message ? String(e.message).slice(0, 200) : undefined };
    console.error("checkout: provider error", JSON.stringify(why), e && e.message);
    fail(503, "payment_unavailable", "The payment service couldn't open checkout. Nothing was charged; try again in a minute.", config.production ? {} : { provider: why });
  }
  await attachCheckout(db, order.id, session.sessionId, session.url);

  const headers = {};
  if (guestKey) headers["Set-Cookie"] = guestCookie(config, [...guestKeysFromRequest(request), guestKey.join(order.id)]);
  return json({ orderId: order.id, url: session.url }, 201, headers);
}

// Allowed while impersonating only with test payments (server/impersonation/policy.js refuses live ones).
export const routes = [["POST", "/api/checkout", checkout, { impersonation: "test-payments" }]];

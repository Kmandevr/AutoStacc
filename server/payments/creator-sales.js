// Whether creators' products can be bought right now, and why not. Two things must hold: the marketplace Stripe account
// is set up (STRIPE_MARKETPLACE_KEY; the mock provider in development and tests needs none), and the owner hasn't paused
// creator sales in the Control Center. While closed, creators' products can still be listed and added to carts; the cart
// holds them back from checkout and checkout refuses them (server/cart/pricing.js, server/checkout/routes.js).
import { getSetting } from "../settings/settings.js";
import { pendingWithCreatorProducts, transition } from "../orders/orders.js";
import { providerForOrder } from "./index.js";

export const keyReady = (config) => config.paymentProvider !== "stripe" || Boolean(config.marketplaceEnabled);

/** { open, keyReady, paused, reason: null | "no_key" | "paused" } */
export async function creatorSalesState(app) {
  const ready = keyReady(app.config);
  const paused = (await getSetting(app.db, "creator_sales")) === "paused";
  return { open: ready && !paused, keyReady: ready, paused, reason: !ready ? "no_key" : paused ? "paused" : null };
}

// Pausing also closes the payment pages already open for creators' products (owner, 2026-10-15), so nothing can be
// paid after the pause: each is expired at the provider, then its order is cancelled. A page the provider won't close
// (just paid) is left to its webhook. → how many were closed.
export async function closeCreatorCheckouts(app) {
  let closed = 0;
  for (const order of await pendingWithCreatorProducts(app.db)) {
    try {
      await providerForOrder(app, order).expireCheckout(app, order.provider_session_id);
    } catch (e) {
      console.error("creator sales: couldn't close a payment page", order.id, e && e.code);
      continue;
    }
    if (await transition(app.db, order.id, "cancelled")) closed++;
  }
  return closed;
}

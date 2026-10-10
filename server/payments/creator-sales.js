// Whether creators' products can be bought right now, and why not. Two things must hold: the marketplace Stripe account
// is set up (STRIPE_MARKETPLACE_KEY; the mock provider in development and tests needs none), and the owner hasn't paused
// creator sales in the Control Center. While closed, creators' products can still be listed and added to carts; the cart
// holds them back from checkout and checkout refuses them (server/cart/pricing.js, server/checkout/routes.js).
import { getSetting } from "../settings/settings.js";

export const keyReady = (config) => config.paymentProvider !== "stripe" || Boolean(config.marketplaceEnabled);

/** { open, keyReady, paused, reason: null | "no_key" | "paused" } */
export async function creatorSalesState(app) {
  const ready = keyReady(app.config);
  const paused = (await getSetting(app.db, "creator_sales")) === "paused";
  return { open: ready && !paused, keyReady: ready, paused, reason: !ready ? "no_key" : paused ? "paused" : null };
}

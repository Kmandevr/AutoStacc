// POST /api/cart/price: the authoritative version of the browser's cart (prices, sales, a promo code's discount,
// totals, and per-line problems).
import { json, readJson } from "../lib/http.js";
import { parseItems, priceCart, publicCart } from "./pricing.js";
import { resolveAccess } from "../entitlements/access.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { limit } from "../lib/ratelimit.js";

async function price(app) {
  await limit(app, "cart", 60, 60);
  const body = await readJson(app.request);
  const items = parseItems(body.items);
  const access = await resolveAccess(app);
  const owned = access.user ? await ownedProductIds(app.db, { user: access.user }) : [];
  const promoCode = typeof body.promoCode === "string" ? body.promoCode.slice(0, 40) : "";
  // Trying codes has its own, stricter limit, so codes can't be found by guessing.
  if (promoCode.trim()) await limit(app, "promo", 15, 60);
  const email = access.user ? String(access.user.email).toLowerCase() : "";
  const cart = await priceCart(app.db, items, { owned, promoCode, email, userId: access.user ? access.user.id : null });
  return json({ cart: publicCart(cart) });
}

// Pricing changes nothing, so it also works while impersonating (server/impersonation/policy.js).
export const routes = [["POST", "/api/cart/price", price, { impersonation: "allow" }]];

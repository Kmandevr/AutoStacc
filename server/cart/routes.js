// POST /api/cart/price: the authoritative version of the browser's cart (prices, totals, and per-line problems).
import { json, readJson } from "../lib/http.js";
import { parseItems, priceCart } from "./pricing.js";
import { resolveAccess } from "../entitlements/access.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { limit } from "../lib/ratelimit.js";

async function price(app) {
  await limit(app, "cart", 60, 60);
  const body = await readJson(app.request);
  const items = parseItems(body.items);
  const access = await resolveAccess(app);
  const owned = access.user ? await ownedProductIds(app.db, { user: access.user }) : [];
  return json({ cart: await priceCart(app.db, items, { owned }) });
}

export const routes = [["POST", "/api/cart/price", price]];

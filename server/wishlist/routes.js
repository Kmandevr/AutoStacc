// Wishlist API for the signed-in person: GET /api/wishlist, PUT and DELETE /api/wishlist/:productId. Saving needs a
// visible product; everything else about it is the person's own list (server/wishlist/wishlist.js).
import { json, fail, id } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { getProduct, isVisible } from "../catalog/products.js";
import { listWishlist, addToWishlist, removeFromWishlist, MAX_ITEMS } from "./wishlist.js";

async function list(app) {
  const user = await requireUser(app);
  const rows = await listWishlist(app.db, user.id);
  return json({ items: rows.map((r) => ({ productId: r.product_id, addedAt: r.created_at })) }, 200, { "Cache-Control": "private, no-store" });
}

async function add(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "wishlist", 60, 60);
  const product = await getProduct(app.db, id(productId, "productId"));
  if (!isVisible(product)) fail(404, "not_found", "No product with that id.");
  const result = await addToWishlist(app.db, user.id, product.id);
  if (result === "full") fail(409, "wishlist_full", `A wishlist holds up to ${MAX_ITEMS} products.`);
  return json({ ok: true, productId: product.id }, result === "added" ? 201 : 200);
}

async function remove(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "wishlist", 60, 60);
  await removeFromWishlist(app.db, user.id, id(productId, "productId"));
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/wishlist", list],
  ["PUT", "/api/wishlist/:productId", add],
  ["DELETE", "/api/wishlist/:productId", remove]
];

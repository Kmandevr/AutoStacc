// Public catalog API: published products with live price and availability, plus "owned" for the requester.
import { json, fail, id } from "../lib/http.js";
import { listProducts, getProduct, isVisible, publicProduct } from "./products.js";
import { resolveAccess } from "../entitlements/access.js";
import { ownedProductIds } from "../entitlements/grants.js";

async function list(app) {
  const products = (await listProducts(app.db)).map(publicProduct);
  return json({ products }, 200, { "Cache-Control": "public, max-age=60" });
}

async function one(app, { productId }) {
  const p = await getProduct(app.db, id(productId, "productId"));
  if (!isVisible(p)) fail(404, "not_found", "No product with that id.");
  return json({ product: publicProduct(p) }, 200, { "Cache-Control": "public, max-age=60" });
}

// Live state for product pages and cards: availability and price for the given ids, and which ones this person owns.
async function state(app) {
  const url = new URL(app.request.url);
  const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 50);
  ids.forEach((x) => id(x, "ids"));
  const products = (await listProducts(app.db)).filter((p) => !ids.length || ids.includes(p.id));
  const access = await resolveAccess(app);
  const owned = await ownedProductIds(app.db, access);
  return json({
    signedIn: Boolean(access.user),
    products: Object.fromEntries(products.map((p) => [p.id, { ...publicProduct(p), owned: owned.includes(p.id) }]))
  });
}

export const routes = [
  ["GET", "/api/products", list],
  ["GET", "/api/products/state", state],
  ["GET", "/api/products/:productId", one]
];

// Public catalog API: published products with live price and availability, plus "owned" for the requester.
import { json, fail, id } from "../lib/http.js";
import { listProducts, getProduct, isVisible, publicProduct } from "./products.js";
import { resolveAccess } from "../entitlements/access.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { runningSales } from "../promotions/promotions.js";

async function list(app) {
  const [listed, sales] = await Promise.all([listProducts(app.db), runningSales(app.db)]);
  const products = listed.map((p) => publicProduct(p, sales));
  return json({ products }, 200, { "Cache-Control": "public, max-age=60" });
}

async function one(app, { productId }) {
  const [p, sales] = await Promise.all([getProduct(app.db, id(productId, "productId")), runningSales(app.db)]);
  if (!isVisible(p)) fail(404, "not_found", "No product with that id.");
  return json({ product: publicProduct(p, sales) }, 200, { "Cache-Control": "public, max-age=60" });
}

// Live state for product pages and cards: availability and price for the given ids, and which ones this person owns.
async function state(app) {
  const url = new URL(app.request.url);
  const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 50);
  ids.forEach((x) => id(x, "ids"));
  const [listed, sales, access] = await Promise.all([listProducts(app.db), runningSales(app.db), resolveAccess(app)]);
  const products = listed.filter((p) => !ids.length || ids.includes(p.id));
  const owned = await ownedProductIds(app.db, access);
  return json({
    signedIn: Boolean(access.user),
    products: Object.fromEntries(products.map((p) => [p.id, { ...publicProduct(p, sales), owned: owned.includes(p.id) }]))
  });
}

export const routes = [
  ["GET", "/api/products", list],
  ["GET", "/api/products/state", state],
  ["GET", "/api/products/:productId", one]
];

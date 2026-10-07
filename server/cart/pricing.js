// Prices a cart from the database. The browser sends only product ids and quantities; titles, prices, totals and
// availability always come from here. Used by the cart page (to show problems) and by checkout (to refuse them).
import { fail } from "../lib/http.js";
import { getProducts, isVisible, isPurchasable } from "../catalog/products.js";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_LINES = 20;

// Malformed input is a 400; a well-formed cart with problems (sold out, already owned) is priced with problems listed.
export function parseItems(raw) {
  if (!Array.isArray(raw)) fail(400, "invalid_cart", "items must be a list.");
  if (raw.length === 0) fail(400, "empty_cart", "Your cart is empty.");
  if (raw.length > MAX_LINES) fail(400, "invalid_cart", `At most ${MAX_LINES} items per order.`);
  const seen = new Set();
  return raw.map((item) => {
    if (!item || typeof item !== "object") fail(400, "invalid_cart", "Each item must be an object.");
    const { productId, quantity = 1 } = item;
    if (typeof productId !== "string" || productId.length > 80 || !ID.test(productId)) fail(400, "invalid_cart", "Unknown product id.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) fail(400, "invalid_cart", "Quantity must be a whole number from 1 to 99.");
    if (seen.has(productId)) fail(400, "invalid_cart", "Each product may appear once.");
    seen.add(productId);
    return { productId, quantity };
  });
}

export async function priceCart(db, items, { owned = [] } = {}) {
  const rows = new Map((await getProducts(db, items.map((i) => i.productId))).map((p) => [p.id, p]));
  const ownedSet = new Set(owned);
  const lines = items.map(({ productId, quantity }) => {
    const p = rows.get(productId);
    // Unknown and unpublished look the same, so drafts can't be discovered through the cart.
    if (!isVisible(p)) return { productId, quantity, problem: "not_found" };
    const line = { productId, title: p.title, type: p.type, currency: p.currency, unitPriceCents: p.price_cents, quantity, maxQuantity: p.max_quantity, lineTotalCents: p.price_cents * quantity };
    if (!isPurchasable(p)) line.problem = p.price_cents === 0 && !p.sales_paused ? "free" : "unavailable";
    else if (ownedSet.has(productId)) line.problem = "owned";
    else if (quantity > p.max_quantity) line.problem = "quantity";
    return line;
  });
  const currencies = new Set(lines.filter((l) => l.currency).map((l) => l.currency));
  const ok = lines.filter((l) => !l.problem);
  if (currencies.size > 1) ok.forEach((l) => (l.problem = "currency_mismatch"));
  const subtotalCents = lines.filter((l) => !l.problem).reduce((s, l) => s + l.lineTotalCents, 0);
  return {
    lines,
    currency: [...currencies][0] || "USD",
    subtotalCents,
    totalCents: subtotalCents,
    problems: lines.filter((l) => l.problem).map((l) => ({ productId: l.productId, problem: l.problem }))
  };
}

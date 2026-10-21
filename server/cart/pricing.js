// Prices a cart from the database. The browser sends only product ids, quantities and maybe a promo code; titles,
// prices, sales, discounts, totals and availability always come from here. Used by the cart page (to show problems)
// and by checkout (to refuse them), so what the cart shows is what checkout charges.
import { fail } from "../lib/http.js";
import { getProducts, isVisible, isPurchasable, productPath } from "../catalog/products.js";
import { runningSales, salePrice, findCode, usageProblem, codeDiscount, normalizeCode, publicPromotion } from "../promotions/promotions.js";

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

// promoCode: what the buyer typed (optional); email and userId: who is buying, for usage limits (optional).
// creatorSales: { open, reason } from server/payments/creator-sales.js; while closed, creators' products that could
// otherwise be bought are held (line.held = reason): kept in the cart and shown, but outside the totals and checkout.
// copyrightPaused: product ids whose creator space has selling paused by copyright strikes (held as "seller_paused", which doesn't say why).
export async function priceCart(db, items, { owned = [], promoCode = "", email = "", userId = null, creatorSales = { open: true, reason: null }, copyrightPaused = new Set() } = {}) {
  const [products, sales] = await Promise.all([getProducts(db, items.map((i) => i.productId)), runningSales(db)]);
  const rows = new Map(products.map((p) => [p.id, p]));
  const ownedSet = new Set(owned);
  const lines = items.map(({ productId, quantity }) => {
    const p = rows.get(productId);
    // Unknown and unpublished look the same, so drafts can't be discovered through the cart.
    if (!isVisible(p)) return { productId, quantity, problem: "not_found" };
    const { priceCents, sale } = salePrice(p, sales);
    const line = { productId, title: p.title, path: productPath(p), type: p.type, currency: p.currency, unitPriceCents: priceCents, listPriceCents: p.price_cents,
      sale: sale ? { id: sale.id, name: sale.name, endsAt: sale.ends_at || null } : null, quantity, maxQuantity: p.max_quantity,
      lineTotalCents: priceCents * quantity, discountCents: 0 };
    if (!isPurchasable(p)) line.problem = p.price_cents === 0 && !p.sales_paused ? "free" : "unavailable";
    else if (ownedSet.has(productId)) line.problem = "owned";
    else if (quantity > p.max_quantity) line.problem = "quantity";
    else if (p.source === "studio" && !creatorSales.open) line.held = creatorSales.reason;
    else if (copyrightPaused.has(productId)) line.held = "seller_paused";
    return line;
  });
  const currencies = new Set(lines.filter((l) => l.currency).map((l) => l.currency));
  const ok = lines.filter((l) => !l.problem && !l.held);
  if (currencies.size > 1) ok.forEach((l) => (l.problem = "currency_mismatch"));
  const subtotalCents = lines.filter((l) => !l.problem && !l.held).reduce((s, l) => s + l.lineTotalCents, 0);
  const code = await applyCode(db, promoCode, lines, rows, subtotalCents, { email, userId });
  return {
    lines,
    currency: [...currencies][0] || "USD",
    subtotalCents,
    discountCents: code.discountCents,
    totalCents: subtotalCents - code.discountCents,
    promotion: code.promo ? publicPromotion(code.promo) : null,
    promotionId: code.promo ? code.promo.id : null,
    promoCode: code.promo ? code.promo.code : null,
    promoProblem: code.problem || null,
    problems: lines.filter((l) => l.problem).map((l) => ({ productId: l.productId, problem: l.problem })),
    held: lines.filter((l) => l.held).map((l) => ({ productId: l.productId, reason: l.held }))
  };
}

// What a browser may see of a priced cart: no internal promotion or sale ids.
export const publicCart = (cart) => ({ ...cart, promotionId: undefined, lines: cart.lines.map((l) => (l.sale ? { ...l, sale: { name: l.sale.name, endsAt: l.sale.endsAt } } : l)) });

// A code's discount on the lines that can be bought. Problems: invalid (also not started yet), ended, used_up, already_used,
// not_applicable (nothing in the cart it covers).
async function applyCode(db, raw, lines, products, subtotalCents, buyer) {
  if (!normalizeCode(raw)) return { discountCents: 0 };
  const found = await findCode(db, raw);
  if (found.problem) return { discountCents: 0, problem: found.problem };
  const usage = await usageProblem(db, found.promo, buyer);
  if (usage) return { discountCents: 0, problem: usage };
  const { discountCents, shares } = codeDiscount(found.promo, lines, products, subtotalCents);
  if (!discountCents) return { discountCents: 0, problem: "not_applicable" };
  lines.forEach((l) => { if (shares.has(l.productId)) l.discountCents = shares.get(l.productId); });
  return { discountCents, promo: found.promo };
}

// Catalog reads: the authoritative product record (price, availability) for every commerce decision.
// Products are written only by the catalog sync (db/catalog.sql) and the admin's sales switch.
import { all, first, parseJson } from "../lib/db.js";

export const getProduct = (db, id) => first(db, "SELECT * FROM products WHERE id = ?", id);

export const getProducts = async (db, ids) => {
  if (!ids.length) return [];
  return all(db, `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
};

export const listProducts = (db, { includeHidden = false } = {}) =>
  all(db, `SELECT * FROM products ${includeHidden ? "" : "WHERE published = 1 AND deleted_at IS NULL"} ORDER BY featured DESC, title`);

// Visible in the store: published and not removed from data/.
export const isVisible = (p) => Boolean(p && p.published && !p.deleted_at);
// Can be bought right now.
export const isPurchasable = (p) => isVisible(p) && !p.sales_paused && p.price_cents > 0;
// Can be claimed for free by a signed-in customer.
export const isFree = (p) => isVisible(p) && !p.sales_paused && p.price_cents === 0;

// The shape browsers see: no internal columns.
export function publicProduct(p) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    priceCents: p.price_cents,
    currency: p.currency,
    artwork: p.artwork,
    preview: p.preview,
    tags: parseJson(p.tags, []),
    releaseId: p.release_id,
    metadata: parseJson(p.metadata, {}),
    featured: Boolean(p.featured),
    maxQuantity: p.max_quantity,
    available: isPurchasable(p) || isFree(p),
    free: p.price_cents === 0
  };
}

// Catalog reads: the authoritative product record (price, availability) for every commerce decision.
// Products are written only by the catalog sync (db/catalog.sql) and the admin's sales switch.
import { all, first, parseJson } from "../lib/db.js";
import { salePrice } from "../promotions/promotions.js";

export const getProduct = (db, id) => first(db, "SELECT * FROM products WHERE id = ?", id);

export const getProducts = async (db, ids) => {
  if (!ids.length) return [];
  return all(db, `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
};

export const listProducts = (db, { includeHidden = false } = {}) =>
  all(db, `SELECT * FROM products ${includeHidden ? "" : "WHERE published = 1 AND deleted_at IS NULL"} ORDER BY featured DESC, title`);

// Visible products of the given projects (follows, Auto-Stacc).
export const listProjectProducts = async (db, projectIds) => {
  if (!projectIds.length) return [];
  return all(db, `SELECT * FROM products WHERE published = 1 AND deleted_at IS NULL AND project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY title`, ...projectIds);
};

// Visible in the store: published and not removed from data/.
export const isVisible = (p) => Boolean(p && p.published && !p.deleted_at);
// Can be bought right now.
export const isPurchasable = (p) => isVisible(p) && !p.sales_paused && p.price_cents > 0;
// Can be claimed for free by a signed-in customer.
export const isFree = (p) => isVisible(p) && !p.sales_paused && p.price_cents === 0;

// The shape browsers see: no internal columns. With the running sales (server/promotions), priceCents is the price
// right now and listPriceCents the catalog price, plus the sale's name and end while one applies.
export function publicProduct(p, sales = []) {
  const { priceCents, sale } = salePrice(p, sales);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    priceCents,
    listPriceCents: p.price_cents,
    sale: sale ? { name: sale.name, endsAt: sale.ends_at || null } : null,
    currency: p.currency,
    artwork: p.artwork,
    preview: p.preview,
    tags: parseJson(p.tags, []),
    releaseId: p.release_id,
    metadata: parseJson(p.metadata, {}),
    featured: Boolean(p.featured),
    projectId: p.project_id || null,
    pacs: parseJson(p.pacs, []),
    maxQuantity: p.max_quantity,
    available: isPurchasable(p) || isFree(p),
    free: p.price_cents === 0
  };
}

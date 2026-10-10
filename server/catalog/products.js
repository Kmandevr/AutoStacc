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

// Who made each Studio product, for the store's "by" line and its "Unverified creator" label: the project and creator
// (name, address) and whether AutoStacc trusts the creator. Catalog (first-party) products need none.
export async function sellersOf(db, products) {
  const ids = products.filter((p) => p.source === "studio").map((p) => p.id);
  if (!ids.length) return new Map();
  const rows = await all(db, `SELECT p.id, j.name AS project_name, j.slug AS project_slug, c.name AS creator_name, c.slug AS creator_slug, c.trusted
    FROM products p JOIN projects j ON j.id = p.project_id JOIN creators c ON c.id = j.creator_id WHERE p.id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return new Map(rows.map((r) => [r.id, r]));
}

// Visible in the store: published and not removed from data/.
export const isVisible = (p) => Boolean(p && p.published && !p.deleted_at);
// Can be bought right now.
export const isPurchasable = (p) => isVisible(p) && !p.sales_paused && p.price_cents > 0;
// Can be claimed for free by a signed-in customer.
export const isFree = (p) => isVisible(p) && !p.sales_paused && p.price_cents === 0;

// Where a product's page is: catalog products have generated pages, Studio products share the /product template.
export const productPath = (p) => (p.source === "studio" ? `/product?p=${p.id}` : `/shop/${p.id}`);

// The shape browsers see: no internal columns. With the running sales (server/promotions), priceCents is the price
// right now and listPriceCents the catalog price, plus the sale's name and end while one applies.
export function publicProduct(p, sales = [], seller = null) {
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
    free: p.price_cents === 0,
    path: productPath(p),
    source: p.source || "catalog",
    // A Studio product names its maker; verified is false until AutoStacc trusts the creator.
    ...(seller ? { projectName: seller.project_name, creator: { name: seller.creator_name, path: `/${seller.creator_slug}` },
      projectPath: `/${seller.creator_slug}/${seller.project_slug}`, verified: Boolean(seller.trusted) } : { verified: p.source !== "studio" })
  };
}

// Every product that sells a Pac (its `pacs` list names it), for publishing a Pac's contents into each of them.
export const productsWithPac = (db, pacId) =>
  all(db, "SELECT id, title FROM products WHERE EXISTS (SELECT 1 FROM json_each(products.pacs) j WHERE j.value = ?) ORDER BY title", pacId);

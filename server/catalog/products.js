// Catalog reads: the authoritative product record (price, availability) for every commerce decision.
// Products are written by the Studio (server/creators/products.js), test fixtures and the admin's sales switch.
import { all, first, parseJson } from "../lib/db.js";
import { salePrice } from "../promotions/promotions.js";

export const getProduct = (db, id) => first(db, "SELECT * FROM products WHERE id = ?", id);

export const getProducts = async (db, ids) => {
  if (!ids.length) return [];
  return all(db, `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
};

// The store's list: what's on sale, plus Coming soon products (shown, never sold; owner, 2026-10-27).
export const listProducts = (db, { includeHidden = false } = {}) =>
  all(db, `SELECT * FROM products ${includeHidden ? "" : `WHERE (published = 1 OR ${COMING_SOON_SQL}) AND deleted_at IS NULL`} ORDER BY featured DESC, title`);

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

// Who made a product, for its page (server/shop/): its project and creator, any source, with whether search engines may
// index it (a trusted, active, published creator and a published project). null when it has no creator.
const MAKER = `j.name AS project_name, j.slug AS project_slug, c.name AS creator_name, c.slug AS creator_slug,
  (c.trusted = 1 AND c.status = 'active' AND c.published = 1 AND c.deleted_at IS NULL AND j.published = 1 AND j.deleted_at IS NULL) AS indexable`;
export const makerOf = (db, productId) => first(db, `SELECT ${MAKER}, c.trusted FROM products p JOIN projects j ON j.id = p.project_id
  JOIN creators c ON c.id = j.creator_id WHERE p.id = ?`, productId);
// The visible products whose pages search engines may index, with their last change (the shop sitemap).
export const indexableProducts = (db) => all(db, `SELECT p.id, p.updated_at FROM products p JOIN projects j ON j.id = p.project_id
  JOIN creators c ON c.id = j.creator_id WHERE p.published = 1 AND p.deleted_at IS NULL AND c.trusted = 1 AND c.status = 'active'
  AND c.published = 1 AND c.deleted_at IS NULL AND j.published = 1 AND j.deleted_at IS NULL ORDER BY p.id LIMIT 50000`);

// Coming soon (server/creators/coming-soon.js): unpublished with a day to go on sale. Its page and card show, nothing sells.
const COMING_SOON_SQL = "(published = 0 AND coming_soon_on IS NOT NULL AND source = 'studio')";
export const isComingSoon = (p) => Boolean(p && !p.published && !p.deleted_at && p.coming_soon_on && p.source === "studio");
// Visible in the store: published and not removed from data/.
export const isVisible = (p) => Boolean(p && p.published && !p.deleted_at);
// Can be bought right now.
export const isPurchasable = (p) => isVisible(p) && !p.sales_paused && p.price_cents > 0;
// Can be claimed for free by a signed-in customer.
export const isFree = (p) => isVisible(p) && !p.sales_paused && p.price_cents === 0;

// Where a product's page is: every product, any creator, has its server-rendered page at /shop/<id> (server/shop/).
export const productPath = (p) => `/shop/${p.id}`;

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
    comingSoon: isComingSoon(p) ? { on: p.coming_soon_on } : null,
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

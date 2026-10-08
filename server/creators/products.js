// Products a creator makes in the Studio (D1 products with source 'studio', one per row, under one of the creator's
// projects): checking what they type, creating, changing and removing them, and the access check for an account that may
// manage one. Price, availability and ownership stay the store's (server/catalog, server/cart): this only writes the rows.
// A product goes on sale (published) only with a file a buyer could download (server/files/files.js).
import { all, first, run, randomToken, now, parseJson } from "../lib/db.js";
import { fail, str } from "../lib/http.js";
import { LIMITS, SELLING } from "./policy.js";
import { requireProject } from "./projects.js";
import { getProject } from "./creators.js";
import { ownImages, imageSrc } from "../sites/images.js";
import { DELIVERABLE } from "../files/files.js";

const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const productPath = (p) => (p.source === "studio" ? `/product?p=${p.id}` : `/shop/${p.id}`);

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "product";

// What a creator may send for a product. Only the fields present are checked and returned (so an edit can change one).
export function cleanProductInput(body, { requireAll = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (requireAll || has("title")) out.title = str(body.title, "title", { min: 3, max: 80 }).trim();
  if (has("description")) out.description = typeof body.description === "string" && body.description.length <= 2000 ? body.description.trim() : fail(400, "invalid_field", "The description can be up to 2,000 characters.", { field: "description" });
  if (requireAll || has("type")) out.type = SELLING.kinds.includes(body.type) ? body.type : fail(400, "invalid_field", "Pick one of the product kinds.", { field: "type" });
  if (requireAll || has("priceCents")) {
    const c = body.priceCents;
    if (!Number.isInteger(c) || (c !== 0 && (c < SELLING.minPriceCents || c > SELLING.maxPriceCents))) {
      fail(400, "invalid_field", `A price is free, or from $${SELLING.minPriceCents / 100} to $${SELLING.maxPriceCents / 100}.`, { field: "priceCents" });
    }
    out.priceCents = c;
  }
  if (has("tags")) {
    if (!Array.isArray(body.tags) || body.tags.length > 8 || body.tags.some((t) => typeof t !== "string" || !WORD.test(t) || t.length > 24)) {
      fail(400, "invalid_field", "Up to 8 tags, each lowercase letters, numbers and hyphens.", { field: "tags" });
    }
    out.tags = body.tags;
  }
  if (has("includes")) {
    if (!Array.isArray(body.includes) || body.includes.length > 12 || body.includes.some((t) => typeof t !== "string" || !t.trim() || t.length > 100)) {
      fail(400, "invalid_field", "Up to 12 lines of what's inside, each under 100 characters.", { field: "includes" });
    }
    out.includes = body.includes.map((t) => t.trim());
  }
  if (has("artworkId")) {
    if (body.artworkId !== null && (typeof body.artworkId !== "string" || body.artworkId.length > 40)) fail(400, "invalid_field", "artworkId must be one of your images, or null.", { field: "artworkId" });
    out.artworkId = body.artworkId;
  }
  for (const k of ["published", "salesPaused", "deleted"]) {
    if (has(k)) { if (typeof body[k] !== "boolean") fail(400, "invalid_field", `${k} must be true or false.`, { field: k }); out[k] = body[k]; }
  }
  return out;
}

// A product of a Studio project that this account may change. Anything else looks like nothing there.
export async function requireOwnProduct(db, productId, user, roles) {
  const product = typeof productId === "string" ? await first(db, "SELECT * FROM products WHERE id = ? AND source = 'studio'", productId) : null;
  const project = product && product.project_id ? await getProject(db, product.project_id) : null;
  if (!project) fail(404, "not_found", "Nothing here.");
  const { creator, role } = await requireProject(db, project.id, user, roles);
  return { product, project, creator, role };
}

export const countProducts = async (db, creatorId) => (await first(db,
  "SELECT COUNT(*) AS n FROM products p JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ? AND p.source = 'studio' AND p.deleted_at IS NULL", creatorId)).n;

async function freshId(db, creator, title) {
  const base = `${creator.slug}-${slugify(title)}`.slice(0, 72);
  for (let i = 0; i < 4; i++) {
    const id = i === 0 ? base : `${base}-${randomToken(3)}`;
    if (!(await first(db, "SELECT 1 FROM products WHERE id = ?", id))) return id;
  }
  return `${base}-${randomToken(6)}`;
}

// The image behind an artworkId must be an active image of this creator (never someone else's), as its /media/sites/ address.
async function artworkSrc(db, creatorId, artworkId) {
  if (artworkId === null) return null;
  const owned = await ownImages(db, creatorId, [artworkId]);
  if (!owned.length) fail(400, "invalid_field", "That image isn't one of your uploaded images.", { field: "artworkId" });
  return imageSrc(artworkId);
}

// A new draft. The limit is checked inside the insert, so parallel requests can't each add one more.
export async function createProduct(db, { creator, project, user, input }) {
  const id = await freshId(db, creator, input.title);
  const t = now();
  const art = input.artworkId === undefined ? null : await artworkSrc(db, creator.id, input.artworkId);
  const res = await run(db,
    `INSERT INTO products (id, title, description, type, price_cents, currency, artwork, tags, metadata, featured, published, sales_paused, max_quantity, project_id, pacs, source, created_by, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, 'USD', ?, ?, ?, 0, 0, 0, 1, ?, '[]', 'studio', ?, ?, ?
     WHERE (SELECT COUNT(*) FROM products p JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ? AND p.source = 'studio' AND p.deleted_at IS NULL) < ?`,
    id, input.title, input.description || "", input.type, input.priceCents, art, JSON.stringify(input.tags || []), JSON.stringify(input.includes ? { includes: input.includes } : {}),
    project.id, user.id, t, t, creator.id, LIMITS.productsPerCreator);
  if (!res.meta.changes) fail(409, "limit_reached", `A creator can have up to ${LIMITS.productsPerCreator} products.`);
  return first(db, "SELECT * FROM products WHERE id = ?", id);
}

export const hasDeliverableFile = async (db, productId) =>
  Boolean(await first(db, `SELECT 1 FROM product_files WHERE product_id = ? AND ${DELIVERABLE} LIMIT 1`, productId));

// Applies a cleaned edit. Going on sale needs a downloadable file; removing takes it off sale (buyers keep their files).
export async function updateProduct(db, { product, creator, input }) {
  const sets = [], args = [];
  const add = (col, v) => { sets.push(`${col} = ?`); args.push(v); };
  if (input.title !== undefined) add("title", input.title);
  if (input.description !== undefined) add("description", input.description);
  if (input.type !== undefined) add("type", input.type);
  if (input.priceCents !== undefined) add("price_cents", input.priceCents);
  if (input.tags !== undefined) add("tags", JSON.stringify(input.tags));
  if (input.includes !== undefined) add("metadata", JSON.stringify({ ...parseJson(product.metadata, {}), includes: input.includes }));
  if (input.artworkId !== undefined) add("artwork", await artworkSrc(db, creator.id, input.artworkId));
  if (input.salesPaused !== undefined) add("sales_paused", input.salesPaused ? 1 : 0);
  if (input.published !== undefined) {
    if (input.published && !(await hasDeliverableFile(db, product.id))) {
      fail(409, "needs_file", "Add a file and have it approved before putting this on sale.");
    }
    add("published", input.published ? 1 : 0);
  }
  if (input.deleted !== undefined) {
    add("deleted_at", input.deleted ? now() : null);
    if (input.deleted) add("published", 0);
  }
  if (!sets.length) fail(400, "invalid_field", "Nothing to change.");
  await run(db, `UPDATE products SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...args, now(), product.id);
  return first(db, "SELECT * FROM products WHERE id = ?", product.id);
}

// The creator's view of a product with its files (and why a file isn't delivered yet).
export async function productViews(db, rows) {
  if (!rows.length) return [];
  const files = await all(db, `SELECT id, product_id, filename, size_bytes, status, status_note, active FROM product_files
    WHERE product_id IN (${rows.map(() => "?").join(",")}) AND status <> 'deleted' ORDER BY created_at`, ...rows.map((r) => r.id));
  return rows.map((p) => ({
    id: p.id, title: p.title, description: p.description, type: p.type, priceCents: p.price_cents, currency: p.currency, artwork: p.artwork,
    tags: parseJson(p.tags, []), includes: parseJson(p.metadata, {}).includes || [], published: Boolean(p.published), salesPaused: Boolean(p.sales_paused),
    deleted: Boolean(p.deleted_at), path: productPath(p), createdAt: p.created_at,
    files: files.filter((f) => f.product_id === p.id && f.active).map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.size_bytes, status: f.status, note: f.status_note || "" }))
  }));
}

export const listProjectProductRows = (db, projectId) => all(db, "SELECT * FROM products WHERE project_id = ? AND source = 'studio' ORDER BY deleted_at IS NOT NULL, created_at DESC", projectId);

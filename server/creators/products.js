// Products a creator makes in the Studio (D1 products with source 'studio', one per row, under one of the creator's
// projects): checking what they type, creating, changing and removing them, and the access check for an account that may
// manage one. Price, availability and ownership stay the store's (server/catalog, server/cart): this only writes the rows.
// A product goes on sale (published) only when it passes the readiness check (server/creators/readiness.js), and every
// change is written to its release history (server/creators/product-history.js).
import { all, first, run, randomToken, now, parseJson } from "../lib/db.js";
import { fail, str } from "../lib/http.js";
import { LIMITS, SELLING } from "./policy.js";
import { requireProject } from "./projects.js";
import { getProject } from "./creators.js";
import { productPath } from "../catalog/products.js";
import { ownImages, imageSrc } from "../sites/images.js";
import { DELIVERABLE } from "../files/files.js";
import { cleanFacets, cleanBpm, cleanSpecs, suggestFacets, searchText, schemaOf } from "../discovery/vocabulary.js";
import { facetsOf, replaceFacetsStmts } from "../discovery/facets.js";
import { loadReadiness } from "./readiness.js";
import { recordEvent } from "./events.js";
import { changeEvents, recordChanges } from "./product-history.js";
import { rolesFor } from "./roles.js";

const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export { productPath };

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
  // Store details (server/discovery/vocabulary.js): shape here; the values are checked against the kind on save.
  if (has("facets")) {
    const f = body.facets;
    if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).length > 16
      || Object.values(f).some((v) => !Array.isArray(v) || v.length > 12 || v.some((x) => typeof x !== "string" || x.length > 40))) {
      fail(400, "invalid_field", "Store details are lists of words per field.", { field: "facets" });
    }
    out.facets = f;
  }
  if (has("bpm")) out.bpm = body.bpm;
  if (has("specs")) {
    if (body.specs !== null && (typeof body.specs !== "object" || Array.isArray(body.specs))) fail(400, "invalid_field", "specs is { sampleRate, bitDepth }.", { field: "specs" });
    out.specs = body.specs || {};
  }
  for (const k of ["published", "salesPaused", "deleted"]) {
    if (has(k)) { if (typeof body[k] !== "boolean") fail(400, "invalid_field", `${k} must be true or false.`, { field: k }); out[k] = body[k]; }
  }
  return out;
}

// A product of a Studio project that this account may change (by default, a member who may run products: roles.js).
// Anything else looks like nothing there.
export async function requireOwnProduct(db, productId, user, roles = rolesFor("products")) {
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

// Store details checked against the product's kind: { facets, bpm, specs } (each undefined when not sent). A value the
// vocabulary doesn't know, or a field that doesn't apply to the kind, is refused with the reason.
function cleanDetails(type, input) {
  const out = {};
  const refuse = (errors, field) => { if (errors.length) fail(400, "invalid_field", `Store details: ${errors[0]}.`, { field }); };
  if (input.facets !== undefined) { const r = cleanFacets(type, input.facets); refuse(r.errors, "facets"); out.facets = r.facets; }
  if (input.bpm !== undefined) { const r = cleanBpm(type, input.bpm); refuse(r.errors, "bpm"); out.bpm = r.bpm; }
  if (input.specs !== undefined) { const r = cleanSpecs(type, input.specs); refuse(r.errors, "specs"); out.specs = r.specs; }
  return out;
}

// After any change: facet rows (when sent, or trimmed to what a new kind allows), BPM, specs and the search text, in
// one batch with nothing else in between.
async function saveDetails(db, product, details, { project, creator }) {
  const facets = details.facets !== undefined ? details.facets
    : cleanFacets(product.type, (await facetsOf(db, [product.id], { creatorOnly: true }))[product.id] || {}).facets; // a kind change drops what no longer applies
  const meta = parseJson(product.metadata, {});
  if (details.specs !== undefined) { if (Object.keys(details.specs).length) meta.specs = details.specs; else delete meta.specs; }
  else if (meta.specs) meta.specs = cleanSpecs(product.type, meta.specs).specs;
  const bpm = details.bpm !== undefined ? details.bpm : (schemaOf(product.type).bpm && product.bpm_min ? [product.bpm_min, product.bpm_max] : null);
  const text = searchText({ title: product.title, description: product.description, tags: parseJson(product.tags, []), facets,
    by: [project && project.name, creator && creator.name].filter(Boolean).join(" ") });
  await db.batch([
    ...replaceFacetsStmts(db, product.id, facets),
    db.prepare("UPDATE products SET metadata = ?, bpm_min = ?, bpm_max = ?, search_text = ? WHERE id = ?")
      .bind(JSON.stringify(meta), bpm ? bpm[0] : null, bpm ? bpm[1] : null, text, product.id)
  ]);
  return first(db, "SELECT * FROM products WHERE id = ?", product.id);
}

// A new draft. The limit is checked inside the insert, so parallel requests can't each add one more.
export async function createProduct(db, { creator, project, user, input }) {
  const details = cleanDetails(input.type, input);
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
  await recordEvent(db, { productId: id, kind: "created", actorId: user ? user.id : null, detail: { priceCents: input.priceCents } });
  return saveDetails(db, await first(db, "SELECT * FROM products WHERE id = ?", id), details, { project, creator });
}

export const hasDeliverableFile = async (db, productId) =>
  Boolean(await first(db, `SELECT 1 FROM product_files WHERE product_id = ? AND ${DELIVERABLE} LIMIT 1`, productId));

// Refuses `published: true` unless the product (with this edit's title and price) is ready. The code stays
// "needs_file" when a file is the only thing missing, else "not_ready"; both carry the blocking list.
async function requireReady(db, product, creator, input) {
  const overrides = {};
  if (input.title !== undefined) overrides.title = input.title;
  if (input.priceCents !== undefined) overrides.price_cents = input.priceCents;
  const { blocking } = await loadReadiness(db, product, creator, overrides);
  if (!blocking.length) return;
  const code = blocking.length === 1 && blocking[0].code === "needs_file" ? "needs_file" : "not_ready";
  fail(409, code, blocking[0].message, { blocking });
}

// Applies a cleaned edit. Going on sale needs the readiness check; removing takes it off sale (buyers keep their files).
// user: who made the change, for the release history.
export async function updateProduct(db, { product, project, creator, input, user = null }) {
  const details = cleanDetails(input.type || product.type, input);
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
    if (input.published) await requireReady(db, product, creator, input);
    add("published", input.published ? 1 : 0);
  }
  if (input.deleted !== undefined) {
    add("deleted_at", input.deleted ? now() : null);
    if (input.deleted) add("published", 0);
  }
  if (!sets.length && !Object.keys(details).length) fail(400, "invalid_field", "Nothing to change.");
  const facetsBefore = (await facetsOf(db, [product.id], { creatorOnly: true }))[product.id] || {};
  if (sets.length) await run(db, `UPDATE products SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...args, now(), product.id);
  else await run(db, "UPDATE products SET updated_at = ? WHERE id = ?", now(), product.id);
  const saved = await saveDetails(db, await first(db, "SELECT * FROM products WHERE id = ?", product.id), details, { project, creator });
  const facetsAfter = (await facetsOf(db, [product.id], { creatorOnly: true }))[product.id] || {};
  await recordChanges(db, product.id, user ? user.id : null, changeEvents(product, saved, { facetsBefore, facetsAfter }));
  return saved;
}

// The creator's view of a product with its files (and why a file isn't delivered yet).
export async function productViews(db, rows) {
  if (!rows.length) return [];
  const facets = await facetsOf(db, rows.map((r) => r.id), { creatorOnly: true });
  // Files a Pack Builder version delivers are managed there (js/studio-packs.js): only counted here.
  const files = await all(db, `SELECT id, product_id, filename, size_bytes, status, status_note, active, version_id FROM product_files
    WHERE product_id IN (${rows.map(() => "?").join(",")}) AND status <> 'deleted' AND retired_at IS NULL ORDER BY created_at`, ...rows.map((r) => r.id));
  return rows.map((p) => ({
    id: p.id, title: p.title, description: p.description, type: p.type, priceCents: p.price_cents, currency: p.currency, artwork: p.artwork,
    tags: parseJson(p.tags, []), includes: parseJson(p.metadata, {}).includes || [], published: Boolean(p.published), salesPaused: Boolean(p.sales_paused),
    deleted: Boolean(p.deleted_at), path: productPath(p), preview: p.preview || null, createdAt: p.created_at,
    facets: facets[p.id] || {}, bpm: p.bpm_min ? [p.bpm_min, p.bpm_max] : null, specs: parseJson(p.metadata, {}).specs || {},
    // Values the product's own words point to and it doesn't have yet, for the creator to accept or ignore.
    suggestions: Object.fromEntries(Object.entries(suggestFacets(p.type, `${p.title} ${p.description} ${parseJson(p.tags, []).join(" ")}`))
      .map(([f, vs]) => [f, vs.filter((v) => !((facets[p.id] || {})[f] || []).includes(v))]).filter(([, vs]) => vs.length)),
    files: files.filter((f) => f.product_id === p.id && f.active && !f.version_id).map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.size_bytes, status: f.status, note: f.status_note || "" })),
    packFiles: files.filter((f) => f.product_id === p.id && f.active && f.version_id).length
  }));
}

export const listProjectProductRows = (db, projectId) => all(db, "SELECT * FROM products WHERE project_id = ? AND source = 'studio' ORDER BY deleted_at IS NOT NULL, created_at DESC", projectId);

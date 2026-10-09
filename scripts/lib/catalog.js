// Generates db/catalog.sql: upserts every product in data/products.js into the store database, so checkout charges
// exactly the price the pages show. Deterministic (timestamps come from SQLite at apply time, not from this script).
// Products removed from data/ are unpublished and marked deleted, never dropped: orders and entitlements point at them.
// Only rows with source 'catalog' are touched: products made elsewhere (the Studio, later) are never overwritten.
const crypto = require("crypto");
// The store's controlled vocabulary (an ES module; Node 22 requires it directly).
const V = require("../../server/discovery/vocabulary.js");

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const COLS = ["id", "title", "description", "type", "price_cents", "currency", "artwork", "preview", "tags", "release_id", "metadata", "featured", "published", "max_quantity", "project_id", "pacs",
  "search_text", "bpm_min", "bpm_max", "released_at"];

// A catalog product's structured details, cleaned against the vocabulary: { facets, bpm, specs, errors }. Without its own
// genre, a product takes its project's genres (data/projects.js), when its kind has genres at all.
function details(p, projects = []) {
  const own = V.cleanFacets(p.type, p.facets || {});
  const facets = { ...own.facets };
  const project = projects.find((x) => x.id === p.project);
  if (!facets.genre && V.schemaOf(p.type).facets.includes("genre") && project) {
    const genres = [...new Set((project.genres || []).map((g) => V.canonical("genre", g)).filter(Boolean))];
    if (genres.length) facets.genre = genres;
  }
  const bpm = V.cleanBpm(p.type, p.bpm);
  const specs = V.cleanSpecs(p.type, p.specs || {});
  return { facets, bpm: bpm.bpm, specs: specs.specs, by: project ? project.name : "", errors: [...own.errors, ...bpm.errors, ...specs.errors] };
}

function row(p, types, projects) {
  const type = types[p.type] || {};
  const d = details(p, projects);
  const r = {
    id: p.id,
    title: p.title,
    description: p.description || "",
    type: p.type,
    price_cents: Math.round(Number(p.price) * 100),
    currency: p.currency,
    artwork: p.image ? "/" + p.image.src.replace(/^\/+/, "") : null,
    preview: p.preview && p.preview.file ? `/media/previews/${p.preview.file}` : null,
    tags: JSON.stringify(p.tags || []),
    release_id: p.release || null,
    metadata: JSON.stringify({ ...(p.metadata || {}), ...(p.includes ? { includes: p.includes } : {}), ...(p.hue !== undefined ? { hue: p.hue } : {}),
      ...(Object.keys(d.specs).length ? { specs: d.specs } : {}) }),
    featured: p.featured ? 1 : 0,
    published: p.draft ? 0 : 1,
    max_quantity: type.maxQuantity || 1,
    project_id: p.project || null,
    pacs: JSON.stringify(p.pacs || []),
    search_text: V.searchText({ title: p.title, description: p.description, tags: p.tags || [], facets: d.facets, by: d.by }),
    bpm_min: d.bpm ? d.bpm[0] : null,
    bpm_max: d.bpm ? d.bpm[1] : null,
    released_at: p.released ? `${p.released}T00:00:00.000Z` : null
  };
  r.facets = d.facets;
  r.catalog_hash = crypto.createHash("sha256").update(JSON.stringify(COLS.map((c) => r[c]))).digest("hex").slice(0, 16);
  return r;
}

// Checks the product data the store depends on; returns error strings.
function validate(products, types, projects = []) {
  const errors = [];
  for (const p of products) {
    for (const e of details(p, projects).errors) errors.push(`product ${p.id}: ${e} (server/discovery/vocabulary.js)`);
    if (p.released !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(p.released)) errors.push(`product ${p.id}: released must be "YYYY-MM-DD"`);
    if (!types[p.type]) errors.push(`product ${p.id}: type "${p.type}" is not in data/product-types.js`);
    if (typeof p.price !== "number" || !(p.price >= 0) || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 1e-6)
      errors.push(`product ${p.id}: price must be a number with at most 2 decimals`);
    if (!/^[A-Z]{3}$/.test(p.currency)) errors.push(`product ${p.id}: currency must be a 3-letter code`);
    if (p.preview && !/^[\w.\- ()]+\.(mp3|m4a|ogg|wav)$/i.test(p.preview.file || "")) errors.push(`product ${p.id}: preview.file must be an audio file name`);
    if (p.tags && (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string"))) errors.push(`product ${p.id}: tags must be a list of words`);
  }
  return errors;
}

function catalogSql(products, types, projects = []) {
  const rows = products.map((p) => row(p, types, projects));
  // Facet rows follow their product, and only while it is a catalog product (a Studio row with the same id is never touched).
  const isCatalog = (id) => `EXISTS (SELECT 1 FROM products WHERE id = ${q(id)} AND source = 'catalog')`;
  const facetSql = rows.flatMap((r) => [
    `DELETE FROM product_facets WHERE product_id = ${q(r.id)} AND ${isCatalog(r.id)};`,
    ...Object.entries(r.facets).flatMap(([facet, values]) => values.map((value) =>
      `INSERT OR IGNORE INTO product_facets (product_id, facet, value) SELECT ${q(r.id)}, ${q(facet)}, ${q(value)} WHERE ${isCatalog(r.id)};`))
  ]);
  const cols = [...COLS, "catalog_hash"];
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  const out = [
    "-- Catalog sync: every product in data/products.js. Generated by scripts/build.js; don't edit. Applied by the deploy",
    "-- (and scripts/dev.js locally) after the migrations. Re-applying it is harmless.",
    ...rows.map((r) =>
      `INSERT INTO products (${cols.join(", ")}, created_at, updated_at) VALUES (${cols.map((c) => q(r[c])).join(", ")}, ${NOW}, ${NOW})\n` +
      `  ON CONFLICT (id) DO UPDATE SET ${updates}, deleted_at = NULL, updated_at = ${NOW}\n` +
      `  WHERE products.source = 'catalog' AND products.admin_managed = 0 AND (products.catalog_hash IS NOT excluded.catalog_hash OR products.deleted_at IS NOT NULL);`),
    `UPDATE products SET published = 0, deleted_at = ${NOW}, updated_at = ${NOW} WHERE source = 'catalog' AND deleted_at IS NULL${rows.length ? ` AND id NOT IN (${rows.map((r) => q(r.id)).join(", ")})` : ""};`,
    ...facetSql
  ];
  return out.join("\n") + "\n";
}

module.exports = { catalogSql, validate, details, q, NOW };

// Product facet rows (D1 product_facets): reading them for a set of products and replacing a Studio product's set.
// Catalog products get theirs from the catalog sync (db/catalog.sql). Values are canonical vocabulary values only.
// Rows have an origin: 'creator' (what the creator or the catalog chose) or 'derived' (worked out from the product's
// published files, contents.js). Writing the creator's set never removes a derived row, and a value both have is the
// creator's.
import { all, first, run, stmt, parseJson } from "../lib/db.js";
import { searchText } from "./vocabulary.js";

// { productId: { facet: [values] } } for the given products, in one query. creatorOnly: just what the creator chose
// (the Studio's own form), not what the files say.
export async function facetsOf(db, ids, { creatorOnly = false } = {}) {
  const out = {};
  if (!ids.length) return out;
  const rows = await all(db, `SELECT product_id, facet, value FROM product_facets WHERE product_id IN (SELECT value FROM json_each(?))
    ${creatorOnly ? "AND origin = 'creator'" : ""} ORDER BY facet, value`, JSON.stringify(ids));
  for (const r of rows) ((out[r.product_id] ||= {})[r.facet] ||= []).push(r.value);
  return out;
}

// Re-inserts a product's derived rows from its stored contents (contents.js), after its own rows were rewritten.
export const restoreDerivedStmt = (db, productId) => stmt(db, `INSERT OR IGNORE INTO product_facets (product_id, facet, value, origin)
  SELECT c.product_id, f.key, v.key, 'derived' FROM product_contents c, json_each(c.summary, '$.facets') f, json_each(f.value) v
  WHERE c.product_id = ? AND c.indexed = 1`, productId);

// Statements that make a product's own (creator) facet rows exactly `facets` (for a db.batch with the product's own
// update); the files' derived rows stay, and come back for a value the creator no longer chooses.
export const replaceFacetsStmts = (db, productId, facets) => [
  stmt(db, "DELETE FROM product_facets WHERE product_id = ? AND origin = 'creator'", productId),
  ...Object.entries(facets).flatMap(([facet, values]) => values.map((value) =>
    stmt(db, "INSERT OR REPLACE INTO product_facets (product_id, facet, value, origin) VALUES (?, ?, ?, 'creator')", productId, facet, value))),
  restoreDerivedStmt(db, productId)
];

// Rewrites one product's search text from its current title, description, tags, facets and maker (after an admin edit).
export async function refreshSearchText(db, productId) {
  const p = await first(db, `SELECT p.*, j.name AS project_name, c.name AS creator_name FROM products p LEFT JOIN projects j ON j.id = p.project_id
    LEFT JOIN creators c ON c.id = j.creator_id WHERE p.id = ?`, productId);
  if (!p) return;
  const facets = (await facetsOf(db, [productId]))[productId] || {};
  const text = searchText({ title: p.title, description: p.description, tags: parseJson(p.tags, []), facets,
    by: [p.project_name, p.source === "studio" ? p.creator_name : ""].filter(Boolean).join(" ") });
  await run(db, "UPDATE products SET search_text = ? WHERE id = ?", text, productId);
}

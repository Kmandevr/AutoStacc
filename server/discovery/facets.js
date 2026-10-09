// Product facet rows (D1 product_facets): reading them for a set of products and replacing a Studio product's set.
// Catalog products get theirs from the catalog sync (db/catalog.sql). Values are canonical vocabulary values only.
import { all, first, run, stmt, parseJson } from "../lib/db.js";
import { searchText } from "./vocabulary.js";

// { productId: { facet: [values] } } for the given products, in one query.
export async function facetsOf(db, ids) {
  const out = {};
  if (!ids.length) return out;
  const rows = await all(db, "SELECT product_id, facet, value FROM product_facets WHERE product_id IN (SELECT value FROM json_each(?)) ORDER BY facet, value",
    JSON.stringify(ids));
  for (const r of rows) ((out[r.product_id] ||= {})[r.facet] ||= []).push(r.value);
  return out;
}

// Statements that make a product's facet rows exactly `facets` (for a db.batch with the product's own update).
export const replaceFacetsStmts = (db, productId, facets) => [
  stmt(db, "DELETE FROM product_facets WHERE product_id = ?", productId),
  ...Object.entries(facets).flatMap(([facet, values]) => values.map((value) =>
    stmt(db, "INSERT OR IGNORE INTO product_facets (product_id, facet, value) VALUES (?, ?, ?)", productId, facet, value)))
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

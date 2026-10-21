// The API router and the catalog generator (data/products.js -> db/catalog.sql), including the empty catalog first-party
// projects now have (their products are made in the Studio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createRouter } from "../../server/lib/router.js";

const require = createRequire(import.meta.url);
const { catalogSql, validate } = require("../../scripts/lib/catalog.js");

test("router matches methods and params, answers 405 for a wrong method", () => {
  const h = () => {};
  const r = createRouter([[["GET", "/api/orders/:orderId", h], ["POST", "/api/orders/:orderId/reconcile", h]]]);
  assert.deepEqual(r.match("GET", "/api/orders/ord_1").params, { orderId: "ord_1" });
  assert.equal(r.match("DELETE", "/api/orders/ord_1").methodNotAllowed, true);
  assert.equal(r.match("GET", "/api/orders/a/b"), null);
  assert.equal(r.match("GET", "/api/orders/%E0%A4%A").params.orderId, "");
});

const types = { music: { label: "Music", maxQuantity: 1 } };
const product = { id: "x", title: "It's 'quoted'", type: "music", price: 9.99, currency: "USD", description: "d" };

test("catalog SQL escapes text, stores cents and keeps removed products as deleted", () => {
  const sql = catalogSql([product], types);
  assert.match(sql, /'It''s ''quoted'''/);
  assert.match(sql, /, 999, 'USD',/);
  assert.match(sql, /deleted_at = strftime/);
  assert.match(sql, /id NOT IN \('x'\)/);
  assert.equal(catalogSql([product], types), sql, "deterministic");
});

test("catalog validation catches bad types, prices and previews", () => {
  assert.deepEqual(validate([product], types), []);
  assert.equal(validate([{ ...product, type: "nope" }], types).length, 1);
  assert.equal(validate([{ ...product, price: 9.999 }], types).length, 1);
  assert.equal(validate([{ ...product, price: -1 }], types).length, 1);
  assert.equal(validate([{ ...product, preview: { file: "../x.mp3" } }], types).length, 1);
});

test("an empty catalog (first-party products are made in the Studio) unpublishes and deletes only catalog rows", () => {
  const sql = catalogSql([], types);
  assert.doesNotMatch(sql, /INSERT INTO products/);
  assert.doesNotMatch(sql, /NOT IN \(\)/, "never invalid SQL for an empty list");
  assert.match(sql, /UPDATE products SET published = 0, deleted_at = strftime\([^)]*\), updated_at = strftime\([^)]*\) WHERE source = 'catalog' AND deleted_at IS NULL;/);
  // Studio products (source 'studio', first-party creators' included) are never touched by the sync.
  for (const line of sql.split("\n").filter((l) => /^(UPDATE|DELETE)/.test(l))) assert.match(line, /source = 'catalog'/, line);
});

test("the real data/products.js sells nothing of its own and still validates", () => {
  const { loadData } = require("../../scripts/lib/data.js");
  const data = loadData();
  assert.equal(data.products.length, 0, "first-party products are made in the Studio (owner, 2026-10-21)");
  assert.deepEqual(validate(data.products, data.productTypes, data.projects), []);
});

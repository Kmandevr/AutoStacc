// The API router, and the retired code-based product system (#176): db/catalog.sql syncs no products, Stacclets or Pacs,
// migration 0042 retires the rows the old sync left (source 'catalog' only), and the SQL helpers escape text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createRouter } from "../../server/lib/router.js";

const require = createRequire(import.meta.url);
const { q, NOW } = require("../../scripts/lib/catalog.js");
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("router matches methods and params, answers 405 for a wrong method", () => {
  const h = () => {};
  const r = createRouter([[["GET", "/api/orders/:orderId", h], ["POST", "/api/orders/:orderId/reconcile", h]]]);
  assert.deepEqual(r.match("GET", "/api/orders/ord_1").params, { orderId: "ord_1" });
  assert.equal(r.match("DELETE", "/api/orders/ord_1").methodNotAllowed, true);
  assert.equal(r.match("GET", "/api/orders/a/b"), null);
  assert.equal(r.match("GET", "/api/orders/%E0%A4%A").params.orderId, "");
});

test("the catalog SQL helpers escape text and leave numbers and NULL bare", () => {
  assert.equal(q("It's 'quoted'"), "'It''s ''quoted'''");
  assert.equal(q(999), "999");
  assert.equal(q(null), "NULL");
  assert.equal(q(undefined), "NULL");
  assert.match(NOW, /^strftime\(/, "timestamps come from SQLite, so the generated file stays deterministic");
});

test("db/catalog.sql syncs creators, projects and polls only: never products, Stacclets or Pacs", () => {
  const sql = read("db/catalog.sql");
  assert.match(sql, /INSERT INTO creators /);
  assert.match(sql, /INSERT INTO projects /);
  assert.doesNotMatch(sql, /\b(INTO|UPDATE|FROM) (products|product_facets|stacclets|pacs)\b/);
  for (const f of ["products", "stacclets", "pacs"]) assert.equal(existsSync(new URL(`../../data/${f}.js`, import.meta.url)), false, `data/${f}.js`);
});

test("migration 0042 unpublishes and soft-deletes only what the old sync made, and drops nothing", () => {
  const sql = read("db/migrations/0042_retire_catalog_products.sql").replace(/^--.*$/gm, "");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements.map((s) => s.match(/^UPDATE (\w+)/)[1]), ["products", "stacclets", "pacs"]);
  for (const s of statements) {
    assert.match(s, /SET published = 0, deleted_at = strftime/);
    assert.match(s, /WHERE source = 'catalog' AND deleted_at IS NULL$/, "Studio rows and already-deleted rows are left alone");
  }
  assert.doesNotMatch(sql, /\b(DELETE|DROP)\b/i, "forward-only: orders and entitlements still point at these rows");
});

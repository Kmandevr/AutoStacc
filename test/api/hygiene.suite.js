// API hygiene: malformed bodies, wrong content types, oversize requests, unexpected types, unknown routes and methods,
// cross-site requests, and the privacy-friendly analytics endpoint.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";

export default (ctx) => describe("api hygiene", () => {
  test("broken and unexpected bodies get 4xx, never 500", async () => {
    const c = new Client(ctx.mock.url);
    const raw = (body, type = "application/json") => c.req("POST", "/api/checkout", { raw: body, headers: { "Content-Type": type } });
    assert.equal((await raw("{not json")).status, 400);
    assert.equal((await raw("[1,2,3]")).status, 400);
    assert.equal((await raw("null")).status, 400);
    assert.equal((await raw('"text"')).status, 400);
    assert.equal((await raw("items=1", "application/x-www-form-urlencoded")).status, 415);
    assert.equal((await raw(JSON.stringify({ items: [{ productId: "x".repeat(20000) }] }))).status, 413);
    assert.equal((await c.post("/api/checkout", {})).status, 400);
    assert.equal((await c.post("/api/checkout", { items: { productId: "wallpapers" } })).status, 400);
    assert.equal((await c.post("/api/cart/price", { items: [{ productId: { $ne: null } }] })).status, 400);
    assert.equal((await c.post("/api/cart/price", { items: Array.from({ length: 50 }, (_, i) => ({ productId: "p" + i })) })).status, 400);
    assert.equal((await c.post("/api/guest/key", { key: ["array"] })).status, 400);
    assert.equal((await c.post("/api/downloads", { fileId: { toString: 1 } })).status, 401);
  });

  test("unknown routes, ids and methods", async () => {
    const c = new Client(ctx.mock.url);
    assert.equal((await c.get("/api/nope")).status, 404);
    assert.equal((await c.get("/api/orders/ord_aaaaaaaaaaaaaaaaaaaaaaaaaa")).status, 404);
    assert.equal((await c.get("/api/orders/1 OR 1=1")).status, 404);
    assert.equal((await c.get("/api/products/%E0%A4%A")).status, 400);
    assert.equal((await c.req("DELETE", "/api/checkout")).status, 405);
    assert.equal((await c.get("/api/checkout")).status, 405);
  });

  test("state-changing requests from other sites are refused", async () => {
    for (const origin of ["https://evil.example", "null", ""]) {
      const c = new Client(ctx.mock.url, { origin });
      const r = await c.post("/api/checkout", { email: "a@b.dev", items: [{ productId: "wallpapers" }] });
      assert.equal(r.status, 403, origin);
      assert.equal(r.data.error.code, "bad_origin");
    }
    // Better Auth applies its own origin check to account actions.
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    assert.equal((await evil.post("/api/auth/sign-in/email", { email: "a@b.dev", password: "whatever-pass" })).status, 403);
  });

  test("API responses are never cached or indexed", async () => {
    const r = await new Client(ctx.mock.url).get("/api/account");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  });

  test("analytics accepts only known events and stores only daily counts", async () => {
    const c = new Client(ctx.mock.url);
    assert.equal((await c.post("/api/events", { event: "product_view", subject: "wallpapers" })).status, 202);
    assert.equal((await c.post("/api/events", { event: "steal_cookies", subject: "x" })).data.ok, false);
    assert.equal((await c.post("/api/events", { event: "product_view", subject: "<script>" })).status, 202);
    const rows = sql(ctx.mock.stateDir, "SELECT * FROM analytics_daily");
    assert.ok(rows.some((r) => r.event === "product_view" && r.subject === "wallpapers"));
    assert.ok(!rows.some((r) => r.event === "steal_cookies" || /script/.test(r.subject)));
    assert.deepEqual(Object.keys(rows[0]).sort(), ["count", "day", "event", "subject"]);
  });

  test("live state and catalog never leak internal fields", async () => {
    const r = await new Client(ctx.mock.url).get("/api/products");
    for (const p of r.data.products) for (const k of ["r2_key", "catalog_hash", "sales_paused", "published", "deleted_at"]) assert.ok(!(k in p), k);
    const lib = JSON.stringify((await new Client(ctx.mock.url).get("/api/library")).data);
    assert.doesNotMatch(lib, /r2_key|dev\//);
  });

  test("store endpoints are rate limited per client", async () => {
    const c = new Client(ctx.mock.url);
    const codes = [];
    for (let i = 0; i < 15; i++) codes.push((await c.post("/api/checkout", { email: "spam@test.dev", items: [{ productId: "no-such-thing" }] })).status);
    assert.ok(codes.includes(429), codes.join(","));
    const keys = [];
    for (let i = 0; i < 12; i++) keys.push((await c.post("/api/guest/key", { key: "ord_aaaaaaaaaaaaaaaaaaaaaaaaaa." + "b".repeat(52) })).status);
    assert.ok(keys.includes(429), keys.join(","));
    // Other clients are unaffected.
    assert.equal((await new Client(ctx.mock.url).post("/api/cart/price", { items: [{ productId: "wallpapers" }] })).status, 200);
  });
});

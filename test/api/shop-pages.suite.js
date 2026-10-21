// Product pages over HTTP as a browser or crawler sees them: /shop/<id> for every creator's product (indexable with
// canonical, Open Graph and Product JSON-LD only for a trusted creator; an Offer only while it is for sale), the 404
// page for hidden or unknown products, the 301s from /product?p=<id> and unclean addresses, and /sitemap-shop.xml.
// Its own test creators, projects and products (inserted here, never in data/), so other suites never see them.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";

const NOW = new Date().toISOString();
const q = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const creator = (id, trusted) => `INSERT INTO creators (id, slug, name, source, trusted, created_at, updated_at)
  VALUES (${q(id)}, ${q(id)}, ${q(`Maker ${id}`)}, 'studio', ${trusted}, ${q(NOW)}, ${q(NOW)})`;
const project = (id, by) => `INSERT INTO projects (id, name, published, creator_id, slug, source, created_at, updated_at)
  VALUES (${q(id)}, ${q(`Project ${id}`)}, 1, ${q(by)}, ${q(id)}, 'studio', ${q(NOW)}, ${q(NOW)})`;
const product = (p) => `INSERT INTO products (id, title, description, type, price_cents, currency, tags, metadata, published, sales_paused,
  max_quantity, project_id, pacs, source, artwork, created_at, updated_at) VALUES (${q(p.id)}, ${q(p.title || "Night Drive Loops")},
  ${q(p.description ?? "Twelve loops.")}, 'sample-pack', ${p.price ?? 1500}, 'USD', '["loops"]', '{}', ${p.published ?? 1}, ${p.paused ?? 0}, 1,
  ${q(p.project)}, '[]', 'studio', ${q(p.artwork ?? null)}, ${q(NOW)}, ${q(NOW)})`;

const ldOf = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])["@graph"];
const productLd = (html) => ldOf(html).find((x) => x["@type"] === "Product");

export default (ctx) => describe("shop product pages", () => {
  let c;
  before(() => {
    c = new Client(ctx.mock.url);
    sql(ctx.mock.stateDir, [creator("sp-trusted", 1), creator("sp-new", 0), project("sp-music", "sp-trusted"), project("sp-beats", "sp-new"),
      product({ id: "sp-trusted-loops", project: "sp-music", artwork: "/img/og.png" }),
      product({ id: "sp-trusted-free", title: "Free Kit", project: "sp-music", price: 0 }),
      product({ id: "sp-trusted-paused", title: "Paused Kit", project: "sp-music", paused: 1 }),
      product({ id: "sp-trusted-hidden", title: "Draft Kit", project: "sp-music", published: 0 }),
      product({ id: "sp-new-beats", title: "Beats </script><b>x</b>", description: "<img src=x onerror=alert(1)>", project: "sp-beats" })
    ].join(";\n"));
  });

  test("a trusted creator's product: indexable, names its creator and project, Product JSON-LD with an Offer", async () => {
    const r = await c.get("/shop/sp-trusted-loops");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.ok(r.headers.get("content-security-policy"), "the page sends its own security headers");
    const html = r.data;
    assert.match(html, /<title>Night Drive Loops · AutoStacc<\/title>/);
    assert.match(html, /<link rel="canonical" href="[^"]+\/shop\/sp-trusted-loops">/);
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, /<meta property="og:type" content="product">/);
    assert.match(html, /<meta property="product:price:amount" content="15\.00">/);
    assert.match(html, /href="\/sp-trusted\/sp-music">Project sp-music<\/a> from <a href="\/sp-trusted">Maker sp-trusted<\/a>/);
    assert.match(html, /id="product-app"[^>]*data-product="sp-trusted-loops"/);
    assert.match(html, /data-reviews="sp-trusted-loops"/);
    const ld = productLd(html);
    assert.equal(ld.sku, "sp-trusted-loops");
    assert.equal(ld.brand.name, "Project sp-music");
    assert.deepEqual([ld.offers.price, ld.offers.priceCurrency, ld.offers.availability], ["15.00", "USD", "https://schema.org/InStock"]);
    assert.match(ld.image, /\/img\/og\.png$/);
    assert.ok(ldOf(html).some((x) => x["@type"] === "WebPage" && x.breadcrumb), "breadcrumbs for an indexable page");
    const head = await c.req("HEAD", "/shop/sp-trusted-loops");
    assert.equal(head.status, 200);
    assert.equal(head.data, "");
  });

  test("no Offer and no price tags while a product isn't for sale (free or paused)", async () => {
    for (const id of ["sp-trusted-free", "sp-trusted-paused"]) {
      const html = (await c.get(`/shop/${id}`)).data;
      assert.equal(productLd(html).offers, undefined, id);
      assert.doesNotMatch(html, /product:price:amount/, id);
    }
    assert.match((await c.get("/shop/sp-trusted-paused")).data, /Not on sale right now/);
  });

  test("an untrusted creator's product: noindex, no canonical, no structured product, labelled, and every value escaped", async () => {
    const r = await c.get("/shop/sp-new-beats");
    assert.equal(r.status, 200);
    assert.match(r.data, /<meta name="robots" content="noindex, follow">/);
    assert.doesNotMatch(r.data, /rel="canonical"/);
    assert.equal(productLd(r.data), undefined);
    assert.match(r.data, /Unverified creator/);
    assert.doesNotMatch(r.data, /<b>x<\/b>|<img src=x/, "creator text never becomes markup");
    assert.equal((r.data.match(/<\/script>/g) || []).length, (r.data.match(/<script/g) || []).length, "no stray script close");
  });

  test("hidden, unknown and malformed products answer a noindex 404 that offers nothing to buy", async () => {
    for (const id of ["sp-trusted-hidden", "sp-nothing-here"]) {
      const r = await c.get(`/shop/${id}`);
      assert.equal(r.status, 404, id);
      assert.match(r.data, /id="product-app"[\s\S]*class="msg error"/);
      assert.match(r.data, /noindex/);
      assert.doesNotMatch(r.data, /data-buy|data-claim|Draft Kit/);
    }
    assert.notEqual((await c.get("/shop/a%20b")).status, 200);
  });

  test("the old /product address and unclean shop addresses answer a 301 to the clean one", async () => {
    const to = async (p) => {
      const r = await c.get(p);
      assert.equal(r.status, 301, p);
      return new URL(r.headers.get("location")).pathname + new URL(r.headers.get("location")).search;
    };
    assert.equal(await to("/product?p=sp-trusted-loops"), "/shop/sp-trusted-loops");
    assert.equal(await to("/product?p=SP-Trusted-Loops"), "/shop/sp-trusted-loops");
    assert.equal(await to("/product"), "/shop");
    assert.equal(await to("/product?p=../../admin"), "/shop");
    assert.equal(await to("/shop/SP-TRUSTED-LOOPS"), "/shop/sp-trusted-loops");
    assert.equal(await to("/shop/sp-trusted-loops/"), "/shop/sp-trusted-loops");
    assert.equal(await to("/shop/sp-trusted-loops.html"), "/shop/sp-trusted-loops");
    assert.equal((await c.get("/shop")).status, 200, "the store page itself stays");
  });

  test("the store API points every product at its page, and the shop sitemap lists only trusted creators' visible products", async () => {
    const api = await c.get("/api/products/sp-new-beats");
    assert.equal(api.data.product.path, "/shop/sp-new-beats");
    const r = await c.get("/sitemap-shop.xml");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/xml/);
    const locs = [...r.data.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    for (const id of ["sp-trusted-loops", "sp-trusted-free", "sp-trusted-paused"]) assert.ok(locs.includes(`/shop/${id}`), id);
    for (const id of ["sp-new-beats", "sp-trusted-hidden"]) assert.ok(!locs.includes(`/shop/${id}`), id);
  });
});

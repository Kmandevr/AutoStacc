// The store from what packs contain (docs/packs.md, Phase 7): publishing a Pac version works out what the product's
// files contain; the store's filters and search find it on any one matching file; a creator's own details are kept
// apart and always win; an unpublished version never counts; and "What's inside" is public for products on sale only,
// without a storage key, a hash or a link.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import * as P from "../support/packs.js";

const { S, caseZip, build } = P;

export default (ctx) => describe("packs in the store", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const derived = (pid) => db(`SELECT facet, value FROM product_facets WHERE product_id = '${pid}' AND origin = 'derived' ORDER BY facet, value`);
  const search = async (q) => (await new Client(base()).get(`/api/store/search?${q}`)).data.products.map((p) => p.id);

  async function onSale(tag) {
    const who = await P.creatorWithProducts(base(), tag);
    const product = who.products[0];
    db(`UPDATE products SET price_cents = 0 WHERE id = '${product.id}'`);
    const { version } = await build(who.c, product.id, caseZip("pack-basic"));
    assert.equal(derived(product.id).length, 0, "a version that isn't published counts for nothing");
    assert.equal((await who.c.post(`${S}/versions/${version.id}/publish`, {})).status, 200);
    const put = await who.c.req("PATCH", `/api/studio/products/${product.id}`, { body: { published: true } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    return { ...who, product, version };
  }

  test("publishing works out what the files contain; the store finds the product on any one matching file", async () => {
    const { product } = await onSale("st-derive");
    const rows = derived(product.id);
    const has = (facet, value) => rows.some((r) => r.facet === facet && r.value === value);
    for (const [f, v] of [["format", "wav"], ["format", "flac"], ["format", "midi"], ["plugin", "vital"], ["sample-rate", "44100"], ["sample-rate", "48000"], ["bit-depth", "24"]]) {
      assert.ok(has(f, v), `${f}=${v} from the files`);
    }
    // One 48 kHz file is enough; a value no file has finds nothing.
    assert.ok((await search("sample-rate=48000")).includes(product.id));
    assert.ok((await search("plugin=vital")).includes(product.id));
    assert.ok(!(await search("sample-rate=96000")).includes(product.id));
    const res = await new Client(base()).get("/api/store/search?category=sample-pack");
    const groups = res.data.facets.map((g) => g.id);
    assert.ok(groups.includes("sample-rate") && groups.includes("bit-depth"), "the derived filters are offered");
    const loops = (await new Client(base()).get(`/api/store/search?bpm_min=120&bpm_max=130`)).data.products.map((p) => p.id);
    const contents = db(`SELECT bpm_min, bpm_max FROM product_contents WHERE product_id = '${product.id}'`)[0];
    if (contents.bpm_min) assert.ok(loops.includes(product.id) === (contents.bpm_min <= 130 && contents.bpm_max >= 120), "the files' tempo range filters when the creator gave none");
  });

  test("a creator's own details stay theirs and win; derived values come back when the creator drops one", async () => {
    const { c, product } = await onSale("st-creator");
    const patch = (facets) => c.req("PATCH", `/api/studio/products/${product.id}`, { body: { facets } });
    assert.equal((await patch({ format: ["wav"], genre: ["techno"] })).status, 200);
    assert.deepEqual(db(`SELECT origin FROM product_facets WHERE product_id = '${product.id}' AND facet = 'format' AND value = 'wav'`), [{ origin: "creator" }]);
    assert.ok(derived(product.id).some((r) => r.facet === "format" && r.value === "flac"), "the files' other values stay");
    const studio = (await c.get(`/api/studio/projects/${product.projectId || db(`SELECT project_id FROM products WHERE id = '${product.id}'`)[0].project_id}/products`)).data.products.find((p) => p.id === product.id);
    assert.deepEqual(studio.facets.format, ["wav"], "the Studio form shows only what the creator chose");
    assert.equal(studio.facets["sample-rate"], undefined);
    assert.equal((await patch({ genre: ["techno"] })).status, 200);
    assert.deepEqual(db(`SELECT origin FROM product_facets WHERE product_id = '${product.id}' AND facet = 'format' AND value = 'wav'`), [{ origin: "derived" }]);
    // Creators can't set a derived facet by hand.
    assert.equal((await patch({ "sample-rate": ["96000"] })).status, 400);
  });

  test("What's inside: folders and files for a product on sale, nothing private, a draft version never shown", async () => {
    const { c, product } = await onSale("st-inside");
    const anon = new Client(base());
    const res = await anon.get(`/api/products/${product.id}/contents`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.match(res.headers.get("cache-control"), /public, max-age=60/);
    assert.equal(res.data.files, 7);
    assert.ok(res.data.folders.some((f) => f.path === "Drums/Kicks" && f.files.some((x) => x.name === "Kick 01.wav")));
    assert.ok(res.data.facets.some((g) => g.id === "sample-rate"));
    assert.ok(!/r2_key|blob|sha256|pf_|as_|http/.test(JSON.stringify(res.data)), "no keys, hashes, ids or links");
    // A new version that isn't published yet changes nothing customers see.
    const next = (await build(c, product.id, caseZip("pack-revision"))).version;
    assert.equal(next.status, "ready");
    const again = await anon.get(`/api/products/${product.id}/contents`);
    assert.ok(!again.data.folders.some((f) => f.files.some((x) => x.name === "Changelog.txt")));
    // Off sale: not there for anyone.
    await c.req("PATCH", `/api/studio/products/${product.id}`, { body: { published: false } });
    assert.equal((await anon.get(`/api/products/${product.id}/contents`)).status, 404);
  });
});

// Store discovery against a real local store (D1 through the API): filter semantics (OR within a group, AND between),
// counts, price boundaries with running sales, sorting, paging without duplicates, search with filters, missing
// metadata, invalid input, recommendations (hard limits first, cold start, new products, diversity, ownership,
// dismissals, confirmed purchases only), wishlists and their boundaries, Studio metadata checks, and timings on a
// synthetic catalog of a few thousand products. Products here belong to test projects, so other suites never see them.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, sql, sqlAll, verifiedUser } from "../support/client.js";

const NOW = new Date().toISOString();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// One product row plus its facet rows, as SQL.
function product(p) {
  const facets = p.facets || {};
  const text = [p.title, p.description || "", ...Object.values(facets).flat(), p.by || ""].join(" ").toLowerCase();
  return [
    `INSERT INTO products (id, title, description, type, price_cents, currency, tags, metadata, featured, published, sales_paused, max_quantity, project_id, pacs, source,
      search_text, bpm_min, bpm_max, released_at, created_at, updated_at)
     VALUES (${q(p.id)}, ${q(p.title)}, ${q(p.description || "")}, ${q(p.type || "sample-pack")}, ${p.price ?? 1000}, 'USD', '[]', '{}', 0, ${p.published === false ? 0 : 1},
      ${p.paused ? 1 : 0}, 1, ${q(p.project || "dx-one")}, '[]', 'catalog', ${q(text)}, ${p.bpm ? p.bpm[0] : "NULL"}, ${p.bpm ? p.bpm[1] : "NULL"},
      ${q(p.released || ago(200))}, ${q(ago(300))}, ${q(NOW)})`,
    ...Object.entries(facets).flatMap(([f, vs]) => vs.map((v) => `INSERT INTO product_facets (product_id, facet, value) VALUES (${q(p.id)}, ${q(f)}, ${q(v)})`))
  ].join(";\n");
}

const CATALOG = [
  { id: "dx-loops-house", title: "Deep House Loops", project: "dx-one", price: 1500, facets: { genre: ["house"], contents: ["loops"], format: ["wav"], daw: ["ableton-live"] }, bpm: [120, 124] },
  { id: "dx-oneshots-techno", title: "Techno One-Shots", project: "dx-one", price: 900, facets: { genre: ["techno"], contents: ["one-shots", "drum-hits"], format: ["wav"] } },
  { id: "dx-presets-serum", title: "Serum Bass Bank", project: "dx-two", type: "presets", price: 2000, facets: { genre: ["dubstep"], contents: ["presets"], plugin: ["serum"] } },
  { id: "dx-midi-pop", title: "Pop MIDI Chords", project: "dx-two", price: 1000, facets: { genre: ["pop"], contents: ["midi"], format: ["midi"], daw: ["any-daw"] }, bpm: [90, 110] },
  { id: "dx-free-kit", title: "Free Starter Kit", project: "dx-three", price: 0, facets: { genre: ["house"], contents: ["one-shots"], format: ["wav"] } },
  { id: "dx-bare", title: "Bare Product Without Details", project: "dx-three", price: 500 },
  { id: "dx-new-ambient", title: "Ambient Textures", project: "dx-three", price: 1200, released: ago(3), facets: { genre: ["ambient"], contents: ["textures"], format: ["wav"] } },
  { id: "dx-hidden", title: "Hidden Draft Loops", project: "dx-one", price: 100, published: false, facets: { contents: ["loops"] } }
];

export default (ctx) => describe("store discovery", () => {
  let base, c;
  const search = async (qs) => {
    const r = await c.get(`/api/store/search?${qs}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  const ids = (d) => d.products.map((p) => p.id);
  const scoped = "creator=dx-one,dx-two,dx-three";

  before(() => {
    base = ctx.mock.url;
    c = new Client(base);
    sql(ctx.mock.stateDir, [
      ...["dx-one", "dx-two", "dx-three"].map((id, i) => `INSERT OR IGNORE INTO projects (id, name, published, created_at, updated_at) VALUES (${q(id)}, 'Test Project ${i + 1}', 1, ${q(NOW)}, ${q(NOW)})`),
      ...CATALOG.map(product)
    ].join(";\n"));
  });

  test("OR within a group, AND between groups, and counts that say what each choice would give", async () => {
    const or = await search(`${scoped}&contents=loops,midi`);
    assert.deepEqual(ids(or).sort(), ["dx-loops-house", "dx-midi-pop"]);
    const and = await search(`${scoped}&contents=loops,midi&format=midi`);
    assert.deepEqual(ids(and), ["dx-midi-pop"]);
    // A selected group counts without itself (its other values stay reachable); other groups count within the selection.
    const contents = or.facets.find((g) => g.id === "contents").values;
    assert.equal(contents.find((v) => v.value === "presets").count, 1);
    assert.equal(contents.find((v) => v.value === "loops").selected, true);
    const format = or.facets.find((g) => g.id === "format").values;
    assert.deepEqual(format.map((v) => [v.value, v.count]).sort(), [["midi", 1], ["wav", 1]]);
    assert.ok(!ids(await search(`${scoped}&contents=loops`)).includes("dx-hidden"), "unpublished products never appear");
  });

  test("price boundaries are inclusive, free and paid split cleanly, and a running sale's price is the one filtered and sorted", async () => {
    assert.deepEqual(ids(await search(`${scoped}&price_min=9&price_max=9`)), ["dx-oneshots-techno"]);
    assert.deepEqual(ids(await search(`${scoped}&free=1`)), ["dx-free-kit"]);
    assert.ok(!ids(await search(`${scoped}&free=0`)).includes("dx-free-kit"));
    sql(ctx.mock.stateDir, `INSERT INTO promotions (id, kind, name, percent_off, currency, scope, scope_ids, starts_at, created_at, updated_at)
      VALUES ('promo_dx_sale', 'sale', 'DX test sale', 50, 'USD', 'products', '["dx-presets-serum"]', ${q(ago(1))}, ${q(NOW)}, ${q(NOW)})`);
    try {
      const sale = await search(`${scoped}&sale=1`);
      assert.deepEqual(ids(sale), ["dx-presets-serum"]);
      assert.equal(sale.products[0].priceCents, 1000);
      assert.equal(sale.products[0].badges.percentOff, 50);
      assert.ok(ids(await search(`${scoped}&price_max=10`)).includes("dx-presets-serum"), "the sale price is within a $10 ceiling");
      const asc = (await search(`${scoped}&sort=price-asc`)).products.map((p) => p.priceCents);
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    } finally {
      sql(ctx.mock.stateDir, "DELETE FROM promotions WHERE id = 'promo_dx_sale'");
    }
  });

  test("sorting is stable and complete; best-selling counts confirmed purchases only", async () => {
    const all = await search(scoped);
    assert.equal(all.total, 7);
    for (const sort of ["relevance", "bestselling", "newest", "price-asc", "price-desc", "discount", "name"]) {
      const d = await search(`${scoped}&sort=${sort}`);
      assert.deepEqual([...ids(d)].sort(), [...ids(all)].sort(), `${sort} returns the same set`);
      assert.deepEqual(ids(d), ids(await search(`${scoped}&sort=${sort}`)), `${sort} is stable`);
    }
    assert.equal(ids(await search(`${scoped}&sort=newest`))[0], "dx-new-ambient");
    const grant = (i, product, status = "active") => `INSERT INTO entitlements (id, email, product_id, source_type, source_id, status, granted_at)
      VALUES ('ent_dx_${i}', 'dx${i}@test.dev', ${q(product)}, 'purchase', 'ord_dx_${i}', ${q(status)}, ${q(ago(2))})`;
    sql(ctx.mock.stateDir, [grant(1, "dx-midi-pop"), grant(2, "dx-midi-pop"), grant(3, "dx-loops-house"), grant(4, "dx-loops-house", "revoked"),
      grant(5, "dx-loops-house", "revoked")].join(";\n"));
    assert.deepEqual(ids(await search(`${scoped}&sort=bestselling`)).slice(0, 2), ["dx-midi-pop", "dx-loops-house"], "revoked (refunded) purchases don't count");
  });

  test("search combines with filters; products without details are neutral, not hidden, until a filter needs the detail", async () => {
    assert.deepEqual(ids(await search(`${scoped}&q=loops&format=wav`)), ["dx-loops-house"]);
    assert.deepEqual(ids(await search(`${scoped}&q=house`)).sort(), ["dx-free-kit", "dx-loops-house"], "facet labels are searchable");
    assert.ok(ids(await search(scoped)).includes("dx-bare"));
    assert.ok(!ids(await search(`${scoped}&genre=house,pop,techno,dubstep,ambient`)).includes("dx-bare"));
    const bpm = await search(`${scoped}&bpm_min=118&bpm_max=130`);
    assert.deepEqual(ids(bpm), ["dx-loops-house"], "a tempo filter needs a stated tempo");
    assert.deepEqual(ids(await search(`${scoped}&q=nothing-like-this`)), []);
  });

  test("invalid filters are refused with a reason; unknown values from old links are dropped and reported", async () => {
    for (const bad of ["price_min=abc", "sort=bogus", "page=0", "per=500", "bpm_min=x", "price_min=20&price_max=10", `q=${"a".repeat(101)}`, "genre=Not%20A%20Word!"]) {
      const r = await c.get(`/api/store/search?${bad}`);
      assert.equal(r.status, 400, bad);
      assert.equal(r.data.error.code, "invalid_filter");
    }
    const d = await search(`${scoped}&genre=house,polka&category=nope`);
    assert.deepEqual(d.ignored.sort(), ["category:nope", "genre:polka"]);
    assert.deepEqual(ids(d).sort(), ["dx-free-kit", "dx-loops-house"]);
  });

  test("pages cover every result exactly once", async () => {
    const seen = [];
    const first = await search(`${scoped}&per=3&sort=name`);
    for (let page = 1; page <= first.pages; page++) seen.push(...ids(await search(`${scoped}&per=3&sort=name&page=${page}`)));
    assert.equal(seen.length, first.total);
    assert.equal(new Set(seen).size, first.total);
    assert.deepEqual(ids(await search(`${scoped}&per=3&page=99`)), []);
  });

  // ---------- recommendations ----------
  const recommend = async (client, body = {}) => {
    const r = await client.post("/api/store/recommendations", body);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  const shown = (d) => d.sections.flatMap((s) => s.products.map((p) => p.id));

  test("a new visitor with no history gets a varied, non-personal store; nothing repeats across sections", async () => {
    const d = await recommend(new Client(base));
    assert.equal(d.personal, false);
    assert.ok(!d.sections.some((s) => s.id === "for-you"), "no 'for you' without anything to go on");
    assert.ok(d.sections.length >= 1);
    assert.equal(new Set(shown(d)).size, shown(d).length, "each product at most once");
    assert.ok(!shown(d).includes("dx-hidden"));
    assert.ok(shown(d).includes("dx-new-ambient"), "a new product with no sales still gets a place");
  });

  test("stated limits are hard: a price ceiling or a required DAW is never broken by personal ranking", async () => {
    const body = { prefs: { genre: ["dubstep"] }, interactions: [{ id: "dx-presets-serum", kind: "cart", n: 3 }], constraints: "price_max=10" };
    const d = await recommend(new Client(base), body);
    for (const p of d.sections.flatMap((s) => s.products)) assert.ok(p.priceCents <= 1000, `${p.id} costs ${p.priceCents}`);
    const daw = await recommend(new Client(base), { prefs: { genre: ["house"] }, constraints: "daw=ableton-live" });
    for (const p of daw.sections.flatMap((s) => s.products)) assert.ok((p.facets.daw || []).some((x) => x.value === "ableton-live"), p.id);
  });

  test("preferences lead; dismissed and carted products are left out; at most two per creator in a section", async () => {
    const d = await recommend(new Client(base), { prefs: { genre: ["house"] }, dismissed: ["dx-free-kit"], cart: ["dx-midi-pop"] });
    assert.equal(d.personal, true);
    const forYou = d.sections.find((s) => s.id === "for-you");
    assert.ok(forYou, JSON.stringify(d.sections.map((s) => s.id)));
    assert.ok(forYou.products[0].facets.genre.some((g) => g.value === "house"), "a house product first");
    assert.ok(!shown(d).includes("dx-free-kit") && !shown(d).includes("dx-midi-pop"));
    for (const s of d.sections) {
      const per = {};
      for (const p of s.products) per[p.projectId] = (per[p.projectId] || 0) + 1;
      assert.ok(Object.values(per).every((n) => n <= 2), `${s.id}: ${JSON.stringify(per)}`);
    }
  });

  test("owned products are never recommended, and the store says they're owned wherever it shows them", async () => {
    const buyer = new Client(base);
    const user = await verifiedUser(buyer, unique("dx-owner"));
    sql(ctx.mock.stateDir, `INSERT INTO entitlements (id, user_id, email, product_id, source_type, source_id, status, granted_at)
      VALUES ('ent_dx_owner', ${q(user.id)}, ${q(user.email)}, 'dx-loops-house', 'purchase', 'ord_dx_owner', 'active', ${q(NOW)})`);
    const d = await recommend(buyer, { prefs: { genre: ["house"] } });
    assert.ok(!shown(d).includes("dx-loops-house"));
    const state = await buyer.get("/api/products/state?ids=dx-loops-house,dx-free-kit");
    assert.equal(state.data.products["dx-loops-house"].owned, true);
    assert.equal(state.data.products["dx-free-kit"].owned, false);
    // A cart or a wishlist is never a purchase.
    assert.equal((await buyer.req("PUT", "/api/wishlist/dx-midi-pop", { body: {} })).status, 201);
    assert.equal((await buyer.get("/api/products/state?ids=dx-midi-pop")).data.products["dx-midi-pop"].owned, false);
  });

  test("'Bestselling' needs confirmed purchases; personal history can be switched off", async () => {
    const grant = (i) => `INSERT INTO entitlements (id, email, product_id, source_type, source_id, status, granted_at)
      VALUES ('ent_dxb_${i}', 'dxb${i}@test.dev', 'dx-oneshots-techno', 'purchase', 'ord_dxb_${i}', 'active', ${q(ago(1))})`;
    const before = await recommend(new Client(base));
    const best = before.sections.find((s) => s.id === "bestselling");
    for (const p of best ? best.products : []) assert.ok(p.badges.soldRecently >= 0);
    sql(ctx.mock.stateDir, [1, 2, 3, 4, 5].map(grant).join(";\n"));
    const after = await recommend(new Client(base));
    const all = after.sections.flatMap((s) => s.products);
    const techno = all.find((p) => p.id === "dx-oneshots-techno");
    assert.ok(techno, "a product with 5 confirmed purchases appears");
    assert.equal(techno.badges.soldRecently, 5);
    const off = await recommend(new Client(base), { personalize: false, prefs: { genre: ["pop"] }, interactions: [{ id: "dx-midi-pop", kind: "cart" }] });
    assert.equal(off.personal, false, "with personal picks off, history is ignored");
  });

  test("recommendation input is checked", async () => {
    const bad = await new Client(base).post("/api/store/recommendations", { dismissed: ["no spaces allowed"] });
    assert.equal(bad.status, 400);
    const odd = await recommend(new Client(base), { prefs: { genre: ["polka"], bogus: ["x"] }, interactions: [{ id: "dx-bare", kind: "stare" }] });
    assert.equal(odd.personal, false, "unknown preferences and event kinds are dropped");
  });

  // ---------- wishlists ----------
  test("wishlists: signed in only, visible products only, each person's own", async () => {
    const anon = new Client(base);
    assert.equal((await anon.get("/api/wishlist")).status, 401);
    assert.equal((await anon.req("PUT", "/api/wishlist/dx-free-kit", { body: {} })).status, 401);
    const a = new Client(base), b = new Client(base);
    await verifiedUser(a, unique("dx-wish-a"));
    await verifiedUser(b, unique("dx-wish-b"));
    assert.equal((await a.req("PUT", "/api/wishlist/dx-free-kit", { body: {} })).status, 201);
    assert.equal((await a.req("PUT", "/api/wishlist/dx-free-kit", { body: {} })).status, 200, "saving twice is harmless");
    assert.equal((await a.req("PUT", "/api/wishlist/dx-hidden", { body: {} })).status, 404, "unpublished products can't be saved");
    assert.equal((await a.req("PUT", "/api/wishlist/not-a-product", { body: {} })).status, 404);
    assert.deepEqual((await a.get("/api/wishlist")).data.items.map((i) => i.productId), ["dx-free-kit"]);
    assert.deepEqual((await b.get("/api/wishlist")).data.items, [], "another person's list is theirs");
    assert.equal((await b.req("DELETE", "/api/wishlist/dx-free-kit", { body: {} })).status, 200);
    assert.equal((await a.get("/api/wishlist")).data.items.length, 1, "removing from your own list never touches someone else's");
    const exported = await a.post("/api/account/export", {});
    assert.deepEqual(exported.data.wishlist.map((w) => w.productId), ["dx-free-kit"], "part of the data export");
    assert.equal((await a.req("DELETE", "/api/wishlist/dx-free-kit", { body: {} })).status, 200);
    assert.deepEqual((await a.get("/api/wishlist")).data.items, []);
  });

  test("similar products: like the product, never the product itself, and public", async () => {
    const r = await c.get("/api/store/similar/dx-loops-house");
    assert.equal(r.status, 200);
    assert.ok(!r.data.products.some((p) => p.id === "dx-loops-house"));
    assert.ok(r.data.products.some((p) => p.id === "dx-free-kit"), "shares genre, contents' kind and format");
    assert.equal((await c.get("/api/store/similar/dx-hidden")).status, 404);
  });

  test("autocomplete offers matching tags, creators and titles of visible products", async () => {
    const r = await c.get("/api/store/suggest?q=ambi");
    assert.ok(r.data.tags.some((t) => t.facet === "genre" && t.value === "ambient"));
    assert.ok(r.data.titles.some((t) => t.id === "dx-new-ambient" && t.path === "/shop/dx-new-ambient"));
    assert.ok(!(await c.get("/api/store/suggest?q=hidden draft")).data.titles.length);
  });

  // ---------- Studio metadata ----------
  test("Studio products: store details are checked against the kind and kept with the product's search text", async () => {
    const maker = new Client(base);
    await verifiedUser(maker, unique("dx-maker"));
    const creator = (await maker.post("/api/studio/creators", { name: "DX Maker", slug: `dx-maker-${Date.now().toString(36)}` })).data.creator;
    const project = (await maker.post(`/api/studio/creators/${creator.id}/projects`, { name: "DX Kits", slug: "dx-kits" })).data.project;
    const url = `/api/studio/projects/${project.id}/products`;
    const make = (extra) => maker.post(url, { title: "Glitch Drum Kit", description: "Crunchy one-shots and loops in WAV.", type: "sample-pack", priceCents: 500, ...extra });
    assert.equal((await make({ facets: { genre: ["polka"] } })).status, 400, "unknown values are refused");
    assert.equal((await make({ facets: { plugin: ["serum"] } })).status, 400, "fields that don't apply to the kind are refused");
    assert.equal((await make({ bpm: [300, 100] })).status, 400);
    const ok = await make({ facets: { genre: ["dnb", "Drum & Bass"], contents: ["one-shot", "loops"] }, bpm: [170, 174], specs: { bitDepth: 24 } });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const p = ok.data.product;
    assert.deepEqual(p.facets, { contents: ["loops", "one-shots"], genre: ["drum-and-bass"] }, "synonyms fold into one value, no duplicates");
    assert.deepEqual(p.bpm, [170, 174]);
    assert.equal(p.specs.bitDepth, 24);
    assert.deepEqual(p.suggestions.format, ["wav"], "suggested from its own words, not applied");
    const [[row]] = sqlAll(ctx.mock.stateDir, `SELECT search_text, bpm_min FROM products WHERE id = ${q(p.id)}`);
    assert.match(row.search_text, /drum & bass/);
    assert.match(row.search_text, /dx kits/);
    // Changing the kind drops details the new kind doesn't have.
    const moved = await maker.req("PATCH", `/api/studio/products/${p.id}`, { body: { type: "presets" } });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    assert.deepEqual(moved.data.product.facets, { contents: ["loops", "one-shots"], genre: ["drum-and-bass"] }, "genre and contents apply to presets too");
    assert.deepEqual(moved.data.product.specs, {}, "presets have no bit depth");
    assert.equal(moved.data.product.bpm, null, "presets have no tempo");
  });

  // ---------- scale ----------
  test("a few thousand products: search, counts and recommendations stay fast", { timeout: 120000 }, async () => {
    const N = 3000;
    const genres = ["house", "techno", "trap", "ambient", "pop", "edm", "lo-fi", "dubstep"];
    const contents = ["loops", "one-shots", "midi", "presets", "vocals", "textures"];
    const rows = [];
    for (let i = 0; i < N; i++) {
      rows.push(product({ id: `dx-syn-${i}`, title: `Synthetic Pack ${i}`, project: `dx-syn-p${i % 40}`, price: (i % 50) * 100,
        released: ago(i % 120), facets: { genre: [genres[i % genres.length]], contents: [contents[i % contents.length], contents[(i + 2) % contents.length]], format: ["wav"] },
        bpm: i % 3 ? [80 + (i % 90), 90 + (i % 90)] : null }));
    }
    sql(ctx.mock.stateDir, rows.join(";\n"));
    const time = async (fn) => { const t = Date.now(); await fn(); return Date.now() - t; };
    const runs = [];
    for (const qs of ["", "genre=house,techno&contents=loops", "q=synthetic%20pack%2012&sort=price-asc", "price_max=20&bpm_min=100&bpm_max=130&sort=bestselling", "page=40&per=48"]) {
      const ms = await time(() => search(qs));
      runs.push([qs || "(everything)", ms]);
    }
    const total = (await search("contents=loops")).total;
    assert.ok(total >= N / 3, `about a third of the catalog has loops (got ${total})`);
    const recMs = await time(() => recommend(new Client(base), { prefs: { genre: ["house"] }, interactions: [{ id: "dx-syn-8", kind: "wishlist" }] }));
    console.log("discovery timings (ms, local store, includes HTTP):", JSON.stringify(runs), "recommendations:", recMs);
    for (const [qs, ms] of runs) assert.ok(ms < 3000, `search ${qs} took ${ms} ms`);
    assert.ok(recMs < 4000, `recommendations took ${recMs} ms`);
  });
});

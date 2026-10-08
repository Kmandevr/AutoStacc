// Creators and their sites (docs/creators.md): claiming unique names, projects unique within a creator, renames that
// redirect and hold the old name, the site document refusing anything that could run or mislead, published pages
// served static with a strict CSP, images checked by their bytes and bounded by quota, the admin's trust and suspend
// switches, and the store foundations under them: order lines that know their seller and split, refunds per line,
// and paid files that reach customers only once published.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, sql, verifiedUser } from "../support/client.js";
import { newBuyer, mockBuy, mockOutcome, adminClient } from "../support/flows.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function creatorWithProject(base, tag) {
  const { c, user } = await newBuyer(base, tag);
  const cs = slug(tag);
  const cr = await c.post("/api/studio/creators", { name: `Creator ${tag}`, slug: cs });
  assert.equal(cr.status, 201, JSON.stringify(cr.data));
  const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "My Project", slug: "my-project" });
  assert.equal(pr.status, 201, JSON.stringify(pr.data));
  return { c, user, creator: cr.data.creator, project: pr.data.project };
}

const site = (pages) => ({ document: { theme: { preset: "paper", accent: "#ff0066", font: "serif" }, pages } });

export default (ctx) => describe("creators", () => {
  test("claiming a creator name: verified accounts only, unique ignoring case, never a platform word, one per account", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.post("/api/studio/creators", { name: "x", slug: "nobody-here" })).status, 401);
    const { c } = await newBuyer(ctx.mock.url, "claim");
    for (const [s, status] of [["shop", 409], ["autostacc", 409], ["admin", 409], ["ab", 400], ["Bad_Slug!", 400], ["-x-", 400]]) {
      assert.equal((await c.post("/api/studio/creators", { name: "X", slug: s })).status, status, s);
    }
    const s = slug("claim");
    const ok = await c.post("/api/studio/creators", { name: "Claimer", slug: s.toUpperCase() });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.creator.slug, s, "stored lowercase");
    assert.equal((await c.post("/api/studio/creators", { name: "Again", slug: slug("again") })).data.error.code, "limit_reached");
    const { c: other } = await newBuyer(ctx.mock.url, "claim2");
    const dup = await other.post("/api/studio/creators", { name: "Copycat", slug: s.toUpperCase() });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error.code, "slug_taken");
    // A state change from another site is refused.
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = other.jar;
    assert.equal((await evil.post("/api/studio/creators", { name: "E", slug: slug("evil") })).status, 403);
  });

  test("projects are unique within their creator; nobody else can see or change them", async () => {
    const a = await creatorWithProject(ctx.mock.url, "proj-a");
    const b = await creatorWithProject(ctx.mock.url, "proj-b");
    assert.equal(b.project.slug, a.project.slug, "the same project name under another creator is fine");
    const again = await a.c.post(`/api/studio/creators/${a.creator.id}/projects`, { name: "Dup", slug: "MY-PROJECT" });
    assert.equal(again.status, 409);
    // b can't touch a's creator or project: they look like nothing there.
    assert.equal((await b.c.post(`/api/studio/creators/${a.creator.id}/projects`, { name: "Sneak", slug: "sneak" })).status, 404);
    assert.equal((await b.c.req("PATCH", `/api/studio/projects/${a.project.id}`, { body: { name: "Mine now" } })).status, 404);
    assert.equal((await b.c.req("PUT", `/api/studio/projects/${a.project.id}/site`, { body: site([{ slug: "", title: "Home", blocks: [] }]) })).status, 404);
    assert.equal((await b.c.post(`/api/studio/projects/${a.project.id}/publish`, {})).status, 404);
    assert.equal((await b.c.get(`/api/studio/projects/${a.project.id}/preview`)).status, 404);
    // Catalog projects are never editable in the Studio.
    assert.equal((await a.c.req("PATCH", "/api/studio/projects/glitches-and-stitches", { body: { name: "Hijack" } })).status, 404);
    assert.equal((await a.c.post("/api/studio/creators/autostacc/projects", { name: "Hijack", slug: "hijack" })).status, 404);
  });

  test("the site document refuses scripts, bad links, unknown embeds and foreign images; text is escaped", async () => {
    const { c, project } = await creatorWithProject(ctx.mock.url, "doc");
    const put = (pages) => c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site(pages) });
    const home = (blocks) => [{ slug: "", title: "Home", blocks }];
    for (const blocks of [
      [{ type: "script", text: "alert(1)" }],
      [{ type: "button", label: "Go", url: "javascript:alert(1)" }],
      [{ type: "button", label: "Go", url: "//evil.example/x" }],
      [{ type: "embed", url: "https://evil.example/player" }],
      [{ type: "socials", links: [{ network: "Website", url: "http://insecure.example" }] }],
      [{ type: "events", items: [{ date: "tomorrow", title: "Show" }] }],
      [{ type: "image", asset: "../../etc/passwd" }]
    ]) assert.equal((await put(home(blocks))).status, 400, JSON.stringify(blocks));
    assert.equal((await put([{ slug: "", title: "Home", blocks: [] }, { slug: "home", title: "Dup", blocks: [] }])).status, 400, "\"home\" is the first page");
    assert.equal((await put([{ slug: "", title: "A", blocks: [] }, { slug: "x", title: "B", blocks: [] }, { slug: "x", title: "C", blocks: [] }])).status, 400);
    const saved = await put(home([
      { type: "heading", text: "<script>alert(1)</script>" },
      { type: "text", text: "Hello **world** [site](https://example.org) [bad](javascript:alert(1)) <img src=x onerror=alert(1)>", evil: "<script>" },
      { type: "embed", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" },
      { type: "image", asset: "as_" + "a".repeat(26), alt: "not mine" }
    ]));
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.document.pages[0].blocks[1].evil, undefined, "unknown fields are dropped");
    const preview = await c.get(`/api/studio/projects/${project.id}/preview`);
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-security-policy"), /script-src 'none'/);
    const html = preview.data;
    assert.ok(!/<script/i.test(html), "no script tag survives");
    assert.ok(!/onerror=/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/, "")), "markup in text is shown, not run");
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /<strong>world<\/strong>/);
    assert.match(html, /<a href="https:\/\/example.org\/" rel="noopener noreferrer nofollow ugc" target="_blank">site<\/a>/);
    assert.ok(!/href="javascript:/i.test(html));
    assert.match(html, /src="https:\/\/open.spotify.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC"/);
    assert.ok(!/as_aaaa/.test(html), "an image that isn't the creator's is left out");
    assert.match(html, /<meta name="robots" content="noindex">/);
  });

  test("publishing serves static pages at /<creator>/<project>[/<page>], with redirects, drafts kept private", async () => {
    const { c, creator, project } = await creatorWithProject(ctx.mock.url, "pub");
    const anon = new Client(ctx.mock.url);
    const base = `/${creator.slug}/${project.slug}`;
    assert.equal((await anon.get(base)).status, 404, "nothing before the first publish");
    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site([
      { slug: "", title: "Home", blocks: [{ type: "heading", text: "Welcome home" }] },
      { slug: "events", title: "Events", blocks: [{ type: "events", title: "Shows", items: [{ date: "2027-01-02", title: "Live set", venue: "Club", city: "Town" }] }] }
    ]) });
    assert.equal((await c.post(`/api/studio/projects/${project.id}/publish`, {})).status, 200);
    const page = await anon.get(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /form-action 'none'/);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.data, /Welcome home/);
    assert.match(page.data, /<meta name="robots" content="noindex">/, "new creators aren't indexed");
    assert.match((await anon.get(`${base}/events`)).data, /Live set/);
    assert.equal((await anon.get(`${base}/home`)).headers.get("location"), ctx.mock.url + base);
    assert.equal((await anon.get(base.toUpperCase())).status, 301);
    assert.equal((await anon.get(`${base}/nope`)).status, 404);
    assert.match((await anon.get(`/${creator.slug}`)).data, new RegExp(`href="${base}"`), "the profile lists it");
    // A saved draft isn't public until it is published again.
    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site([{ slug: "", title: "Home", blocks: [{ type: "heading", text: "Secret draft" }] }]) });
    assert.ok(!/Secret draft/.test((await anon.get(base)).data));
    assert.equal((await c.post(`/api/studio/projects/${project.id}/unpublish`, {})).status, 200);
    assert.equal((await anon.get(base)).status, 404);
    // First-party creators stay static pages.
    assert.equal((await anon.get("/autostacc/glitches-and-stitches")).status, 200);
  });

  test("renames redirect for a while and hold the old name; published pages follow the new name", async () => {
    const { c, creator, project } = await creatorWithProject(ctx.mock.url, "rename");
    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site([{ slug: "", title: "Home", blocks: [{ type: "heading", text: "Hi" }] }]) });
    await c.post(`/api/studio/projects/${project.id}/publish`, {});
    const fresh = slug("renamed");
    const r = await c.req("PATCH", `/api/studio/creators/${creator.id}`, { body: { slug: fresh } });
    assert.equal(r.status, 200);
    const anon = new Client(ctx.mock.url);
    const old = await anon.get(`/${creator.slug}/${project.slug}`);
    assert.equal(old.status, 301);
    assert.equal(old.headers.get("location"), `${ctx.mock.url}/${fresh}/${project.slug}`);
    assert.match((await anon.get(`/${fresh}/${project.slug}`)).data, new RegExp(`href="/${fresh}"`), "pages were rendered again with the new address");
    const { c: other } = await newBuyer(ctx.mock.url, "squatter");
    assert.equal((await other.post("/api/studio/creators", { name: "Squat", slug: creator.slug })).status, 409, "the old name is held");
    // Project renames redirect too.
    await c.req("PATCH", `/api/studio/projects/${project.id}`, { body: { slug: "new-project" } });
    assert.equal((await anon.get(`/${fresh}/${project.slug}`)).headers.get("location"), `${ctx.mock.url}/${fresh}/new-project`);
  });

  test("images: only real images by their bytes, within size and quota, served safely and only while active", async () => {
    const { c, creator } = await creatorWithProject(ctx.mock.url, "img");
    const put = (raw, type = "image/png") => c.req("PUT", `/api/studio/creators/${creator.id}/images?filename=pic.png`, { raw, headers: { "Content-Type": type } });
    assert.equal((await put(Buffer.from("<html><script>alert(1)</script></html>"))).status, 415, "HTML named .png is refused");
    assert.equal((await put(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml")).status, 415);
    assert.equal((await put(Buffer.alloc(6 * 1024 * 1024, 1))).status, 413);
    const ok = await put(PNG);
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const anon = new Client(ctx.mock.url);
    const img = await anon.get(ok.data.image.src);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.equal(img.headers.get("x-content-type-options"), "nosniff");
    // Someone else can't delete it; the owner can, and then it's gone.
    const { c: other } = await newBuyer(ctx.mock.url, "img-other");
    assert.equal((await other.req("DELETE", `/api/studio/creators/${creator.id}/images/${ok.data.image.id}`, { body: {} })).status, 404);
    assert.equal((await c.req("DELETE", `/api/studio/creators/${creator.id}/images/${ok.data.image.id}`, { body: {} })).status, 200);
    assert.equal((await anon.get(ok.data.image.src)).status, 404);
    // Over quota: the admin sets a tiny one.
    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { storageQuotaBytes: 10 } })).status, 200);
    assert.equal((await put(PNG)).data.error.code, "quota_exceeded");
  });

  test("admin: creators are admin-only; trusted pages may be indexed; suspended creators vanish", async () => {
    const { c, creator, project } = await creatorWithProject(ctx.mock.url, "adm");
    assert.equal((await c.get("/api/admin/creators")).status, 404);
    assert.equal((await c.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { trusted: true } })).status, 404);
    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site([{ slug: "", title: "Home", blocks: [{ type: "heading", text: "Hi" }] }]) });
    await c.post(`/api/studio/projects/${project.id}/publish`, {});
    const admin = await adminClient(ctx.mock.url);
    assert.ok((await admin.get("/api/admin/creators")).data.creators.some((x) => x.id === creator.id));
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { trusted: "yes" } })).status, 400);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { trusted: true } })).status, 200);
    const anon = new Client(ctx.mock.url);
    const base = `/${creator.slug}/${project.slug}`;
    assert.ok(!/noindex/.test((await anon.get(base)).data), "trusted: indexable");
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { status: "suspended" } })).status, 200);
    assert.equal((await anon.get(base)).status, 404);
    assert.equal((await anon.get(`/${creator.slug}`)).status, 404);
    assert.equal((await c.post(`/api/studio/projects/${project.id}/publish`, {})).status, 403);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'creator.updated' AND target_id = '${creator.id}'`)[0].n, 2);
  });

  test("order lines record their seller and split; refunds are recorded per line", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c } = await newBuyer(ctx.mock.url, "split");
    assert.equal((await admin.req("PATCH", "/api/admin/creators/autostacc", { body: { platformFeeBps: 1000 } })).status, 200);
    let order;
    try {
      order = await mockBuy(c, [{ productId: "wallpapers" }]);
    } finally {
      await admin.req("PATCH", "/api/admin/creators/autostacc", { body: { platformFeeBps: null } });
    }
    const [line] = sql(ctx.mock.stateDir, `SELECT * FROM order_items WHERE order_id = '${order.orderId}'`);
    assert.equal(line.creator_id, "autostacc");
    assert.equal(line.project_id, "glitches-and-stitches");
    assert.equal(line.net_cents, line.line_total_cents);
    assert.equal(line.platform_fee_cents, Math.round(line.net_cents / 10));
    assert.equal(line.platform_fee_cents + line.creator_share_cents, line.net_cents);
    assert.equal((await mockOutcome(c, order, "refunded")).status, 200);
    const [after] = sql(ctx.mock.stateDir, `SELECT i.refunded_cents AS line, o.refunded_cents AS total FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.id = '${order.orderId}'`);
    assert.equal(after.line, line.net_cents);
    assert.equal(after.total, line.net_cents);
  });

  test("paid files: a pending upload never reaches a customer until it is published; odd file types are refused", async () => {
    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.req("PUT", "/api/admin/products/vj-loops/files?filename=evil.exe", { raw: "MZ", headers: { "Content-Type": "application/octet-stream" } })).status, 415);
    const up = await admin.req("PUT", "/api/admin/products/vj-loops/files?filename=held.zip&status=pending", { raw: "zip bytes", headers: { "Content-Type": "application/zip" } });
    assert.equal(up.status, 201);
    assert.equal(up.data.status, "pending");
    const { c } = await newBuyer(ctx.mock.url, "pending-file");
    await mockBuy(c, [{ productId: "vj-loops" }]);
    const ids = () => c.get("/api/library").then((r) => r.data.items.flatMap((i) => i.files.map((f) => f.id)));
    assert.ok(!(await ids()).includes(up.data.fileId));
    assert.equal((await c.post("/api/downloads", { fileId: up.data.fileId })).status, 403);
    assert.equal((await admin.req("PATCH", `/api/admin/files/${up.data.fileId}`, { body: { status: "published" } })).status, 200);
    assert.ok((await ids()).includes(up.data.fileId));
    assert.equal((await c.post("/api/downloads", { fileId: up.data.fileId })).status, 200);
    assert.equal((await admin.req("PATCH", `/api/admin/files/${up.data.fileId}`, { body: { status: "rejected" } })).status, 200);
    assert.equal((await c.post("/api/downloads", { fileId: up.data.fileId })).status, 403);
  });

  test("the Studio page is for signed-in accounts only", async () => {
    const anon = new Client(ctx.mock.url);
    const res = await anon.get("/studio");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /^\/login\?next=%2Fstudio/);
    const c = new Client(ctx.mock.url);
    await verifiedUser(c, unique("studio-page"));
    assert.equal((await c.get("/studio")).status, 200);
  });
  test("nobody can pose as a first-party project, race past the limits or squat names by renaming", async () => {
    const { c } = await newBuyer(ctx.mock.url, "poser");
    assert.equal((await c.post("/api/studio/creators", { name: "Totally Real", slug: "glitches-and-stitches" })).data.error.code, "slug_taken");
    assert.equal((await c.post("/api/studio/creators", { name: "Glitches and Stitches!", slug: slug("gs") })).data.error.code, "name_taken");
    // Ten creators at once from one account: one wins.
    const { c: racer } = await newBuyer(ctx.mock.url, "racer");
    const made = await Promise.all(Array.from({ length: 6 }, (_, i) => racer.post("/api/studio/creators", { name: `Race ${i}`, slug: slug(`race${i}`) })));
    assert.equal(made.filter((r) => r.status === 201).length, 1, JSON.stringify(made.map((r) => r.status)));
    // Renames are capped, so one creator can't hold many names.
    const { c: r, creator } = await creatorWithProject(ctx.mock.url, "renamer");
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await r.req("PATCH", `/api/studio/creators/${creator.id}`, { body: { slug: slug(`rn${i}`) } })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  });
});

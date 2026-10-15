// The visual builder's API (docs/builder.md): creator profiles built and published like project sites, one address
// space per creator (a profile page can't take a project's address, nor a project a page's), the last 20 publishes
// with restore, scheduled publishing (once, on the first visit after its time), creators' CSS refused when it reaches
// outside the page, fonts checked by their bytes, one storage quota for site files and paid files, and files that old
// versions still use kept until nothing does. Everything here belongs to its creator: others get 404.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer } from "../support/flows.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const WOFF2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(60, 1)]);
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const v2 = (pages, theme = {}) => ({ document: { version: 2, theme, nav: { items: [] }, pages } });
const page = (slug, title, elements) => ({ slug, title, sections: [{ id: "s1", rows: 8, elements }] });
const heading = (text, y = 0) => ({ id: `h${y}`, type: "heading", text, level: 1, box: { x: 0, y, w: 12, h: 3 } });

async function creator(base, tag) {
  const { c } = await newBuyer(base, tag);
  const cr = await c.post("/api/studio/creators", { name: `Builder ${tag}`, slug: slug(tag) });
  assert.equal(cr.status, 201, JSON.stringify(cr.data));
  return { c, creator: cr.data.creator };
}

export default (ctx) => describe("visual builder", () => {
  test("a creator's profile: starter, save, private preview, publish at /<creator> and its pages, unpublish back to the list", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "prof");
    const anon = new Client(ctx.mock.url);
    const api = `/api/studio/creators/${cr.id}`;
    const first = await c.get(`${api}/site`);
    assert.equal(first.status, 200);
    assert.equal(first.data.site.kind, "profile");
    assert.ok(first.data.options.templates.length === 4);
    assert.equal(first.data.document.pages[0].sections[0].elements[1].type, "projects", "a profile starts with the creator's projects");
    assert.match((await anon.get(`/${cr.slug}`)).data, /Nothing published yet/, "before publishing: the generated list");
    const saved = await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Hello from my profile")]), page("bio", "Bio", [heading("All about me")])]) });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const preview = await c.get(`${api}/preview?page=bio`);
    assert.match(preview.data, /All about me/);
    assert.equal(preview.headers.get("x-robots-tag"), "noindex");
    assert.ok(!/Hello from my profile/.test((await anon.get(`/${cr.slug}`)).data), "a draft isn't public");
    const pub = await c.post(`${api}/publish`, {});
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    const home = await anon.get(`/${cr.slug}`);
    assert.match(home.data, /Hello from my profile/);
    assert.match(home.headers.get("content-security-policy"), /connect-src 'none'/);
    assert.match((await anon.get(`/${cr.slug}/bio`)).data, /All about me/);
    assert.equal((await anon.get(`/${cr.slug}/nope`)).status, 404);
    assert.equal((await c.post(`${api}/unpublish`, {})).status, 200);
    assert.match((await anon.get(`/${cr.slug}`)).data, /Nothing published yet/);
    assert.equal((await anon.get(`/${cr.slug}/bio`)).status, 404);
  });

  test("only the creator's members see or change its sites", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "own");
    const pr = await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Mine", slug: "mine" });
    const { c: other } = await newBuyer(ctx.mock.url, "own-other");
    for (const path of [`/api/studio/creators/${cr.id}`, `/api/studio/projects/${pr.data.project.id}`]) {
      assert.equal((await other.get(`${path}/site`)).status, 404);
      assert.equal((await other.req("PUT", `${path}/site`, { body: v2([page("", "Home", [])]) })).status, 404);
      assert.equal((await other.post(`${path}/publish`, {})).status, 404);
      assert.equal((await other.get(`${path}/versions`)).status, 404);
      assert.equal((await other.req("PUT", `${path}/schedule`, { body: { at: new Date(Date.now() + 3600e3).toISOString() } })).status, 404);
    }
    assert.equal((await new Client(ctx.mock.url).get(`/api/studio/creators/${cr.id}/site`)).status, 401);
  });

  test("one address space: a profile page can't take a project's address, nor a project a page's", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "ns");
    await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Album", slug: "album" });
    const clash = await c.req("PUT", `/api/studio/creators/${cr.id}/site`, { body: v2([page("", "Home", []), page("album", "Album page", [])]) });
    assert.equal(clash.status, 409);
    assert.equal(clash.data.error.code, "slug_taken");
    assert.equal((await c.req("PUT", `/api/studio/creators/${cr.id}/site`, { body: v2([page("", "Home", []), page("tour", "Tour", [])]) })).status, 200);
    assert.equal((await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Tour", slug: "tour" })).status, 409, "the profile's page holds the address");
  });

  test("history: each publish is kept (the last 20) and can be restored into the draft", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "hist");
    const pr = (await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Hist", slug: "hist" })).data.project;
    const api = `/api/studio/projects/${pr.id}`;
    await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Version 1")])]) });
    assert.equal((await c.post(`${api}/publish`, {})).status, 200);
    // Twenty more publishes, written directly (publishing is rate limited), then one real publish prunes the oldest.
    const rows = Array.from({ length: 20 }, (_, i) => `('project', '${pr.id}', ${i + 2}, '${JSON.stringify(v2([page("", "Home", [heading(`Version ${i + 2}`)])]).document)}', '2026-01-01T00:00:00.000Z', NULL)`);
    sql(ctx.mock.stateDir, `INSERT INTO site_versions (kind, site_id, version, doc, published_at, published_by) VALUES ${rows.join(", ")}; UPDATE project_sites SET version = 21 WHERE project_id = '${pr.id}'`);
    await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Version 22")])]) });
    assert.equal((await c.post(`${api}/publish`, {})).status, 200);
    const list = (await c.get(`${api}/versions`)).data.versions;
    assert.equal(list.length, 20);
    assert.deepEqual([list[0].version, list[19].version], [22, 3]);
    assert.equal((await c.post(`${api}/versions/2/restore`, {})).status, 404, "older ones are gone");
    const restored = await c.post(`${api}/versions/5/restore`, {});
    assert.equal(restored.status, 200);
    assert.equal(restored.data.document.pages[0].sections[0].elements[0].text, "Version 5");
    assert.match((await new Client(ctx.mock.url).get(`/${cr.slug}/hist`)).data, /Version 22/, "restoring changes only the draft");
  });

  test("scheduled publishing: a copy of the draft goes live once, at the first visit after its time; later edits stay drafts", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "sched");
    const pr = (await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Drop", slug: "drop" })).data.project;
    const api = `/api/studio/projects/${pr.id}`;
    const anon = new Client(ctx.mock.url);
    await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Release day")])]) });
    assert.equal((await c.req("PUT", `${api}/schedule`, { body: { at: new Date(Date.now() - 1000).toISOString() } })).status, 400, "not in the past");
    assert.equal((await c.req("PUT", `${api}/schedule`, { body: { at: "soon" } })).status, 400);
    const at = new Date(Date.now() + 3600e3).toISOString();
    assert.equal((await c.req("PUT", `${api}/schedule`, { body: { at } })).status, 200);
    assert.equal((await c.get(`${api}/site`)).data.site.scheduledAt, at);
    await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Edited after scheduling")])]) });
    assert.equal((await anon.get(`/${cr.slug}/drop`)).status, 404, "not live before its time");
    // Time passes.
    sql(ctx.mock.stateDir, `UPDATE project_sites SET scheduled_at = '2000-01-01T00:00:00.000Z' WHERE project_id = '${pr.id}'`);
    const live = await anon.get(`/${cr.slug}/drop`);
    assert.equal(live.status, 200);
    assert.match(live.data, /Release day/);
    assert.ok(!/Edited after scheduling/.test(live.data));
    assert.equal(sql(ctx.mock.stateDir, `SELECT scheduled_at FROM project_sites WHERE project_id = '${pr.id}'`)[0].scheduled_at, null, "published once");
    assert.equal((await c.get(`${api}/versions`)).data.versions[0].scheduled, true);
  });

  test("CSS that reaches outside the page is refused; good CSS is scoped to it", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "css");
    const api = `/api/studio/creators/${cr.id}`;
    for (const css of ["body{display:none}", ".cs-site ~ .cs-footer{display:none}", ".a{background:url(https://evil.example/x)}", "@import url(x.css);", ".a{color:red}</style><script>alert(1)</script>"]) {
      const r = await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [])], { css }) });
      assert.equal(r.status, 400, css);
      assert.equal(r.data.error.code, "invalid_site");
    }
    assert.equal((await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("Styled")])], { css: ".cs-h { color: #ff0000 }" }) })).status, 200);
    assert.match((await c.get(`${api}/preview`)).data, /<style>\.cs-site \.cs-h\{color:#ff0000\}<\/style>/);
  });

  test("fonts: WOFF2 by its bytes, served as a font; one storage quota for site files and paid files", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "font");
    const put = (raw, name) => c.req("PUT", `/api/studio/creators/${cr.id}/images?filename=${name}`, { raw, headers: { "Content-Type": "application/octet-stream" } });
    assert.equal((await put(Buffer.from("wOFF" + "x".repeat(40)), "old.woff")).status, 415, "WOFF 1 isn't accepted");
    const font = await put(WOFF2, "brand.woff2");
    assert.equal(font.status, 201);
    assert.equal(font.data.image.contentType, "font/woff2");
    const got = await new Client(ctx.mock.url).get(font.data.image.src);
    assert.equal(got.headers.get("content-type"), "font/woff2");
    assert.equal(got.headers.get("x-content-type-options"), "nosniff");
    const saved = await c.req("PUT", `/api/studio/creators/${cr.id}/site`, { body: v2([page("", "Home", [heading("Own font")])], { fontAsset: font.data.image.id }) });
    assert.equal(saved.status, 200);
    assert.match((await c.get(`/api/studio/creators/${cr.id}/preview`)).data, new RegExp(`src:url\\("/media/sites/${font.data.image.id}"\\) format\\("woff2"\\)`));
    const site = (await c.get(`/api/studio/creators/${cr.id}/site`)).data;
    assert.equal(site.storage.quotaBytes, 550 * 1024 * 1024, "one 550 MB cap");
    assert.equal(site.storage.usedBytes, WOFF2.length);
    // Paid files count against the same cap: fill it (as if with files), and site uploads stop.
    sql(ctx.mock.stateDir, `UPDATE creators SET storage_quota_bytes = ${WOFF2.length + 10} WHERE id = '${cr.id}'`);
    assert.equal((await put(PNG, "a.png")).data.error.code, "quota_exceeded");
  });

  test("a file an old version still uses is hidden when deleted, served while used, and released when nothing uses it", async () => {
    const { c, creator: cr } = await creator(ctx.mock.url, "keep");
    const api = `/api/studio/creators/${cr.id}`;
    const img = (await c.req("PUT", `${api}/images?filename=a.png`, { raw: PNG, headers: { "Content-Type": "image/png" } })).data.image;
    const withImage = v2([page("", "Home", [{ id: "i1", type: "image", asset: img.id, alt: "pic", box: { x: 0, y: 0, w: 6, h: 6 } }])]);
    await c.req("PUT", `${api}/site`, { body: withImage });
    await c.post(`${api}/publish`, {});
    const del = await c.req("DELETE", `${api}/images/${img.id}`, { body: {} });
    assert.equal(del.status, 200);
    assert.equal(del.data.kept, true, "the live profile and its history still use it");
    assert.ok(!(await c.get(`${api}/site`)).data.files.some((f) => f.id === img.id), "hidden from the creator's files");
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.get(img.src)).status, 200, "still served");
    // A publish without it, once the version that used it is older than the last 20 (aged directly: publishing is rate limited).
    sql(ctx.mock.stateDir, `UPDATE creator_sites SET version = 40 WHERE creator_id = '${cr.id}'`);
    await c.req("PUT", `${api}/site`, { body: v2([page("", "Home", [heading("No picture")])]) });
    assert.equal((await c.post(`${api}/publish`, {})).status, 200);
    assert.equal((await anon.get(img.src)).status, 404, "released once nothing uses it");
  });

  test("templates: four starters, checked documents with no files", async () => {
    const { c } = await creator(ctx.mock.url, "tpl");
    for (const id of ["artist", "dj", "packs", "label"]) {
      const t = await c.get(`/api/studio/templates/${id}`);
      assert.equal(t.status, 200, id);
      assert.equal(t.data.document.version, 2);
    }
    assert.equal((await c.get("/api/studio/templates/nope")).status, 404);
    assert.equal((await new Client(ctx.mock.url).get("/api/studio/templates/artist")).status, 401);
  });
});

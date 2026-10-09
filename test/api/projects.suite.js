// The projects browser (GET /api/projects/browse, docs/projects.md): every visible project, AutoStacc's and Studio
// creators' (marked unverified until trusted), with derived genres, what it makes and activity; filters (OR within a
// group, AND between), counts, the followed toggle for signed-in visitors only, caching that never shares a personal
// answer, invalid input refused, and Studio projects followable and gone once their creator is suspended.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, adminClient } from "../support/flows.js";

const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const site = { document: { theme: { preset: "paper", accent: "#ff0066", font: "serif" }, pages: [{ slug: "", title: "Home", blocks: [{ type: "heading", text: "Hi" }] }] } };

async function studioProject(base, name) {
  const { c } = await newBuyer(base, "pb");
  const cr = await c.post("/api/studio/creators", { name: `Maker ${name}`, slug: `pb-${tag()}` });
  assert.equal(cr.status, 201, JSON.stringify(cr.data));
  const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name, slug: "browse-me" });
  assert.equal(pr.status, 201, JSON.stringify(pr.data));
  return { c, creator: cr.data.creator, project: pr.data.project };
}

export default (ctx) => describe("projects browser", () => {
  const browse = async (client, qs = "") => {
    const r = await client.get(`/api/projects/browse${qs ? `?${qs}` : ""}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r;
  };
  const ids = (r) => r.data.projects.map((p) => p.id);

  test("anyone can browse; AutoStacc's projects carry genres, what they make and activity; never cached", async () => {
    const anon = new Client(ctx.mock.url);
    const r = await browse(anon);
    assert.match(r.headers.get("cache-control"), /no-store/, "a signed-out copy must not outlive logging in");
    assert.equal(r.data.signedIn, false);
    const gs = r.data.projects.find((p) => p.id === "glitches-and-stitches");
    assert.ok(gs, "the first project is listed");
    assert.equal(gs.verified, true);
    assert.equal(gs.path, "/autostacc/glitches-and-stitches");
    assert.ok(gs.genres.some((g) => g.facet === "genre" && g.value === "electronic"));
    assert.ok(gs.makes.includes("releases") && gs.releases >= 1);
    assert.equal(gs.following, null);
    assert.equal(r.data.toggles.followed, null, "no followed count for strangers");
    for (const p of r.data.projects) assert.equal(p.price, undefined, "nothing is sold here");
  });

  test("filters: OR within a group, AND between groups, counts without their own group, unknown values reported", async () => {
    const anon = new Client(ctx.mock.url);
    const genre = await browse(anon, "genre=electronic");
    assert.ok(ids(genre).includes("glitches-and-stitches"));
    assert.ok(genre.data.projects.every((p) => p.genres.some((g) => g.value === "electronic")));
    assert.ok(genre.data.facets.genre.find((g) => g.value === "electronic").selected);
    const both = await browse(anon, "genre=electronic&makes=releases");
    assert.ok(ids(both).includes("glitches-and-stitches"));
    const none = await browse(anon, `q=${tag()}nothing`);
    assert.equal(none.data.total, 0);
    assert.deepEqual(none.data.projects, []);
    const odd = await browse(anon, "genre=not-a-genre&makes=spaceships");
    assert.deepEqual(odd.data.ignored.sort(), ["genre:not-a-genre", "makes:spaceships"]);
    for (const qs of ["makes=Bad!", "sort=price", "page=0", "page=1.5", "active=2", "followed=yes", `q=${"x".repeat(81)}`]) {
      const r = await anon.get(`/api/projects/browse?${qs}`);
      assert.equal(r.status, 400, qs);
      assert.equal(r.data.error.code, "invalid_filter", qs);
    }
  });

  test("Studio projects: listed once published, marked unverified until trusted, followable, gone when suspended", async () => {
    const name = `Browse ${tag()}`;
    const { c, creator, project } = await studioProject(ctx.mock.url, name);
    const anon = new Client(ctx.mock.url);
    assert.equal((await browse(anon, `q=${encodeURIComponent(name)}`)).data.total, 0, "a draft project is not listed");

    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site });
    assert.equal((await c.post(`/api/studio/projects/${project.id}/publish`, {})).status, 200);
    const listed = (await browse(anon, `q=${encodeURIComponent(name)}`)).data.projects;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].verified, false);
    assert.equal(listed[0].creator, creator.name);
    assert.equal(listed[0].path, `/${creator.slug}/browse-me`);

    // A product released in the future is in "what it makes" but isn't activity yet.
    const soon = new Date(Date.now() + 30 * 86400000).toISOString(), at = new Date().toISOString();
    sql(ctx.mock.stateDir, `INSERT INTO products (id, title, description, type, price_cents, currency, tags, metadata, featured, published, sales_paused, max_quantity,
      project_id, pacs, source, search_text, released_at, created_at, updated_at) VALUES ('pb-future-${tag()}', 'Later', '', 'presets', 500, 'USD', '[]', '{}', 0, 1, 0, 1,
      '${project.id}', '[]', 'studio', 'later', '${soon}', '${at}', '${at}')`);
    const later = (await browse(anon, `q=${encodeURIComponent(name)}`)).data.projects[0];
    assert.ok(later.makes.includes("presets"));
    assert.equal(later.lastActive, null);
    assert.equal(later.recent, false);

    const { c: fan } = await newBuyer(ctx.mock.url, "pbfan");
    const f = await fan.req("PUT", `/api/follows/${project.id}`, { body: { autoStacc: true } });
    assert.equal(f.status, 200, JSON.stringify(f.data));
    const mine = await browse(fan, `followed=1&q=${encodeURIComponent(name)}`);
    assert.match(mine.headers.get("cache-control"), /no-store/, "a personal answer is never cached");
    assert.deepEqual(ids(mine), [project.id]);
    assert.deepEqual(mine.data.projects[0].following, { autoStacc: true });
    assert.equal((await browse(fan, `followed=0&q=${encodeURIComponent(name)}`)).data.total, 0);
    assert.equal((await browse(anon, `followed=1&q=${encodeURIComponent(name)}`)).data.total, 1, "followed means nothing signed out");

    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { trusted: true } })).status, 200);
    assert.equal((await browse(anon, `q=${encodeURIComponent(name)}`)).data.projects[0].verified, true);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { status: "suspended" } })).status, 200);
    assert.equal((await browse(anon, `q=${encodeURIComponent(name)}`)).data.total, 0);
    assert.equal((await fan.req("PUT", `/api/follows/${project.id}`, { body: {} })).status, 404);
  });
});

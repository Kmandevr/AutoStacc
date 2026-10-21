// The creators browser (GET /api/creators, server/projects/creators.js): AutoStacc's own creators and Studio creators
// with a published project, each with only what its /<creator> profile shows (name, address, verified, project names
// and addresses); never a draft, suspended, unpublished or deleted one; public caching; invalid input refused.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, adminClient } from "../support/flows.js";

const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const site = { document: { theme: { preset: "paper", accent: "#ff0066", font: "serif" }, pages: [{ slug: "", title: "Home", blocks: [{ type: "heading", text: "Hi" }] }] } };

export default (ctx) => describe("creators browser", () => {
  const browse = async (qs = "") => {
    const r = await new Client(ctx.mock.url).get(`/api/creators${qs ? `?${qs}` : ""}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r;
  };
  const find = async (name) => (await browse(`q=${encodeURIComponent(name)}`)).data.creators;

  test("anyone can browse; AutoStacc is listed with its projects; the answer is public and cacheable", async () => {
    const r = await browse();
    assert.match(r.headers.get("cache-control"), /public/);
    assert.doesNotMatch(r.headers.get("cache-control"), /no-store|private/);
    const as = r.data.creators.find((c) => c.slug === "autostacc");
    assert.ok(as, "the first creator is listed");
    assert.deepEqual(Object.keys(as).sort(), ["firstParty", "name", "path", "projects", "slug", "verified"]);
    assert.equal(as.path, "/autostacc");
    assert.equal(as.verified, true);
    assert.equal(as.firstParty, true);
    assert.ok(as.projects.some((p) => p.name === "Glitches & Stitches" && p.path === "/autostacc/glitches-and-stitches"));
    for (const p of as.projects) assert.deepEqual(Object.keys(p).sort(), ["name", "path"]);
    assert.ok(r.data.total >= 1 && r.data.page === 1 && r.data.sort === "name");
  });

  test("invalid search, sort or page is refused", async () => {
    const anon = new Client(ctx.mock.url);
    for (const qs of ["sort=price", "sort=", "page=0", "page=1.5", "page=501", `q=${"x".repeat(81)}`]) {
      const r = await anon.get(`/api/creators?${qs}`);
      if (qs === "sort=") { assert.equal(r.status, 200, qs); continue; } // empty means the default
      assert.equal(r.status, 400, qs);
      assert.equal(r.data.error.code, "invalid_filter", qs);
    }
  });

  test("Studio creators: listed once a project is published, unverified until trusted, gone when suspended, unpublished or deleted", async () => {
    const name = `Crafter ${tag()}`;
    const { c } = await newBuyer(ctx.mock.url, "cb");
    const cr = await c.post("/api/studio/creators", { name, slug: `cb-${tag()}` });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const creator = cr.data.creator;
    const pr = await c.post(`/api/studio/creators/${creator.id}/projects`, { name: "Seen Work", slug: "seen-work" });
    assert.equal(pr.status, 201, JSON.stringify(pr.data));
    const project = pr.data.project;
    assert.deepEqual(await find(name), [], "a creator with only a draft project is not listed");

    await c.req("PUT", `/api/studio/projects/${project.id}/site`, { body: site });
    assert.equal((await c.post(`/api/studio/projects/${project.id}/publish`, {})).status, 200);
    const [listed, ...rest] = await find(name);
    assert.equal(rest.length, 0);
    assert.deepEqual(listed, { slug: creator.slug, name, path: `/${creator.slug}`, firstParty: false, verified: false,
      projects: [{ name: "Seen Work", path: `/${creator.slug}/seen-work` }] });
    assert.equal((await find("seen work")).filter((x) => x.slug === creator.slug).length, 1, "search covers project names");

    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { trusted: true } })).status, 200);
    assert.equal((await find(name))[0].verified, true);

    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { status: "suspended" } })).status, 200);
    assert.deepEqual(await find(name), [], "a suspended creator is never listed");
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { status: "active" } })).status, 200);
    assert.equal((await find(name)).length, 1);

    sql(ctx.mock.stateDir, `UPDATE creators SET published = 0 WHERE id = '${creator.id}'`);
    assert.deepEqual(await find(name), [], "an unpublished creator is never listed");
    sql(ctx.mock.stateDir, `UPDATE creators SET published = 1, deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = '${creator.id}'`);
    assert.deepEqual(await find(name), [], "a deleted creator is never listed");
    sql(ctx.mock.stateDir, `UPDATE creators SET deleted_at = NULL WHERE id = '${creator.id}'`);

    assert.equal((await c.post(`/api/studio/projects/${project.id}/unpublish`, {})).status, 200);
    assert.deepEqual(await find(name), [], "a creator whose projects are all unpublished is not listed");
  });

  test("sort by most projects and newest; pages", async () => {
    const all = (await browse("sort=projects")).data.creators;
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].projects.length >= all[i].projects.length);
    assert.equal((await browse("sort=newest")).data.sort, "newest");
    const far = (await browse("page=400")).data;
    assert.deepEqual(far.creators, []);
    assert.equal(far.page, 400);
  });
});

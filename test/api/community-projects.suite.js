// Project spaces on the switched-on store (test/api/community.test.js; core/project-space.js, project-routes.js, the
// projectspaces feature, the Update post type): a creator's team switches a project's community on in the Studio, its
// official space and channels appear, the page is served at /<creator>/<project>/community with that as its one address
// (/community/<space> redirects, the sitemap lists the canonical one), only the team posts Updates, a project without the
// feature has no page, and switching it off makes the space read-only without deleting anything.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

export default (ctx) => describe("community project spaces (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmp"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: `Pj Member ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } })).status, 201);
    return { c, user };
  };
  const clearPace = () => db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-pace:%'");
  async function project(o) {
    const slug = `cp${Date.now().toString(36)}${++n}`;
    const creator = (await o.c.post("/api/studio/creators", { name: `Creator ${slug}`, slug })).data.creator;
    const proj = (await o.c.post(`/api/studio/creators/${creator.id}/projects`, { name: `Project ${slug}`, slug: `proj${n}` })).data.project;
    db(`UPDATE projects SET published = 1 WHERE id = '${proj.id}'`);
    return { creator, proj, base: `/${creator.slug}/${proj.slug}/community`, switchPath: `/api/community/projects/${proj.id}/space` };
  }

  test("the switch makes the space and its channels; only the team switches; first-party projects use their data file", async () => {
    const owner = await person();
    const other = await person();
    const p = await project(owner);
    assert.equal((await new Client(ctx.mock.url).get(p.base)).status, 404, "no feature, no page");
    assert.equal((await other.c.req("PUT", p.switchPath, { body: { on: true } })).status, 404, "not on the team");
    assert.equal((await owner.c.req("PUT", p.switchPath, { body: { on: "yes" } })).status, 400);
    assert.equal((await owner.c.req("PUT", p.switchPath, { body: { on: true } })).status, 200);
    assert.equal((await owner.c.req("PUT", p.switchPath, { body: { on: true } })).status, 200, "idempotent");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_spaces WHERE project_id = '${p.proj.id}'`).n, 1);
    assert.deepEqual(db(`SELECT slug FROM community_channels WHERE space_id = (SELECT id FROM community_spaces WHERE project_id = '${p.proj.id}') ORDER BY position`)[0].map((r) => r.slug), ["announcements", "general", "help"]);
    assert.equal(JSON.parse(one(`SELECT features FROM projects WHERE id = '${p.proj.id}'`).features).includes("community"), true);
    assert.deepEqual((await owner.c.get(p.switchPath)).data.on, true);
    assert.equal((await owner.c.req("PUT", "/api/community/projects/prj_autostacc_nope/space", { body: { on: true } })).status, 404);
    const firstParty = one("SELECT id FROM projects WHERE source = 'catalog' LIMIT 1").id;
    assert.equal((await owner.c.req("PUT", `/api/community/projects/${firstParty}/space`, { body: { on: true } })).status, 404, "not the owner's");
  });

  test("a first-party project with the community feature has a space whose team is AutoStacc's admins, not members", async () => {
    // Another suite in this group unpublishes it (community-rich); live for this check, as it was afterwards.
    const was = one("SELECT published FROM projects WHERE id = 'glitches-and-stitches'").published;
    db("UPDATE projects SET published = 1 WHERE id = 'glitches-and-stitches'");
    const page = await new Client(ctx.mock.url).get("/autostacc/glitches-and-stitches/community");
    db(`UPDATE projects SET published = ${was ? 1 : 0} WHERE id = 'glitches-and-stitches'`);
    assert.equal(page.status, 200);
    const space = one("SELECT s.id FROM community_spaces s JOIN projects p ON p.id = s.project_id WHERE p.source = 'catalog' AND p.id LIKE '%glitches%'");
    assert.ok(space, "the first visit made the space");
    const admin = await freshAdmin(ctx.mock.url);
    const mine = await admin.get(`/api/community/spaces/${space.id}/mine`);
    assert.equal(mine.data.team, true);
    assert.equal(mine.data.mayUpdate, true);
    const member = await person();
    assert.equal((await member.c.get(`/api/community/spaces/${space.id}/mine`)).data.team, false);
  });

  test("the page lives at the project's address; /community/<space> redirects there; the sitemap lists the one address", async () => {
    const owner = await person();
    const p = await project(owner);
    await owner.c.req("PUT", p.switchPath, { body: { on: true } });
    const anon = new Client(ctx.mock.url);
    const page = await anon.get(p.base);
    assert.equal(page.status, 200);
    assert.match(page.data, new RegExp(`<link rel="canonical" href="https?://[^"]+${p.base}">`));
    assert.match(page.data, /Announcements/);
    const slug = one(`SELECT slug FROM community_spaces WHERE project_id = '${p.proj.id}'`).slug;
    const old = await anon.get(`/community/${slug}`);
    assert.equal(old.status, 301);
    assert.equal(new URL(old.headers.get("location")).pathname, p.base);
    assert.equal((await anon.get(`${p.base}/general`)).status, 200);
    assert.equal((await anon.get(`${p.base}/nope`)).status, 404);
    assert.equal((await anon.get(`/${p.creator.slug}/${p.proj.slug}/community/general/extra`)).status, 404);
    const sitemap = (await anon.get("/community/sitemap.xml")).data;
    assert.ok(sitemap.includes(p.base));
    assert.equal(sitemap.includes(`/community/${slug}<`), false);
  });

  test("only the team posts Updates; members can't, even in a channel that takes them", async () => {
    const owner = await person();
    const member = await person();
    const p = await project(owner);
    await owner.c.req("PUT", p.switchPath, { body: { on: true } });
    const channels = db(`SELECT id, slug FROM community_channels WHERE space_id = (SELECT id FROM community_spaces WHERE project_id = '${p.proj.id}')`)[0];
    const ann = channels.find((c) => c.slug === "announcements").id;
    const general = channels.find((c) => c.slug === "general").id;
    clearPace();
    const up = await owner.c.post("/api/community/threads", { channelId: ann, type: "update", title: "New release is out now", body: "Listen on the project page." });
    assert.equal(up.status, 201, JSON.stringify(up.data));
    assert.equal(one(`SELECT type FROM community_threads WHERE id = '${up.data.thread.id}'`).type, "update");
    clearPace();
    assert.equal((await member.c.post("/api/community/threads", { channelId: ann, type: "update", title: "A member's fake update", body: "nope" })).data.error.code, "team_only");
    db(`UPDATE community_channels SET post_types = 'discussion,question,update' WHERE id = '${general}'`);
    clearPace();
    assert.equal((await member.c.post("/api/community/threads", { channelId: general, type: "update", title: "Another fake update", body: "still no" })).data.error.code, "team_only");
    clearPace();
    assert.equal((await member.c.post("/api/community/threads", { channelId: general, type: "discussion", title: "A member's ordinary take", body: "fine" })).status, 201);
    clearPace();
    assert.equal((await member.c.post("/api/community/threads", { channelId: "chn_autostacc_help", type: "poll", title: "A poll isn't startable", body: "x" })).status, 400);
  });

  test("switching it off closes the space read-only and keeps everything; on again opens it", async () => {
    const owner = await person();
    const p = await project(owner);
    await owner.c.req("PUT", p.switchPath, { body: { on: true } });
    assert.equal((await owner.c.req("PUT", p.switchPath, { body: { on: false } })).status, 200);
    assert.deepEqual(db(`SELECT state, state_reason FROM community_spaces WHERE project_id = '${p.proj.id}'`)[0][0], { state: "read_only", state_reason: "community_off" });
    assert.equal((await new Client(ctx.mock.url).get(p.base)).status, 404, "no feature, no page");
    assert.equal((await owner.c.req("PUT", p.switchPath, { body: { on: true } })).status, 200);
    assert.equal(one(`SELECT state FROM community_spaces WHERE project_id = '${p.proj.id}'`).state, "open");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_spaces WHERE project_id = '${p.proj.id}'`).n, 1, "never deleted or duplicated");
  });

  test("security review: a project space shows only while its project is live; a trailing slash has one address; the cap and names hold", async () => {
    const owner = await person();
    const p = await project(owner);
    await owner.c.req("PUT", p.switchPath, { body: { on: true } });
    const anon = new Client(ctx.mock.url);
    const space = db(`SELECT id, slug, name FROM community_spaces WHERE project_id = '${p.proj.id}'`)[0][0];
    const gen = db(`SELECT id FROM community_channels WHERE space_id = '${space.id}' AND slug = 'general'`)[0][0].id;
    clearPace();
    const t = (await owner.c.post("/api/community/threads", { channelId: gen, type: "discussion", title: `Visible only while live ${n}`, body: "first words" })).data.thread;
    const word = "hiddenspacequartz";
    clearPace();
    await owner.c.post("/api/community/threads", { channelId: gen, type: "discussion", title: `Searchable ${word}`, body: "second words" });
    const find = async () => (await anon.get(`/api/community/search?q=${word}`)).data.results.length;
    assert.equal(await find(), 1);
    assert.equal((await anon.get(`${p.base}/`)).status, 301, "a trailing slash goes to the one address");
    assert.equal((await anon.get("/community")).data.includes(space.name), true);
    // The project goes back to draft: everywhere the space and its takes vanish.
    db(`UPDATE projects SET published = 0 WHERE id = '${p.proj.id}'`);
    assert.equal((await anon.get(p.base)).status, 404);
    assert.equal((await anon.get(`/community/${space.slug}`)).status, 404);
    assert.equal((await anon.get(`/community/t/${t.id}`)).status, 404);
    assert.equal((await anon.get("/community")).data.includes(space.name), false);
    assert.equal((await anon.get("/community/sitemap.xml")).data.includes(p.base), false);
    assert.equal(await find(), 0);
    assert.equal((await anon.get(`/api/community/cards?path=${encodeURIComponent(`/community/t/${t.id}`)}`)).status, 404);
    db(`UPDATE projects SET published = 1 WHERE id = '${p.proj.id}'`);
    assert.equal((await anon.get(p.base)).status, 200);
    // Looking at the page never reopens a space the creator closed.
    await owner.c.req("PUT", p.switchPath, { body: { on: false } });
    db(`UPDATE projects SET features = '["community"]' WHERE id = '${p.proj.id}'`);
    await anon.get(p.base);
    assert.equal(one(`SELECT state FROM community_spaces WHERE project_id = '${p.proj.id}'`).state, "read_only");
  });

  test("a creator's project can't name its space after AutoStacc, and a taken name gets the creator's name added", async () => {
    const owner = await person();
    const slug = `cn${Date.now().toString(36)}${++n}`;
    const creator = (await owner.c.post("/api/studio/creators", { name: `Namer ${slug}`, slug })).data.creator;
    const mk = async (name, s) => { const pr = (await owner.c.post(`/api/studio/creators/${creator.id}/projects`, { name, slug: s })).data.project; db(`UPDATE projects SET published = 1 WHERE id = '${pr.id}'`); return pr; };
    const a = await mk("AutoStacc Official Help", "official");
    assert.equal((await owner.c.req("PUT", `/api/community/projects/${a.id}/space`, { body: { on: true } })).status, 200);
    assert.equal(one(`SELECT name FROM community_spaces WHERE project_id = '${a.id}'`).name, `AutoStacc Official Help (Namer ${slug})`);
    const b = await mk("Same Name Project", "same-a");
    await owner.c.req("PUT", `/api/community/projects/${b.id}/space`, { body: { on: true } });
    const other = await person();
    const slug2 = `cm${Date.now().toString(36)}${++n}`;
    const c2 = (await other.c.post("/api/studio/creators", { name: `Second ${slug2}`, slug: slug2 })).data.creator;
    const b2 = (await other.c.post(`/api/studio/creators/${c2.id}/projects`, { name: "Same Name Project", slug: "same-b" })).data.project;
    db(`UPDATE projects SET published = 1 WHERE id = '${b2.id}'`);
    assert.equal((await other.c.req("PUT", `/api/community/projects/${b2.id}/space`, { body: { on: true } })).status, 200);
    assert.equal(one(`SELECT name FROM community_spaces WHERE project_id = '${b2.id}'`).name, `Same Name Project (Second ${slug2})`);
  });

  test("Post as: a project's team posts under the project's name anywhere; others can't; admins may speak for AutoStacc and first-party projects", async () => {
    const owner = await person();
    const other = await person();
    const p = await project(owner);
    const as = `project:${p.proj.id}`;
    assert.ok((await owner.c.get("/api/community/me")).data.identities.some((x) => x.id === as && x.name === p.proj.name));
    assert.deepEqual((await other.c.get("/api/community/me")).data.identities, []);
    clearPace();
    const t = await owner.c.post("/api/community/threads", { channelId: "chn_autostacc_help", type: "question", title: "From the project", body: `Hello ${unique("pa")}`, as });
    assert.equal(t.status, 201, JSON.stringify(t.data));
    assert.equal(one(`SELECT as_team FROM community_threads WHERE id = '${t.data.thread.id}'`).as_team, p.proj.name);
    const rep = await other.c.post(`/api/community/threads/${t.data.thread.id}/posts`, { body: "pretend", as });
    assert.equal(rep.status, 403);
    assert.equal(rep.data.error.code, "team_only");
    assert.equal((await other.c.post(`/api/community/threads/${t.data.thread.id}/posts`, { body: "pretend", as: "autostacc" })).status, 403);
    db(`UPDATE projects SET published = 0 WHERE id = '${p.proj.id}'`);
    assert.equal((await owner.c.post(`/api/community/threads/${t.data.thread.id}/posts`, { body: `Unlisted ${unique("pa")}`, as })).status, 403, "an unpublished project isn't a name to post under");
    db(`UPDATE projects SET published = 1 WHERE id = '${p.proj.id}'`);
    const was = one("SELECT published FROM projects WHERE id = 'glitches-and-stitches'").published;
    db("UPDATE projects SET published = 1 WHERE id = 'glitches-and-stitches'");
    const ids = (await (await freshAdmin(ctx.mock.url)).get("/api/community/me")).data.identities.map((x) => x.id);
    db(`UPDATE projects SET published = ${was ? 1 : 0} WHERE id = 'glitches-and-stitches'`);
    assert.ok(ids.includes("autostacc") && ids.includes("project:glitches-and-stitches"), JSON.stringify(ids));
  });
});

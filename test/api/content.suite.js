// Project content made in the Studio (server/content/): every creator's releases, news posts and shows, first-party
// included. Writes need the right team capability (site.edit for drafts, site.publish for what is live) and look like
// nothing there to anyone else; text is never HTML, links are https only, players and artwork are checked; only
// published content of visible projects reaches the public API, the release and news pages (canonical, Open Graph,
// JSON-LD; noindex for creators AutoStacc doesn't trust) and /sitemap-content.xml; anything else is the site's 404.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, adminClient } from "../support/flows.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const YOUTUBE = "https://www.youtube.com/watch?v=EzVo6Mc8Yt0";
const FIRST_PARTY = { creator: "autostacc", project: "glitches-and-stitches" };
const HOME = `/${FIRST_PARTY.creator}/${FIRST_PARTY.project}`;
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const iso = () => new Date().toISOString();
const ldOf = (html) => {
  const m = String(html).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, "the page has JSON-LD");
  return JSON.parse(m[1])["@graph"];
};

export default (ctx) => describe("content", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const anon = () => new Client(base());
  const page = (p, method = "GET") => anon().req(method, p);
  const kindApi = (projectId, kind) => `/api/studio/projects/${projectId}/${kind}`;

  // A Studio creator with one project. published: its project is visible (as once its site is published).
  async function maker(tag, { published = true } = {}) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = await c.post("/api/studio/creators", { name: `Maker ${tag}`, slug: slug(tag) });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Songs", slug: "songs" });
    assert.equal(pr.status, 201, JSON.stringify(pr.data));
    if (published) db(`UPDATE projects SET published = 1 WHERE id = '${pr.data.project.id}'`);
    return { c, user, creator: cr.data.creator, project: pr.data.project, home: `/${cr.data.creator.slug}/songs` };
  }
  // Another account on a creator's team with this role (invitations are tested in team.suite.js).
  async function teammate(creatorId, role, tag) {
    const t = await newBuyer(base(), tag);
    db(`INSERT INTO creator_members (creator_id, user_id, role, created_at) VALUES ('${creatorId}', '${t.user.id}', 'editor', '${iso()}');
      INSERT INTO creator_roles (creator_id, user_id, role, created_at, updated_at) VALUES ('${creatorId}', '${t.user.id}', '${role}', '${iso()}', '${iso()}')`);
    return t;
  }
  const create = async (c, projectId, kind, body) => {
    const r = await c.post(kindApi(projectId, kind), body);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.item;
  };
  const patch = (c, kind, id, body) => c.req("PATCH", `/api/studio/${kind}/${id}`, { body });
  const publicContent = async (projectId) => {
    const r = await anon().get(`/api/projects/${projectId}/content`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  const release = (o = {}) => ({ title: "First Light", type: "Single", date: "2026-01-15", description: "A test single.",
    tracks: [{ title: "First Light", duration: "3:05", isrc: "QZABC2600001" }], links: [{ name: "Listen", url: "https://example.org/first-light" }], ...o });

  test("the real first-party release and news post (seeded by the migration) are public, with their facts", async () => {
    const content = await publicContent(FIRST_PARTY.project);
    const hail = content.releases.find((r) => r.id === "hail");
    assert.ok(hail, "the HAIL release is in the store database");
    assert.deepEqual([hail.title, hail.type, hail.date, hail.upc, hail.path], ["HAIL", "Single", "2025-10-15", "199746791737", `${HOME}/music/hail`]);
    assert.deepEqual(hail.tracks, [{ title: "HAIL", duration: "2:27", isrc: "QT3FF2517426" }]);
    assert.equal(hail.artwork.src, "/img/releases/hail.jpg");
    const post = content.news.find((n) => n.id === "hail-out-now");
    assert.deepEqual([post.date, post.tag, post.release, post.path], ["2025-10-15", "Release", "hail", `${HOME}/news/hail-out-now`]);
    assert.match(post.bodyHtml, /<a href="https:\/\/music\.apple\.com\/[^"]+" rel="noopener noreferrer nofollow ugc" target="_blank">Apple Music<\/a>/);
    assert.match(post.bodyHtml, /<a href="\/autostacc\/glitches-and-stitches\/music\/hail">/);
    assert.ok(content.shows.every((s) => s.date >= iso().slice(0, 10)), "upcoming shows only");
    assert.ok(content.shows.some((s) => s.city === "Test City"), "the dev seed's test show");
    // Short public caching; unknown and malformed project ids fail closed.
    const r = await anon().get(`/api/projects/${FIRST_PARTY.project}/content`);
    assert.match(r.headers.get("cache-control"), /^public, max-age=\d+$/);
    assert.equal((await anon().get("/api/projects/no-such-project/content")).status, 404);
    assert.ok([400, 404].includes((await anon().get("/api/projects/..%2Fadmin/content")).status));
    const latest = await anon().get("/api/content/latest?limit=1");
    assert.equal(latest.status, 200);
    for (const k of ["releases", "news", "shows"]) assert.ok(latest.data[k].length <= 1, k);
    for (const bad of ["0", "51", "abc", "1.5"]) assert.equal((await anon().get(`/api/content/latest?limit=${bad}`)).status, 400, bad);
  });

  test("release and news pages: title, canonical, Open Graph and JSON-LD for a trusted creator, the site's 404 otherwise", async () => {
    const rel = await page(`${HOME}/music/hail`);
    assert.equal(rel.status, 200);
    assert.match(rel.headers.get("content-type"), /^text\/html/);
    assert.match(rel.data, /<title>HAIL \(single\) · Glitches &amp; Stitches · AutoStacc<\/title>/);
    assert.match(rel.data, new RegExp(`<link rel="canonical" href="${base()}${HOME}/music/hail">`));
    assert.doesNotMatch(rel.data, /name="robots" content="noindex/);
    assert.match(rel.data, /<meta property="og:type" content="music\.album">/);
    assert.match(rel.data, new RegExp(`<meta property="og:url" content="${base()}${HOME}/music/hail">`));
    const graph = ldOf(rel.data);
    const album = graph.find((x) => x["@type"] === "MusicAlbum");
    assert.equal(album.name, "HAIL");
    assert.ok(JSON.stringify(album).includes("QT3FF2517426"), "the track's ISRC");
    const crumbs = graph.find((x) => x["@type"] === "WebPage").breadcrumb;
    assert.equal(crumbs["@type"], "BreadcrumbList");
    assert.equal(crumbs.itemListElement.at(-1).item, `${base()}${HOME}/music/hail`);
    assert.match(rel.data, /<h1 class="glitch"/);
    assert.equal((rel.data.match(/<h1\b/g) || []).length, 1, "one h1");

    const post = await page(`${HOME}/news/hail-out-now`);
    assert.equal(post.status, 200);
    assert.match(post.data, /<title>HAIL is out now · Glitches &amp; Stitches · AutoStacc<\/title>/);
    assert.match(post.data, /<meta property="og:type" content="article">/);
    assert.match(post.data, new RegExp(`<link rel="canonical" href="${base()}${HOME}/news/hail-out-now">`));
    assert.equal(ldOf(post.data).find((x) => x["@type"] === "NewsArticle").headline, "HAIL is out now");
    assert.match(post.data, new RegExp(`href="${HOME}/music/hail"`), "links the release it is about");

    // HEAD answers without a body; mixed case and a trailing slash go to the one clean address.
    const head = await page(`${HOME}/music/hail`, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.data, "");
    for (const odd of [`${HOME}/music/HAIL`, `${HOME}/Music/hail`, `${HOME}/music/hail/`]) {
      const r = await page(odd);
      assert.equal(r.status, 301, odd);
      assert.equal(r.headers.get("location").replace(/^https?:\/\/[^/]+/, ""), `${HOME}/music/hail`, odd);
    }
    // Anything unknown is the static 404 page, never an error or another page.
    for (const missing of [`${HOME}/music/no-such-release`, `${HOME}/news/no-such-post`, `${HOME}/music/hail/extra`, `/${FIRST_PARTY.creator}/no-such-project/music/hail`,
      `/no-such-creator/${FIRST_PARTY.project}/music/hail`, `${HOME}/music/hail%3Cscript%3E`, `${HOME}/music/..%2F..%2Fadmin`]) {
      const r = await page(missing);
      assert.equal(r.status, 404, missing);
      assert.doesNotMatch(String(r.data), /MusicAlbum|NewsArticle/, missing);
    }
    // The old addresses still lead there.
    for (const [old, to] of [["/music/hail", `${HOME}/music/hail`], ["/news/hail-out-now", `${HOME}/news/hail-out-now`], ["/projects/glitches-and-stitches/music/hail", `${HOME}/music/hail`]]) {
      const r = await page(old);
      assert.equal(r.status, 301, old);
      assert.equal(r.headers.get("location").replace(/^https?:\/\/[^/]+/, ""), to, old);
    }
    // The hand-written list pages stay static.
    assert.equal((await page(`${HOME}/music`)).status, 200);
    assert.equal((await page(`${HOME}/news`)).status, 200);
  });

  test("signed out, other creators and teammates without the capability reach nothing", async () => {
    const owner = await maker("ct-owner");
    const thief = await maker("ct-thief");
    const item = await create(owner.c, owner.project.id, "releases", release());
    const shop = await teammate(owner.creator.id, "store_manager", "ct-shop");
    for (const kind of ["releases", "news", "shows"]) {
      assert.equal((await anon().get(kindApi(owner.project.id, kind))).status, 401, `${kind} list signed out`);
      assert.equal((await anon().post(kindApi(owner.project.id, kind), {})).status, 401, `${kind} create signed out`);
      assert.equal((await thief.c.get(kindApi(owner.project.id, kind))).status, 404, `${kind} list by another creator`);
      assert.equal((await thief.c.post(kindApi(owner.project.id, kind), { title: "Mine now", date: "2026-01-01", city: "X", type: "Single" })).status, 404, kind);
      assert.equal((await shop.c.get(kindApi(owner.project.id, kind))).status, 404, `${kind}: a store manager doesn't edit the site`);
      assert.equal((await owner.c.get(kindApi("no-such-project", kind))).status, 404, kind);
    }
    assert.equal((await anon().req("PATCH", `/api/studio/releases/${item.id}`, { body: { title: "x" } })).status, 401);
    assert.equal((await patch(thief.c, "releases", item.id, { title: "Stolen" })).status, 404);
    assert.equal((await thief.c.req("DELETE", `/api/studio/releases/${item.id}`)).status, 404);
    assert.equal((await patch(shop.c, "releases", item.id, { title: "x" })).status, 404);
    // An item id of another kind is not this kind's.
    assert.equal((await patch(owner.c, "news", item.id, { title: "x" })).status, 404);
    // Another site can't write with the owner's cookies.
    const evil = new Client(base(), { origin: "https://evil.example" });
    evil.jar = owner.c.jar;
    assert.equal((await evil.post(kindApi(owner.project.id, "releases"), release({ slug: "evil" }))).status, 403);
    assert.equal((await evil.req("DELETE", `/api/studio/releases/${item.id}`)).status, 403);
    assert.equal(db(`SELECT title, deleted_at FROM project_releases WHERE id = '${item.id}'`)[0].title, "First Light");
    assert.equal(db(`SELECT deleted_at FROM project_releases WHERE id = '${item.id}'`)[0].deleted_at, null);
    // A Studio creator can't reach first-party content either.
    assert.equal((await owner.c.get(kindApi(FIRST_PARTY.project, "releases"))).status, 404);
  });

  test("an editor drafts; only a publisher puts things live, changes what is live or deletes", async () => {
    const owner = await maker("ct-team");
    const editor = await teammate(owner.creator.id, "editor", "ct-editor");
    const list = await editor.c.get(kindApi(owner.project.id, "news"));
    assert.equal(list.status, 200);
    assert.equal(list.data.canPublish, false);
    const draft = await create(editor.c, owner.project.id, "news", { title: "Studio diary", date: "2026-02-01", body: "Day one." });
    assert.equal(draft.published, false);
    assert.equal((await patch(editor.c, "news", draft.id, { body: "Day two." })).status, 200, "drafts are the editor's");
    const live = await patch(editor.c, "news", draft.id, { published: true });
    assert.equal(live.status, 403);
    assert.equal(live.data.error.code, "not_allowed");
    assert.equal((await editor.c.req("DELETE", `/api/studio/news/${draft.id}`)).status, 404);
    assert.equal((await patch(owner.c, "news", draft.id, { published: true })).status, 200);
    assert.equal((await patch(editor.c, "news", draft.id, { title: "Changed live" })).status, 403, "what is live takes a publisher");
    const publisher = await teammate(owner.creator.id, "publisher", "ct-publisher");
    assert.equal((await patch(publisher.c, "news", draft.id, { title: "Changed live" })).status, 200);
    assert.equal((await publisher.c.req("DELETE", `/api/studio/news/${draft.id}`)).status, 200);
  });

  test("a draft is invisible; publishing shows it, unpublishing and deleting take it away; a live address never changes", async () => {
    const s = await maker("ct-states");
    const pageOf = (item) => `${s.home}/music/${item.slug}`;
    const nothing = await s.c.post(kindApi(s.project.id, "releases"), release({ published: true }));
    assert.equal(nothing.status, 400, "a new item starts as a draft");
    const item = await create(s.c, s.project.id, "releases", release({ embedUrl: YOUTUBE, featured: true }));
    assert.equal(item.slug, "first-light", "the slug comes from the title");
    assert.equal(item.path, `${s.home}/music/first-light`);
    assert.equal((await publicContent(s.project.id)).releases.length, 0);
    assert.equal((await page(pageOf(item))).status, 404, "a draft has no page");

    assert.equal((await patch(s.c, "releases", item.id, { published: true })).status, 200);
    const [pub] = (await publicContent(s.project.id)).releases;
    assert.deepEqual([pub.id, pub.featured, pub.path], ["first-light", true, pageOf(item)]);
    assert.match(pub.embedUrl, /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/EzVo6Mc8Yt0/, "the player link becomes the player");
    assert.equal((await page(pageOf(item))).status, 200);
    assert.ok((await anon().get("/api/content/latest")).data.releases.some((r) => r.path === pageOf(item)));

    const locked = await patch(s.c, "releases", item.id, { slug: "renamed" });
    assert.equal(locked.status, 409);
    assert.equal(locked.data.error.code, "slug_locked");
    // A second release with the same address is refused; a second featured one takes the place of the first.
    assert.equal((await s.c.post(kindApi(s.project.id, "releases"), release({ slug: "first-light" }))).status, 409);
    const second = await create(s.c, s.project.id, "releases", release({ title: "Second", featured: true }));
    assert.equal(db(`SELECT featured FROM project_releases WHERE id = '${item.id}'`)[0].featured, 0);
    assert.equal(db(`SELECT featured FROM project_releases WHERE id = '${second.id}'`)[0].featured, 1);

    assert.equal((await patch(s.c, "releases", item.id, { published: false })).status, 200);
    assert.equal((await publicContent(s.project.id)).releases.length, 0);
    assert.equal((await page(pageOf(item))).status, 404, "unpublished: gone at once");
    assert.equal((await patch(s.c, "releases", item.id, { slug: "renamed" })).status, 200, "a draft's address may change");

    assert.equal((await s.c.req("DELETE", `/api/studio/releases/${item.id}`)).status, 200);
    assert.equal((await patch(s.c, "releases", item.id, { title: "back" })).status, 404, "deleted is gone");
    assert.notEqual(db(`SELECT deleted_at FROM project_releases WHERE id = '${item.id}'`)[0].deleted_at, null, "kept, marked deleted");
    await create(s.c, s.project.id, "releases", release({ slug: "renamed" }));

    // A news post names a release of its own project only, and only a published one shows as its release.
    assert.equal((await s.c.post(kindApi(s.project.id, "news"), { title: "News", date: "2026-02-02", release: "no-such-release" })).status, 400);
    const news = await create(s.c, s.project.id, "news", { title: "About the second", date: "2026-02-02", release: second.slug });
    await patch(s.c, "news", news.id, { published: true });
    assert.equal((await publicContent(s.project.id)).news[0].release, null, "its release is still a draft");
    await patch(s.c, "releases", second.id, { published: true });
    assert.equal((await publicContent(s.project.id)).news[0].release, second.slug);

    // Shows: upcoming only, and only once published.
    const past = await create(s.c, s.project.id, "shows", { date: "2020-05-05", city: "Yesterday" });
    const next = await create(s.c, s.project.id, "shows", { date: "2099-05-05", city: "Tomorrow", venue: "Hall", ticketUrl: "https://tickets.example.org/x" });
    assert.deepEqual((await publicContent(s.project.id)).shows, []);
    await patch(s.c, "shows", past.id, { published: true });
    await patch(s.c, "shows", next.id, { published: true });
    assert.deepEqual((await publicContent(s.project.id)).shows.map((x) => x.city), ["Tomorrow"]);

    // A project nobody can see (its site unpublished) shows nothing, page or API.
    db(`UPDATE projects SET published = 0 WHERE id = '${s.project.id}'`);
    assert.equal((await anon().get(`/api/projects/${s.project.id}/content`)).status, 404);
    assert.equal((await page(`${s.home}/music/${second.slug}`)).status, 404);
    db(`UPDATE projects SET published = 1 WHERE id = '${s.project.id}'`);
    // Nor does a suspended creator's.
    db(`UPDATE creators SET status = 'suspended' WHERE id = '${s.creator.id}'`);
    assert.equal((await page(`${s.home}/music/${second.slug}`)).status, 404);
    assert.ok(!(await anon().get("/api/content/latest?limit=50")).data.releases.some((r) => r.path === `${s.home}/music/${second.slug}`));
    db(`UPDATE creators SET status = 'active' WHERE id = '${s.creator.id}'`);
  });

  test("text is never HTML, links are https only, players and artwork are checked", async () => {
    const s = await maker("ct-safe");
    const bad = async (kind, body, field) => {
      const r = await s.c.post(kindApi(s.project.id, kind), body);
      assert.equal(r.status, 400, `${kind} ${JSON.stringify(body)}: ${JSON.stringify(r.data)}`);
      if (field) assert.match(String(r.data.error.field || ""), field);
    };
    for (const url of ["http://example.org/x", "javascript:alert(1)", "data:text/html,x", "//evil.example/x", "https://user:pw@example.org/"])
      await bad("releases", release({ links: [{ name: "x", url }] }), /links/);
    await bad("shows", { date: "2099-01-01", city: "X", ticketUrl: "http://tickets.example.org/" }, /ticketUrl/);
    await bad("shows", { date: "2099-01-01", city: "X", ticketUrl: "javascript:alert(1)" }, /ticketUrl/);
    await bad("releases", release({ embedUrl: "https://evil.example/player" }), /embedUrl/);
    await bad("releases", release({ embedUrl: "javascript:alert(1)" }), /embedUrl/);
    for (const v of [{ type: "Mixtape" }, { date: "2026-02-30" }, { date: "tomorrow" }, { slug: "Not A Slug" }, { slug: "../x" }, { upc: "12ab" },
      { tracks: [{ title: "x", isrc: "nope" }] }, { tracks: "x" }, { featured: "yes" }, { title: "" }])
      await bad("releases", release(v));
    await bad("news", { title: "x" }, /date/);
    await bad("shows", { date: "2099-01-01" }, /city/);
    assert.equal((await s.c.post(kindApi(s.project.id, "releases"), { raw: "x" })).status, 400);
    // Artwork is one of the creator's own images; someone else's, or a made-up one, is refused.
    const other = await maker("ct-art-other");
    const theirs = (await other.c.req("PUT", `/api/studio/creators/${other.creator.id}/images?filename=a.png`, { raw: PNG, headers: { "Content-Type": "image/png" } })).data.image;
    assert.ok(theirs && theirs.id, "uploaded another creator's image");
    await bad("releases", release({ artwork: { asset: theirs.id, width: 1, height: 1, alt: "x" } }), /artwork/);
    await bad("releases", release({ artwork: { asset: "as_aaaaaaaaaaaaaaaa", width: 1, height: 1, alt: "x" } }), /artwork/);
    await bad("releases", release({ artwork: { src: "https://evil.example/a.png", width: 1, height: 1, alt: "x" } }), /artwork/);
    const mine = (await s.c.req("PUT", `/api/studio/creators/${s.creator.id}/images?filename=b.png`, { raw: PNG, headers: { "Content-Type": "image/png" } })).data.image;
    const art = await create(s.c, s.project.id, "releases", release({ slug: "with-art", artwork: { asset: mine.id, width: 1, height: 1, alt: "Cover" } }));
    await patch(s.c, "releases", art.id, { published: true });
    assert.equal((await publicContent(s.project.id)).releases.find((r) => r.id === "with-art").artwork.src, `/media/sites/${mine.id}`);

    // Markup in text is shown as text: in the API, on the page and inside the JSON-LD.
    const evil = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const rel = await create(s.c, s.project.id, "releases", release({ title: `Tricky ${evil}`, slug: "tricky", description: `${evil} "quoted"`, links: [{ name: evil, url: "https://example.org/ok" }] }));
    await patch(s.c, "releases", rel.id, { published: true });
    const news = await create(s.c, s.project.id, "news", { title: `News ${evil}`, slug: "tricky-news", date: "2026-03-03", summary: evil,
      body: `Hello **bold** [safe](https://example.org/a) [bad](javascript:alert(1)) [api](/api/account) ${evil}\n\nSecond paragraph.` });
    await patch(s.c, "news", news.id, { published: true });
    const out = (await publicContent(s.project.id)).news.find((n) => n.id === "tricky-news");
    assert.doesNotMatch(out.bodyHtml, /<script|<img|href="javascript:|href="\/api\//i);
    assert.match(out.bodyHtml, /<strong>bold<\/strong>/);
    assert.match(out.bodyHtml, /<a href="https:\/\/example\.org\/a" rel="noopener noreferrer nofollow ugc" target="_blank">safe<\/a>/);
    assert.match(out.bodyHtml, /&lt;script&gt;/);
    for (const p of [`${s.home}/music/tricky`, `${s.home}/news/tricky-news`]) {
      const html = (await page(p)).data;
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
      // Outside the JSON-LD (where "<" is \u003c and the rest is inert data), no tag of the text survives.
      const markupOnly = html.replace(ld, "");
      assert.doesNotMatch(markupOnly, /<script>alert|<img src=x|onerror=alert\(1\)>/, p);
      assert.match(markupOnly, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, p);
      assert.doesNotMatch(ld, /<\/script/i, `${p}: the JSON-LD can't close its script tag`);
      assert.ok(JSON.parse(ld), p);
    }
    // The page keeps the site's strict security headers.
    const h = (await page(`${s.home}/music/tricky`)).headers;
    assert.match(h.get("content-security-policy") || "", /script-src/);
    assert.equal(h.get("x-content-type-options"), "nosniff");
  });

  test("a creator AutoStacc doesn't trust gets noindex pages and stays out of the content sitemap", async () => {
    const s = await maker("ct-index");
    const rel = await create(s.c, s.project.id, "releases", release({ slug: "indexed-or-not" }));
    await patch(s.c, "releases", rel.id, { published: true });
    const p = `${s.home}/music/indexed-or-not`;
    const html = (await page(p)).data;
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.doesNotMatch(html, /rel="canonical"/);
    let map = await page("/sitemap-content.xml");
    assert.equal(map.status, 200);
    assert.match(map.headers.get("content-type"), /xml/);
    assert.doesNotMatch(map.data, new RegExp(p));
    assert.match(map.data, new RegExp(`<loc>${base()}${HOME}/music/hail</loc>`), "the trusted first-party release is listed");
    assert.match(map.data, new RegExp(`<loc>${base()}${HOME}/news/hail-out-now</loc>`));
    // Once AutoStacc trusts the creator, its page is indexable and listed; drafts never are.
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    const draft = await create(s.c, s.project.id, "releases", release({ slug: "draft-one" }));
    map = await page("/sitemap-content.xml");
    assert.match(map.data, new RegExp(`<loc>${base()}${p}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
    assert.doesNotMatch(map.data, new RegExp(draft.slug));
    assert.match((await page(p)).data, new RegExp(`<link rel="canonical" href="${base()}${p}">`));
    // robots.txt names the content sitemap beside the static one.
    assert.match((await page("/robots.txt")).data, /Sitemap: \S+\/sitemap-content\.xml/);
  });

  describe("first-party content", () => {
    let admin;
    before(async () => { admin = await adminClient(base()); });

    test("only an AutoStacc admin may take an ownerless first-party creator, once", async () => {
      const { c } = await newBuyer(base(), "ct-claimer");
      assert.equal((await c.post(`/api/studio/creators/${FIRST_PARTY.creator}/claim`, {})).status, 404);
      assert.equal((await c.get(kindApi(FIRST_PARTY.project, "releases"))).status, 404);
      const overview = (await admin.get("/api/studio")).data;
      assert.ok(overview.claimable.some((x) => x.id === FIRST_PARTY.creator), "offered to the admin");
      const claim = await admin.post(`/api/studio/creators/${FIRST_PARTY.creator}/claim`, {});
      assert.equal(claim.status, 201, JSON.stringify(claim.data));
      assert.equal((await admin.post(`/api/studio/creators/${FIRST_PARTY.creator}/claim`, {})).status, 404, "never twice");
      assert.equal((await admin.post("/api/studio/creators/no-such-creator/claim", {})).status, 404);
      const mine = (await admin.get("/api/studio")).data.creators.find((x) => x.id === FIRST_PARTY.creator);
      assert.equal(mine.firstParty, true);
      assert.equal(mine.role, "owner");
      assert.ok(mine.capabilities.includes("site.publish") && !mine.capabilities.includes("projects") && !mine.capabilities.includes("money"));
      assert.deepEqual(db(`SELECT role FROM creator_members WHERE creator_id = '${FIRST_PARTY.creator}'`), [{ role: "owner" }]);
      assert.ok(db(`SELECT 1 AS ok FROM admin_audit WHERE action = 'creator.claimed' AND target_id = '${FIRST_PARTY.creator}'`).length, "audited");
    });

    test("its owner runs releases, news and shows like any creator; its pages are indexed; its hand-written pages can't be renamed or deleted", async () => {
      const list = await admin.get(kindApi(FIRST_PARTY.project, "releases"));
      assert.equal(list.status, 200, JSON.stringify(list.data));
      assert.equal(list.data.canPublish, true);
      const hail = list.data.items.find((x) => x.slug === "hail");
      assert.ok(hail && hail.published, "the migrated release is editable");
      // Migrated values the new rules would refuse (root-relative artwork, a Deezer widget) survive an unrelated edit.
      const kept = await patch(admin, "releases", hail.id, { description: hail.description });
      assert.equal(kept.status, 200, JSON.stringify(kept.data));
      const row = db(`SELECT artwork, fallback_embed_url FROM project_releases WHERE id = '${hail.id}'`)[0];
      assert.equal(JSON.parse(row.artwork).src, "/img/releases/hail.jpg");
      assert.equal(row.fallback_embed_url, "https://widget.deezer.com/widget/dark/track/3605198432");
      assert.equal((await patch(admin, "releases", hail.id, { slug: "hail-renamed" })).data.error.code, "slug_locked", "its live address is kept");

      const post = await create(admin, FIRST_PARTY.project, "news", { title: "Studio test post", slug: slug("fp-post"), date: "2026-04-04", tag: "Update", body: "From the Studio." });
      assert.equal((await page(`${HOME}/news/${post.slug}`)).status, 404, "a draft has no page");
      assert.equal((await patch(admin, "news", post.id, { published: true })).status, 200);
      const live = await page(`${HOME}/news/${post.slug}`);
      assert.equal(live.status, 200);
      assert.match(live.data, /<title>Studio test post · Glitches &amp; Stitches · AutoStacc<\/title>/);
      assert.match(live.data, new RegExp(`<link rel="canonical" href="${base()}${HOME}/news/${post.slug}">`));
      assert.match(live.data, /css\/projects\/glitches-and-stitches\/skin\.css/, "wears the project's own look");
      assert.match((await page("/sitemap-content.xml")).data, new RegExp(`${HOME}/news/${post.slug}</loc>`));
      assert.ok((await publicContent(FIRST_PARTY.project)).news.some((n) => n.id === post.slug));
      const show = await create(admin, FIRST_PARTY.project, "shows", { date: "2099-01-02", city: "Studio City" });
      await patch(admin, "shows", show.id, { published: true });
      const browse = (await anon().get("/api/projects/browse")).data.projects.find((p) => p.id === FIRST_PARTY.project);
      assert.ok(browse.releases >= 1 && browse.news >= 2, "the projects browser counts its content from the database");
      assert.equal(browse.nextShow, "2099-01-02");
      assert.equal((await admin.req("DELETE", `/api/studio/shows/${show.id}`)).status, 200);
      assert.equal((await admin.req("DELETE", `/api/studio/news/${post.id}`)).status, 200);
      assert.equal((await page(`${HOME}/news/${post.slug}`)).status, 404, "deleted: gone");

      // Products and content only: the first-party project is never renamed, deleted or given a new sibling here.
      assert.equal((await admin.req("PATCH", `/api/studio/projects/${FIRST_PARTY.project}`, { body: { name: "Renamed" } })).status, 404);
      assert.equal((await admin.req("DELETE", `/api/studio/projects/${FIRST_PARTY.project}`, { body: {} })).status, 404);
      assert.equal((await admin.req("PATCH", `/api/studio/creators/${FIRST_PARTY.creator}`, { body: { name: "Renamed" } })).status, 404);
      assert.equal((await admin.post(`/api/studio/creators/${FIRST_PARTY.creator}/projects`, { name: "Side", slug: "side" })).status, 404);
      assert.equal(db(`SELECT name FROM projects WHERE id = '${FIRST_PARTY.project}'`)[0].name, "Glitches & Stitches");
    });

    test("its owner lists and makes products and uploads artwork; artwork a release uses outlives deleting the file", async () => {
      const products = await admin.get(`/api/studio/projects/${FIRST_PARTY.project}/products`);
      assert.equal(products.status, 200, JSON.stringify(products.data));
      const made = await admin.post(`/api/studio/projects/${FIRST_PARTY.project}/products`, { title: "First-party Kit", type: "sample-pack", priceCents: 900, description: "Drums.", includes: ["kicks"] });
      assert.equal(made.status, 201, JSON.stringify(made.data));
      assert.equal(made.data.product.published, false, "starts as a draft");
      assert.ok((await admin.get(`/api/studio/projects/${FIRST_PARTY.project}/products`)).data.products.some((p) => p.id === made.data.product.id));
      assert.equal((await admin.req("PATCH", `/api/studio/products/${made.data.product.id}`, { body: { deleted: true } })).status, 200, "and removes them");

      const up = await admin.req("PUT", `/api/studio/creators/${FIRST_PARTY.creator}/images?filename=cover.png`, { raw: PNG, headers: { "Content-Type": "image/png" } });
      assert.equal(up.status, 201, JSON.stringify(up.data));
      const rel = await create(admin, FIRST_PARTY.project, "releases", release({ slug: slug("fp-art"), artwork: { asset: up.data.image.id, width: 1, height: 1, alt: "Cover" } }));
      const del = await admin.req("DELETE", `/api/studio/creators/${FIRST_PARTY.creator}/images/${up.data.image.id}`, { body: {} });
      assert.equal(del.status, 200, JSON.stringify(del.data));
      assert.equal(del.data.kept, true, "a release still shows it");
      assert.equal(db(`SELECT status FROM site_assets WHERE id = '${up.data.image.id}'`)[0].status, "active");
      assert.equal((await admin.req("DELETE", `/api/studio/releases/${rel.id}`)).status, 200);
    });

    test("a first-party editor drafts but doesn't publish; the hand-written pages stay where they are", async () => {
      const editor = await teammate(FIRST_PARTY.creator, "editor", "ct-fp-editor");
      const draft = await create(editor.c, FIRST_PARTY.project, "releases", release({ slug: slug("fp-draft") }));
      assert.equal((await patch(editor.c, "releases", draft.id, { published: true })).status, 403);
      assert.equal((await editor.c.req("DELETE", `/api/studio/releases/${draft.id}`)).status, 404);
      assert.equal((await admin.req("DELETE", `/api/studio/releases/${draft.id}`)).status, 200);
      for (const p of [HOME, `${HOME}/music`, `${HOME}/news`]) assert.equal((await page(p)).status, 200, p);
    });
  });
});

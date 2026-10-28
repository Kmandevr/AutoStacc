// Finding on the switched-on store (test/api/community.test.js; features search, tags, similar): search needs all the
// words, finds words in showing replies only, never a hidden or removed take, and takes no wildcard; tags are typed and
// folded, eight at most, no strong words, set by the author for 24 hours or the team, hidden by a space's team or by
// AutoStacc's admins, and a tag lists only showing takes; word levels in titles, names and posts; similar suggests only
// visible questions.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";
const SPACE = "spc_autostacc";

export default (ctx) => describe("community finding (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmf"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: `Finder ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } })).status, 201);
    return { c, user };
  };
  const clearPace = () => db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-pace:%'");
  const take = async (c, title, body, type = "discussion") => { clearPace(); return (await c.post("/api/community/threads", { channelId: HELP, type, title, body })).data.thread; };
  const find = (c, q, extra = "") => c.get(`/api/community/search?q=${encodeURIComponent(q)}${extra}`);

  test("search: all the words, titles and showing replies, never hidden or removed; wildcards are plain text", async () => {
    const a = await person();
    const word = `zyxwv${n}${Date.now().toString(36)}`;
    const t = await take(a.c, `Searchable ${word} title`, "plain body");
    const t2 = await take(a.c, "A different title entirely", `the body has ${word} and gamut`);
    clearPace();
    const r = (await a.c.post(`/api/community/threads/${t2.id}/posts`, { body: `reply mentioning quartzword${word}` })).data.post.id;
    const anon = new Client(ctx.mock.url);
    assert.deepEqual((await find(anon, word)).data.results.map((x) => x.id).sort(), [t.id, t2.id].sort());
    assert.deepEqual((await find(anon, `${word} gamut`)).data.results.map((x) => x.id), [t2.id], "every word must match");
    assert.equal((await find(anon, `quartzword${word}`)).data.results.length, 1);
    db(`UPDATE community_posts SET state = 'removed' WHERE id = '${r}'`);
    assert.equal((await find(anon, `quartzword${word}`)).data.results.length, 0, "a removed reply finds nothing");
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.deepEqual((await find(anon, word)).data.results.map((x) => x.id), [t2.id]);
    assert.equal((await find(anon, "%")).status, 400, "only wildcard characters is no search");
    assert.equal((await find(anon, "zzqqyyxx%")).data.results.length, 0, "a percent sign is just text (a word no test title can contain)");
    assert.equal((await find(anon, "x", "")).status, 400);
    assert.equal((await find(anon, word, "&type=bogus")).status, 400);
    assert.equal((await find(anon, word, "&type=question")).data.results.length, 0);
    assert.equal((await find(anon, word, `&space=${SPACE}`)).data.results.length, 1);
    assert.equal((await find(anon, word, "&space=spc_other")).data.results.length, 0);
  });

  test("tags: typed freely and folded, eight at most, no strong words, the author for 24 hours or the team; hidden here or site-wide", async () => {
    const a = await person();
    const b = await person();
    const team = await freshAdmin(ctx.mock.url);
    await team.req("PUT", "/api/community/me", { body: { displayName: `Tag Admin ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } });
    const t = await take(a.c, `Tagged take ${++n}`, "words");
    const path = `/api/community/threads/${t.id}/tags`;
    const starter = (await a.c.get("/api/community/tags")).data.starter;
    assert.ok(starter.some((x) => x.key === "house") && starter.some((x) => x.key === "serum"), "the starter list still feeds suggestions");
    // Typed freely: folded to one form, duplicates dropped.
    const set = await a.c.req("PUT", path, { body: { tags: ["House", "#serum", "SERUM", "Lo Fi", "made-up-tag"] } });
    assert.equal(set.status, 200);
    assert.deepEqual(set.data.tags, ["house", "serum", "lo-fi", "made-up-tag"]);
    assert.equal((await b.c.req("PUT", path, { body: { tags: ["house"] } })).status, 403, "not the author, not the team");
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] } })).status, 400, "eight at most");
    const rude = await a.c.req("PUT", path, { body: { tags: ["fucking-loud"] } });
    assert.equal(rude.status, 400, "no strong words in tags");
    assert.equal(rude.data.error.code, "word_not_allowed");
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["not a list"] } })).status, 200, "a typed string is still one tag");
    assert.equal((await a.c.req("PUT", path, { body: { tags: "house" } })).status, 400, "a list, not a string");
    assert.equal((await new Client(ctx.mock.url).req("PUT", path, { body: { tags: [] } })).status, 401);
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["house", "serum"] } })).status, 200);
    const shown = (await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags[t.id];
    assert.deepEqual(shown.map((x) => x.key).sort(), ["house", "serum"]);
    assert.ok((await a.c.get("/api/community/tagged?tag=%23House")).data.results.some((x) => x.id === t.id), "found by #Tag in any case");
    // A space's suggested tags and hidden tags: team only.
    assert.equal((await a.c.post(`/api/community/spaces/${SPACE}/tags`, { label: "Mixing help" })).status, 404);
    assert.equal((await team.post(`/api/community/spaces/${SPACE}/tags`, { label: "House" })).status, 409, "the starter list has it");
    assert.equal((await team.post(`/api/community/spaces/${SPACE}/tags`, { label: "Mixing help" })).status, 201);
    assert.equal((await a.c.req("PUT", `/api/community/spaces/${SPACE}/hidden-tags`, { body: { tag: "serum" } })).status, 404, "only the team hides a tag");
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/hidden-tags`, { body: { tag: "Serum" } })).status, 200);
    assert.deepEqual((await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags[t.id].map((x) => x.key), ["house"], "hidden in its space");
    assert.equal((await a.c.get("/api/community/tagged?tag=serum")).data.results.some((x) => x.id === t.id), false);
    assert.equal((await team.req("DELETE", `/api/community/spaces/${SPACE}/hidden-tags`, { body: { tag: "serum" } })).status, 200);
    // Site-wide rules: an admin hides or renames a tag everywhere; nothing tagged is rewritten.
    assert.equal((await a.c.req("PUT", "/api/admin/tags", { body: { tag: "house", action: "hide" } })).status, 404, "admins only");
    assert.equal((await team.req("PUT", "/api/admin/tags", { body: { tag: "serum", action: "rename", renameTo: "serum-synth" } })).status, 200);
    assert.deepEqual((await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags[t.id].map((x) => x.key).sort(), ["house", "serum-synth"]);
    assert.ok((await a.c.get("/api/community/tagged?tag=serum-synth")).data.results.some((x) => x.id === t.id), "the new name finds the old tag");
    assert.equal((await team.req("PUT", "/api/admin/tags", { body: { tag: "house", action: "hide" } })).status, 200);
    assert.equal((await a.c.get("/api/community/tagged?tag=house")).data.results.length, 0, "a hidden tag finds nothing");
    assert.equal((await team.req("PUT", "/api/admin/tags", { body: { tag: "x1", action: "rename", renameTo: "fuck" } })).status, 400, "no strong words as a new name");
    assert.equal(Object.values(one(`SELECT COUNT(*) FROM community_thread_tags WHERE thread_id = '${t.id}' AND tag IN ('house', 'serum')`))[0], 2, "nothing tagged was rewritten");
    for (const tag of ["house", "serum"]) assert.equal((await team.req("DELETE", "/api/admin/tags", { body: { tag } })).status, 200);
    // After 24 hours only the team may.
    db(`UPDATE community_threads SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = '${t.id}'`);
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["house"] } })).status, 403);
    assert.equal((await team.req("PUT", path, { body: { tags: ["house", "techno"] } })).status, 200);
    // Hiding a take hides its tags.
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.equal((await a.c.get("/api/community/tagged?tag=house")).data.results.some((x) => x.id === t.id), false);
    assert.deepEqual((await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags, {});
    assert.equal((await a.c.get("/api/community/tagged?tag=!!!")).status, 400);
    assert.equal((await find(new Client(ctx.mock.url), "ab")).status, 400, "two-letter words aren't searched");
    // A banned author can't retag their take.
    const c = await person();
    const t3 = await take(c.c, `Ban retag ${++n}`, "words here");
    db(`INSERT INTO community_space_bans (space_id, user_id, reason, created_at) VALUES ('${SPACE}', '${c.user.id}', 'test', '2026-10-22T00:00:00.000Z')`);
    assert.equal((await c.c.req("PUT", `/api/community/threads/${t3.id}/tags`, { body: { tags: ["house"] } })).status, 403);
  });

  test("word levels: no strong words or slurs in titles and names; strong words softened in posts, by the reader's setting; a clean space refuses them", async () => {
    const a = await person();
    const team = await freshAdmin(ctx.mock.url);
    await team.req("PUT", "/api/community/me", { body: { displayName: `Clean Admin ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } });
    const start = (c, title, body) => { clearPace(); return c.post("/api/community/threads", { channelId: HELP, type: "discussion", title, body }); };
    assert.equal((await start(a.c, "This fucking compressor", "help")).data.error.code, "word_not_allowed", "no strong words in a title");
    assert.equal((await start(a.c, "A living hell of a mix", "help")).status, 201, "mild words are fine");
    const ok = await start(a.c, `Loud ${++n} mix question`, "this drop is fucking loud #LoFi");
    assert.equal(ok.status, 201);
    assert.equal((await start(a.c, `Slur ${++n} here`, "you f4ggot")).status, 403, "slurs never");
    const html = await (await fetch(`${ctx.mock.url}${ok.data.thread.path}`)).text();
    assert.match(html, /class="cm-sw" data-w="fucking">f&#42;/, "softened in the page, the word kept for the reader's setting");
    assert.match(html, /class="cm-hashtag" href="\/search\?q=%23lofi"/);
    // The reader's setting.
    assert.equal((await a.c.get("/api/community/me")).data.member.wordView, "restricted", "softened by default");
    assert.equal((await a.c.req("PUT", "/api/community/me/words", { body: { view: "loud" } })).status, 400);
    assert.equal((await a.c.req("PUT", "/api/community/me/words", { body: { view: "none" } })).status, 200);
    assert.equal((await a.c.get("/api/community/me")).data.member.wordView, "none");
    assert.equal((await new Client(ctx.mock.url).req("PUT", "/api/community/me/words", { body: { view: "off" } })).status, 401);
    // Usernames.
    const c = new Client(ctx.mock.url);
    await verifiedUser(c, unique("cmw"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: "Bitch Please", ageConfirmed: true } })).data.error.code, "word_not_allowed");
    // A clean space: team only, and only ever stricter.
    assert.equal((await a.c.req("PUT", `/api/community/spaces/${SPACE}/clean-words`, { body: { clean: true } })).status, 404);
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/clean-words`, { body: { clean: true } })).status, 200);
    assert.equal((await start(a.c, `Clean ${++n} space test`, "a fucking good loop")).status, 403);
    assert.equal((await start(a.c, `Clean ${++n} space test`, "a damn good loop")).status, 201, "mild words still pass");
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/clean-words`, { body: { clean: false } })).status, 200);
  });

  test("similar: visible questions that share the words, best first; nothing for other kinds or hidden takes", async () => {
    const a = await person();
    const stamp = Date.now().toString(36);
    const q1 = await take(a.c, `How do I route sidechain compression ${stamp}`, "asking", "question");
    const q2 = await take(a.c, `Sidechain pumping sounds weak ${stamp}`, "asking differently", "question");
    await take(a.c, `Sidechain discussion ${stamp} thoughts`, "a discussion, not a question");
    const r = (await a.c.get(`/api/community/similar?title=${encodeURIComponent(`sidechain compression ${stamp} routing`)}`)).data.similar;
    assert.equal(r[0].id, q1.id);
    assert.ok(r.some((x) => x.id === q2.id), "the weaker match is still listed");
    assert.equal(r.every((x) => [q1.id, q2.id].includes(x.id)), true, "questions only");
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${q1.id}'`);
    assert.equal((await a.c.get(`/api/community/similar?title=${encodeURIComponent(`sidechain compression ${stamp}`)}`)).data.similar.some((x) => x.id === q1.id), false);
    assert.deepEqual((await a.c.get("/api/community/similar?title=a")).data.similar, []);
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_threads WHERE id = '${q1.id}'`).n, 1);
  });
});

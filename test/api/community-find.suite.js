// Finding on the switched-on store (test/api/community.test.js; features search, tags, similar): search needs all the
// words, finds words in showing replies only, never a hidden or removed take, and takes no wildcard; tags come only from
// the list (AutoStacc's starter plus the space's own), at most three, set by the author for 24 hours or the team, and
// a tag lists only showing takes; similar suggests only visible questions.
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
    assert.equal((await find(anon, "100%")).data.results.length, 0, "a percent sign is just text");
    assert.equal((await find(anon, "x", "")).status, 400);
    assert.equal((await find(anon, word, "&type=bogus")).status, 400);
    assert.equal((await find(anon, word, "&type=question")).data.results.length, 0);
    assert.equal((await find(anon, word, `&space=${SPACE}`)).data.results.length, 1);
    assert.equal((await find(anon, word, "&space=spc_other")).data.results.length, 0);
  });

  test("tags: only from the list, three at most, the author for 24 hours or the team; a tag lists only showing takes", async () => {
    const a = await person();
    const b = await person();
    const team = await freshAdmin(ctx.mock.url);
    await team.req("PUT", "/api/community/me", { body: { displayName: `Tag Admin ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } });
    const t = await take(a.c, `Tagged take ${++n}`, "words");
    const path = `/api/community/threads/${t.id}/tags`;
    const starter = (await a.c.get("/api/community/tags")).data.starter;
    assert.ok(starter.some((x) => x.key === "house") && starter.some((x) => x.key === "serum") && starter.some((x) => x.key === "ableton-live"));
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["house", "serum"] } })).status, 200);
    assert.equal((await b.c.req("PUT", path, { body: { tags: ["house"] } })).status, 403, "not the author, not the team");
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["house", "serum", "techno", "trance"] } })).status, 400, "three at most");
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["made-up-tag"] } })).status, 400, "from the list only");
    assert.equal((await new Client(ctx.mock.url).req("PUT", path, { body: { tags: [] } })).status, 401);
    const shown = (await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags[t.id];
    assert.deepEqual(shown.map((x) => x.key).sort(), ["house", "serum"]);
    assert.deepEqual((await a.c.get("/api/community/tagged?tag=house")).data.results.some((x) => x.id === t.id), true);
    // A space's own tag: team only, then usable.
    assert.equal((await a.c.post(`/api/community/spaces/${SPACE}/tags`, { label: "Mixing help" })).status, 404);
    assert.equal((await team.post(`/api/community/spaces/${SPACE}/tags`, { label: "House" })).status, 409, "the starter list has it");
    assert.equal((await team.post(`/api/community/spaces/${SPACE}/tags`, { label: "Mixing help" })).status, 201);
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["mixing-help"] } })).status, 200);
    assert.equal((await team.req("PUT", path, { body: { tags: ["house"] } })).status, 200, "the team can set tags too");
    // After 24 hours only the team may.
    db(`UPDATE community_threads SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = '${t.id}'`);
    assert.equal((await a.c.req("PUT", path, { body: { tags: ["house"] } })).status, 403);
    assert.equal((await team.req("PUT", path, { body: { tags: ["house", "techno"] } })).status, 200);
    // Removing the space tag clears it from takes; hiding a take hides its tags.
    assert.equal((await team.req("DELETE", `/api/community/spaces/${SPACE}/tags`, { body: { key: "mixing-help" } })).status, 200);
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.equal((await a.c.get("/api/community/tagged?tag=house")).data.results.some((x) => x.id === t.id), false);
    assert.deepEqual((await a.c.get(`/api/community/tags/for?threads=${t.id}`)).data.tags, {});
    assert.equal((await a.c.get("/api/community/tagged?tag=Bad Tag!")).status, 400);
    assert.equal((await a.c.get("/api/community/tagged?tag=mixing-help")).status, 400, "a space's own tag needs its space");
    assert.equal((await find(new Client(ctx.mock.url), "ab")).status, 400, "two-letter words aren't searched");
    // A banned author can't retag their take.
    const c = await person();
    const t3 = await take(c.c, `Ban retag ${++n}`, "words here");
    db(`INSERT INTO community_space_bans (space_id, user_id, reason, created_at) VALUES ('${SPACE}', '${c.user.id}', 'test', '2026-10-22T00:00:00.000Z')`);
    assert.equal((await c.c.req("PUT", `/api/community/threads/${t3.id}/tags`, { body: { tags: ["house"] } })).status, 403);
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

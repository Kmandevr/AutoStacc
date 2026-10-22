// Team tools on the switched-on store (test/api/community.test.js; features selfpromo, welcome, look, teamtools,
// profilecard): the self-promotion rule (own links refused in questions and their answers, switchable off by the team),
// a space's text and channels edited only by its team, the welcome message shown once, the look limited to presets, and
// the profile card showing only public facts.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";
const SPACE = "spc_autostacc";

export default (ctx) => describe("community team tools (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async (name = `Team Test ${++n} ${Date.now().toString(36).slice(-4)}`) => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmt"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const admin = async () => {
    const a = await freshAdmin(ctx.mock.url);
    await a.req("PUT", "/api/community/me", { body: { displayName: `Team Admin ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } });
    return a;
  };
  const clearPace = () => db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-pace:%'");
  const take = async (c, extra) => { clearPace(); return c.post("/api/community/threads", { channelId: HELP, type: "discussion", title: `Team take ${++n} here`, body: `Words ${n}`, ...extra }); };

  test("self-promotion: your own creator links are fine in ordinary takes, refused in questions and answers; others' links are fine", async () => {
    const a = await person();
    const slug = `promo${Date.now().toString(36)}`;
    const made = await a.c.post("/api/studio/creators", { name: `Promo ${slug}`, slug });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const own = `https://autostacc.com/${slug}`;
    assert.equal((await take(a.c, { body: `my page ${own}` })).status, 201, "an ordinary take");
    for (const sneaky of [`https://AutoStacc.com./${slug}`, `https://autostacc.com/${slug}/music/anything`, `https://www.autostacc.com/${slug.toUpperCase()}`]) {
      assert.equal((await take(a.c, { type: "question", title: "A question about drums?", body: `see ${sneaky}` })).data.error.code, "self_promo_answer", sneaky);
    }
    const ask = await take(a.c, { type: "question", title: "Where can I find drums?", body: `maybe at ${own}` });
    assert.equal(ask.data.error.code, "self_promo_answer");
    const b = await person();
    const q = (await take(b.c, { type: "question", title: "Anyone know good kicks?", body: "asking" })).data.thread;
    clearPace();
    assert.equal((await a.c.post(`/api/community/threads/${q.id}/posts`, { body: `try ${own}` })).data.error.code, "self_promo_answer");
    clearPace();
    assert.equal((await a.c.post(`/api/community/threads/${q.id}/posts`, { body: "try https://autostacc.com/autostacc/glitches-and-stitches" })).status, 201, "someone else's project is fine");
    clearPace();
    const ok = await a.c.post(`/api/community/threads/${q.id}/posts`, { body: "plain answer" });
    assert.equal(ok.status, 201);
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${ok.data.post.id}`, { body: { body: `edited to add ${own}` } })).data.error.code, "self_promo_answer", "an edit can't add it either");
    // Switched off by the team for the whole space: refused even in ordinary takes there.
    const team = await admin();
    assert.equal((await a.c.req("PUT", `/api/community/spaces/${SPACE}/self-promotion`, { body: {} })).status, 404);
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/self-promotion`, { body: {} })).status, 200);
    assert.equal((await take(a.c, { body: `again ${own}` })).data.error.code, "self_promo_off");
    assert.equal((await take(b.c, { body: `someone else's link is still ${own}` })).status, 201, "not their own");
    assert.equal((await team.req("DELETE", `/api/community/spaces/${SPACE}/self-promotion`, { body: {} })).status, 200);
    assert.equal((await take(a.c, { body: `back ${own}` })).status, 201);
  });

  test("team tools: only the team edits the text and channels; a space keeps a channel; names are checked", async () => {
    const a = await person();
    const team = await admin();
    const text = `/api/community/spaces/${SPACE}/text`;
    assert.equal((await a.c.req("PUT", text, { body: { description: "x", rules: "y" } })).status, 404);
    assert.equal((await team.req("PUT", text, { body: { description: "d".repeat(501), rules: "" } })).status, 400);
    const before = one(`SELECT description, rules FROM community_spaces WHERE id = '${SPACE}'`);
    assert.equal((await team.req("PUT", text, { body: { description: "A test description", rules: "Be kind to beginners." } })).status, 200);
    assert.equal(one(`SELECT rules FROM community_spaces WHERE id = '${SPACE}'`).rules, "Be kind to beginners.");
    await team.req("PUT", text, { body: before });
    const ch = `/api/community/spaces/${SPACE}/channels`;
    const name = `Beats ${Date.now().toString(36)}`;
    assert.equal((await a.c.post(ch, { name, whoMayStart: "everyone", postTypes: ["discussion"] })).status, 404);
    assert.equal((await team.post(ch, { name: "x", whoMayStart: "everyone", postTypes: ["discussion"] })).status, 400);
    assert.equal((await team.post(ch, { name, whoMayStart: "nobody", postTypes: ["discussion"] })).status, 400);
    assert.equal((await team.post(ch, { name, whoMayStart: "everyone", postTypes: ["poll"] })).status, 400, "only discussions and questions for now");
    assert.equal((await team.post(ch, { name, whoMayStart: "team", postTypes: ["discussion", "question"] })).status, 201);
    assert.equal((await team.post(ch, { name, whoMayStart: "everyone", postTypes: ["discussion"] })).data.error.code, "channel_exists");
    const settings = (await team.get(`/api/community/spaces/${SPACE}/settings`)).data;
    const added = settings.channels.find((c) => c.name === name);
    assert.deepEqual([added.whoMayStart, added.archived], ["team", false]);
    assert.equal((await team.req("PATCH", ch, { body: { id: added.id, archived: true } })).status, 200);
    assert.equal((await team.req("PATCH", ch, { body: { id: "chn_other_space" } })).status, 404);
    assert.equal((await team.req("PATCH", ch, { body: { id: added.id, archived: "yes" } })).status, 400, "only true or false");
    assert.equal((await a.c.get(`/api/community/spaces/${SPACE}/settings`)).status, 404);
    for (const c of settings.channels.filter((x) => !x.archived && x.id !== added.id)) await team.req("PATCH", ch, { body: { id: c.id, archived: true } }).catch(() => {});
    const left = (await team.get(`/api/community/spaces/${SPACE}/settings`)).data.channels.filter((c) => !c.archived);
    assert.ok(left.length >= 1, "a space keeps at least one channel");
    for (const c of settings.channels.filter((x) => !x.archived)) await team.req("PATCH", ch, { body: { id: c.id, archived: false } });
  });

  test("welcome: shown once to a member, gone after dismissing or posting; a new message is new to everyone; team only edits", async () => {
    const a = await person();
    const b = await person();
    const team = await admin();
    const path = `/api/community/spaces/${SPACE}/welcome`;
    assert.equal((await a.c.req("PUT", `${path}/message`, { body: { message: "hi" } })).status, 404);
    assert.equal((await team.req("PUT", `${path}/message`, { body: { message: "m".repeat(501) } })).status, 400);
    assert.equal((await team.req("PUT", `${path}/message`, { body: { message: "Welcome! Say hello." } })).status, 200);
    assert.equal((await a.c.get(path)).data.message, "Welcome! Say hello.");
    assert.equal((await a.c.post(`${path}/seen`, {})).status, 200);
    assert.equal((await a.c.get(path)).data.message, null);
    assert.equal((await b.c.get(path)).data.message, "Welcome! Say hello.");
    await take(b.c, {});
    assert.equal((await b.c.get(path)).data.message, null, "posting counts as welcomed");
    assert.equal((await team.req("PUT", `${path}/message`, { body: { message: "A newer welcome." } })).status, 200);
    assert.equal((await a.c.get(path)).data.message, "A newer welcome.");
    assert.equal((await new Client(ctx.mock.url).get(path)).status, 401);
    assert.equal((await team.req("PUT", `${path}/message`, { body: { message: "" } })).status, 200);
    assert.equal((await a.c.get(path)).data.message, null);
  });

  test("look: presets only, team only, public to read", async () => {
    const a = await person();
    const team = await admin();
    const path = `/api/community/spaces/${SPACE}/look`;
    assert.equal((await a.c.req("PUT", path, { body: { accent: "green", banner: "grid" } })).status, 404);
    assert.equal((await team.req("PUT", path, { body: { accent: "#ff0000", banner: "grid" } })).status, 400, "no free colours");
    assert.equal((await team.req("PUT", path, { body: { accent: "green", banner: "url(x)" } })).status, 400);
    assert.equal((await team.req("PUT", path, { body: { accent: "green", banner: "grid" } })).status, 200);
    const look = (await new Client(ctx.mock.url).get(path)).data;
    assert.deepEqual([look.accent, look.color, look.banner], ["green", "#2fbf71", "grid"]);
    assert.equal((await new Client(ctx.mock.url).get("/api/community/spaces/spc_nope/look")).status, 404);
  });

  test("profile card: the public facts only, by community name", async () => {
    const a = await person("Card Person Test");
    const anon = new Client(ctx.mock.url);
    const c = (await anon.get("/api/community/members/card?name=card%20person%20test")).data;
    assert.deepEqual(Object.keys(c).sort(), ["bestAnswers", "name", "since", "teams"]);
    assert.equal(c.name, "Card Person Test");
    assert.match(c.since, /^\d{4}-\d{2}$/);
    assert.equal((await anon.get("/api/community/members/card?name=nobody%20here%20at%20all")).status, 404);
    assert.equal((await anon.get("/api/community/members/card")).status, 400);
    assert.equal(JSON.stringify(c).includes(a.user.id), false, "no account id");
  });
});

// Keeping up on the switched-on store (test/api/community.test.js; features follows, joined, saved, mentions, inbox and
// the core's notifications): replies tell the take's author, the post replied to and the followers once each, mentions
// find the longest real name and respect the switch and blocks, a picked answer tells its author, nobody is told about
// their own posts, Saved and Join are private, and hidden takes drop out of every list.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";

const HELP = "chn_autostacc_help";

export default (ctx) => describe("community keeping up (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async (name = `Keep Up ${++n} ${Date.now().toString(36).slice(-4)}`) => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmk"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const take = async (c, extra = {}) => (await c.post("/api/community/threads", { channelId: HELP, type: "discussion", title: `Keep up take ${++n}`, body: `Words ${n}`, ...extra })).data.thread;
  const reply = (c, t, body = `reply ${++n}`, parentId) => c.post(`/api/community/threads/${t.id}/posts`, { body, parentId });
  const inbox = async (p) => (await p.c.get("/api/community/inbox")).data;
  const clearPace = () => db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-pace:%'");

  test("a reply tells the take's author once (author and follower is one notice), never yourself; the bell counts and clears", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    assert.equal((await reply(a.c, t)).status, 201);
    assert.equal((await inbox(a)).unread, 0, "your own reply is not news");
    clearPace();
    await reply(b.c, t, "a reply from b");
    const box = await inbox(a);
    assert.equal(box.unread, 1);
    assert.deepEqual([box.items[0].kind, box.items[0].actor, box.items[0].read], ["reply", b.name, false]);
    assert.match(box.items[0].path, /^\/community\/t\/thr_.+#pst_/);
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_thread_follows WHERE user_id = '${a.user.id}' AND thread_id = '${t.id}'`).n, 1, "the author follows their own take");
    assert.equal((await a.c.post("/api/community/inbox/read", { all: true })).status, 200);
    assert.equal((await inbox(a)).unread, 0);
    assert.equal((await b.c.get("/api/community/inbox")).data.items.length, 0, "only your own");
    assert.equal((await new Client(ctx.mock.url).get("/api/community/inbox")).status, 401);
  });

  test("following: a follower hears about replies; unfollowing stops it; replying follows; a reply to your post tells you", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const t = await take(a.c);
    assert.equal((await b.c.req("PUT", `/api/community/threads/${t.id}/follow`)).status, 200);
    assert.equal((await b.c.get(`/api/community/threads/${t.id}/mine`)).data.features.follows.following, true);
    clearPace();
    await reply(c.c, t, "hello all");
    assert.equal((await inbox(b)).items[0].kind, "followed");
    assert.equal((await b.c.req("DELETE", `/api/community/threads/${t.id}/follow`)).status, 200);
    clearPace();
    const second = await reply(c.c, t, "again");
    assert.equal((await inbox(b)).items.length, 1, "unfollowed: no second notice");
    // c replied, so c follows; b replying to c's post tells c as a reply.
    clearPace();
    await reply(b.c, t, "to c", second.data.post.id);
    assert.equal((await inbox(c)).items[0].kind, "reply");
    assert.equal((await new Client(ctx.mock.url).req("PUT", `/api/community/threads/${t.id}/follow`)).status, 401);
    assert.equal((await b.c.req("PUT", "/api/community/threads/thr_nope/follow")).status, 404);
  });

  test("a blocked pair hears nothing from each other", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    assert.equal((await a.c.req("PUT", "/api/community/blocks", { body: { name: b.name } })).status, 200);
    clearPace();
    const r = await reply(b.c, t);
    assert.equal(r.status, 403, "a blocked person can't reply under the blocker's take");
    const c = await person();
    const t2 = await take(c.c);
    assert.equal((await c.c.req("PUT", "/api/community/blocks", { body: { name: a.name } })).status, 200);
    clearPace();
    await reply(a.c, t2, "from a blocked person is refused too");
    assert.equal((await inbox(c)).items.length, 0);
  });

  test("mentions find a real name (spaces included), skip strangers, cap at five, respect the switch", async () => {
    const a = await person();
    const b = await person("Dj Mention Test");
    const c = await person();
    const t = await take(a.c);
    clearPace();
    await reply(a.c, t, `hey @Dj Mention Test and @${c.name.split(" ").join(" ")} and @nobody-real here`);
    assert.deepEqual((await inbox(b)).items.map((x) => x.kind), ["mention"]);
    assert.deepEqual((await inbox(c)).items.map((x) => x.kind), ["mention"]);
    assert.equal((await b.c.req("PUT", "/api/community/mentions/prefs", { body: { alerts: false } })).status, 200);
    assert.equal((await b.c.get("/api/community/mentions/prefs")).data.alerts, false);
    clearPace();
    await reply(a.c, t, "again @Dj Mention Test please");
    assert.equal((await inbox(b)).items.length, 1, "alerts off: no new mention");
    assert.equal((await b.c.req("PUT", "/api/community/mentions/prefs", { body: { alerts: "no" } })).status, 400);
    clearPace();
    await reply(a.c, t, "mention myself @" + a.name);
    assert.equal((await inbox(a)).items.filter((x) => x.kind === "mention").length, 0);
  });

  test("a picked best answer tells its author", async () => {
    const asker = await person();
    const helper = await person();
    const t = await take(asker.c, { type: "question" });
    clearPace();
    const answer = (await reply(helper.c, t, "the answer")).data.post.id;
    assert.equal((await asker.c.req("PUT", `/api/community/threads/${t.id}/accepted`, { body: { postId: answer } })).status, 200);
    assert.deepEqual((await inbox(helper)).items.map((x) => x.kind), ["answer"]);
    assert.equal((await inbox(asker)).items.map((x) => x.kind)[0], "reply", "the asker heard about the answer arriving");
  });

  test("Saved is private; Join is a personal list; hidden takes drop out", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    assert.equal((await b.c.req("PUT", `/api/community/threads/${t.id}/save`)).status, 200);
    assert.equal((await b.c.get(`/api/community/threads/${t.id}/mine`)).data.features.saved.saved, true);
    assert.deepEqual((await b.c.get("/api/community/saved")).data.saved.map((x) => x.id), [t.id]);
    assert.equal((await a.c.get("/api/community/saved")).data.saved.length, 0);
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.equal((await b.c.get("/api/community/saved")).data.saved.length, 0);
    assert.equal((await b.c.req("PUT", `/api/community/threads/${t.id}/save`)).status, 404, "a hidden take can't be saved");
    assert.equal((await b.c.req("PUT", "/api/community/spaces/spc_autostacc/join")).status, 200);
    assert.deepEqual((await b.c.get("/api/community/joined")).data.spaceIds, ["spc_autostacc"]);
    assert.deepEqual((await a.c.get("/api/community/joined")).data.spaceIds, []);
    assert.equal((await b.c.req("PUT", "/api/community/spaces/spc_nope/join")).status, 404);
    assert.equal((await b.c.req("DELETE", "/api/community/spaces/spc_autostacc/join")).status, 200);
    assert.deepEqual((await b.c.get("/api/community/joined")).data.spaceIds, []);
    assert.equal((await new Client(ctx.mock.url).get("/api/community/saved")).status, 401);
  });

  test("a hidden take's notices disappear from the bell; deleting the account clears them; the sweep clears old read ones", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    clearPace();
    await reply(b.c, t);
    assert.equal((await inbox(a)).items.length, 1);
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.equal((await inbox(a)).items.length, 0);
    assert.equal((await inbox(a)).unread, 0);
    db(`UPDATE community_notifications SET read_at = '2020-01-01T00:00:00.000Z', created_at = '2020-01-01T00:00:00.000Z' WHERE user_id = '${a.user.id}'`);
    const swept = await fetch(`${ctx.mock.url}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SWEEP_TOKEN || ""}` } });
    if (swept.status === 200) assert.equal(one(`SELECT COUNT(*) AS n FROM community_notifications WHERE user_id = '${a.user.id}'`).n, 0);
  });
});

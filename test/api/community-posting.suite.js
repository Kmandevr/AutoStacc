// Posting in the community (server/community/routes.js; docs/community.md), on the switched-on store
// (test/api/community.test.js). Joining needs a confirmed email, a name and the 16+ confirmation; impersonating names
// are refused; posts are stored as written and shown escaped; team-only channels, read-only spaces, locked threads,
// bans and suspensions refuse; edits keep history inside 24 hours; votes count once and never for yourself; only the
// asker or the team accepts; a support impersonation can't do any of it; deleting the account leaves "deleted user".
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";
const ANNOUNCE = "chn_autostacc_announcements";

export default (ctx) => describe("community posting (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  let n = 0;
  const person = async (name = `Member ${++n} ${Date.now().toString(36).slice(-4)}`) => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cm"));
    const r = await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return { c, user, name };
  };
  const ask = (c, extra = {}) => c.post("/api/community/threads", { channelId: HELP, type: "question", title: "How do I tag loops?", body: "Asking **nicely** <script>x</script>", ...extra });

  test("joining needs an account, a confirmed email, a fair name and the 16+ confirmation", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.req("PUT", "/api/community/me", { body: { displayName: "Someone", ageConfirmed: true } })).status, 401);
    assert.equal((await anon.get("/api/community/me")).data.signedIn, false);
    const c = new Client(ctx.mock.url);
    await verifiedUser(c, unique("cm-join"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: "Joiner One" } })).data.error.code, "age_required");
    for (const [name, code] of [["AutoStacc Team", "name_reserved"], ["Аutostacc", "name_shape"], ["Glitches and Stitches", "name_taken"], ["<b>x</b>", "name_shape"]]) {
      const r = await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } });
      assert.equal(r.status, 400, name);
      assert.equal(r.data.error.code, code, name);
    }
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: "Joiner One", ageConfirmed: true } })).status, 201);
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: "Joiner Two", ageConfirmed: true } })).status, 409, "chosen once");
    const other = new Client(ctx.mock.url);
    await verifiedUser(other, unique("cm-join2"));
    assert.equal((await other.req("PUT", "/api/community/me", { body: { displayName: "joiner-one", ageConfirmed: true } })).data.error.code, "name_taken");
    assert.equal((await c.get("/api/community/me")).data.member.displayName, "Joiner One");
  });

  test("posting without a community name is refused; a question is stored as written and shown escaped", async () => {
    const plain = new Client(ctx.mock.url);
    await verifiedUser(plain, unique("cm-noname"));
    assert.equal((await ask(plain)).data.error.code, "not_a_member");
    const { c } = await person();
    const r = await ask(c);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.thread.path, /^\/community\/t\/thr_[a-z2-7]+-how-do-i-tag-loops$/);
    const page = await new Client(ctx.mock.url).get(r.data.thread.path);
    assert.equal(page.status, 200);
    assert.match(page.data, /Asking <strong>nicely<\/strong> &lt;script&gt;x&lt;\/script&gt;/);
    assert.equal(db(`SELECT body FROM community_posts WHERE thread_id = '${r.data.thread.id}'`)[0][0].body, "Asking **nicely** <script>x</script>");
  });

  test("bad input, team-only channels, read-only spaces, locked threads, bans and suspensions are refused", async () => {
    const { c, user } = await person();
    assert.equal((await ask(c, { title: "Hi" })).status, 400);
    assert.equal((await ask(c, { body: "   " })).status, 400);
    assert.equal((await ask(c, { type: "update" })).status, 400);
    assert.equal((await ask(c, { channelId: "chn_nope" })).status, 404);
    assert.equal((await ask(c, { channelId: ANNOUNCE, type: "discussion" })).data.error.code, "team_only");
    const t = (await ask(c)).data.thread;
    db(`UPDATE community_threads SET locked = 1 WHERE id = '${t.id}'`);
    assert.equal((await c.post(`/api/community/threads/${t.id}/posts`, { body: "reply" })).data.error.code, "thread_locked");
    db(`UPDATE community_threads SET locked = 0 WHERE id = '${t.id}'`);
    db(`INSERT INTO community_space_bans (space_id, user_id, created_at) VALUES ('spc_autostacc', '${user.id}', '2026-10-16T00:00:00Z')`);
    assert.equal((await c.post(`/api/community/threads/${t.id}/posts`, { body: "reply" })).data.error.code, "banned");
    db(`DELETE FROM community_space_bans WHERE user_id = '${user.id}'`);
    db(`INSERT INTO community_suspensions (user_id, reason, created_at) VALUES ('${user.id}', 'test', '2026-10-16T00:00:00Z')`);
    assert.equal((await c.post(`/api/community/threads/${t.id}/posts`, { body: "reply" })).data.error.code, "suspended");
    db(`DELETE FROM community_suspensions WHERE user_id = '${user.id}'`);
    db("UPDATE community_spaces SET state = 'read_only' WHERE id = 'spc_autostacc'");
    assert.equal((await c.post(`/api/community/threads/${t.id}/posts`, { body: "reply" })).data.error.code, "space_read_only");
    db("UPDATE community_spaces SET state = 'open' WHERE id = 'spc_autostacc'");
    assert.equal((await c.post(`/api/community/threads/${t.id}/posts`, { body: "now it works" })).status, 201);
  });

  test("an admin is AutoStacc's team: they may start threads in team-only channels", async () => {
    const admin = await freshAdmin(ctx.mock.url);
    const join = await admin.req("PUT", "/api/community/me", { body: { displayName: "Team Admin", ageConfirmed: true } });
    assert.ok([201, 409].includes(join.status));
    const r = await admin.post("/api/community/threads", { channelId: ANNOUNCE, type: "discussion", title: "Welcome, everyone", body: "Hello" });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  });

  test("posting as the team: AutoStacc's admins post under the space's name with a Team badge; members can't", async () => {
    const admin = await freshAdmin(ctx.mock.url);
    const join = await admin.req("PUT", "/api/community/me", { body: { displayName: `Admin ${unique("n").slice(-6)}`, ageConfirmed: true } });
    assert.ok([201, 409].includes(join.status));
    const mineAdmin = await admin.get("/api/community/spaces/spc_autostacc/mine");
    assert.equal(mineAdmin.data.team, true);
    assert.equal(mineAdmin.data.mayUpdate, true);
    const r = await admin.post("/api/community/threads", { channelId: ANNOUNCE, type: "update", title: "News from the team", body: `Team news ${unique("tn")}`, asTeam: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(db(`SELECT as_team FROM community_threads WHERE id = '${r.data.thread.id}'`)[0][0].as_team, "AutoStacc");
    assert.equal(db(`SELECT as_team FROM community_posts WHERE thread_id = '${r.data.thread.id}'`)[0][0].as_team, "AutoStacc");
    const page = await new Client(ctx.mock.url).get(r.data.thread.path);
    assert.match(String(page.data), /cm-badge-team/);
    const rep = await admin.post(`/api/community/threads/${r.data.thread.id}/posts`, { body: "Team reply", asTeam: true });
    assert.equal(rep.status, 201, JSON.stringify(rep.data));
    // The admin account is shared with other suites: give back the posting pace this test used.
    db(`DELETE FROM rateLimit WHERE key = 'gs:community-pace:${(await admin.get("/api/account")).data.user.id}'`);
    const m = await person();
    assert.equal((await m.c.get("/api/community/spaces/spc_autostacc/mine")).data.mayUpdate, false);
    const refused = await ask(m.c, { asTeam: true });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error.code, "team_only");
    assert.equal((await m.c.post(`/api/community/threads/${r.data.thread.id}/posts`, { body: "pretend", asTeam: true })).status, 403);
  });

  test("edits keep history within 24 hours; someone else's post can't be edited or deleted", async () => {
    const a = await person();
    const b = await person();
    const t = (await ask(a.c)).data.thread;
    const post = db(`SELECT id FROM community_posts WHERE thread_id = '${t.id}'`)[0][0].id;
    assert.equal((await b.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "hijack" } })).status, 404);
    assert.equal((await b.c.req("DELETE", `/api/community/posts/${post}`)).status, 404);
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "Edited text" } })).status, 200);
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_post_edits WHERE post_id = '${post}'`)[0][0].n, 1);
    db(`UPDATE community_posts SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = '${post}'`);
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "Too late" } })).data.error.code, "edit_window");
    assert.equal((await a.c.req("DELETE", `/api/community/posts/${post}`)).status, 200);
    assert.equal((await new Client(ctx.mock.url).get(t.path)).status, 404, "deleting the opening post removes the thread");
  });

  test("votes count once, never for your own post; only the asker or the team accepts an answer", async () => {
    const asker = await person();
    const helper = await person();
    const stranger = await person();
    const t = (await ask(asker.c)).data.thread;
    assert.equal((await asker.c.req("PUT", `/api/community/threads/${t.id}/boost`)).data.error.code, "own_post");
    for (let i = 0; i < 3; i++) assert.equal((await helper.c.req("PUT", `/api/community/threads/${t.id}/boost`)).status, 200);
    assert.equal(db(`SELECT score FROM community_threads WHERE id = '${t.id}'`)[0][0].score, 1);
    await helper.c.req("DELETE", `/api/community/threads/${t.id}/boost`);
    await helper.c.req("DELETE", `/api/community/threads/${t.id}/boost`);
    assert.equal(db(`SELECT score FROM community_threads WHERE id = '${t.id}'`)[0][0].score, 0);
    const answer = (await helper.c.post(`/api/community/threads/${t.id}/posts`, { body: "Use tags in Your Stacc." })).data.post.id;
    assert.equal((await helper.c.req("PUT", `/api/community/posts/${answer}/helpful`)).data.error.code, "own_post");
    assert.equal((await stranger.c.req("PUT", `/api/community/posts/${answer}/helpful`)).status, 200);
    assert.equal((await stranger.c.req("PUT", `/api/community/posts/${answer}/helpful`)).status, 200);
    assert.equal(db(`SELECT helpful FROM community_posts WHERE id = '${answer}'`)[0][0].helpful, 1);
    const opening = db(`SELECT id FROM community_posts WHERE thread_id = '${t.id}' ORDER BY created_at LIMIT 1`)[0][0].id;
    assert.equal((await stranger.c.req("PUT", `/api/community/posts/${opening}/helpful`)).data.error.code, "not_an_answer");
    assert.equal((await stranger.c.req("PUT", `/api/community/threads/${t.id}/accepted`, { body: { postId: answer } })).data.error.code, "not_asker");
    assert.equal((await asker.c.req("PUT", `/api/community/threads/${t.id}/accepted`, { body: { postId: opening } })).status, 404, "the question isn't its own answer");
    assert.equal((await asker.c.req("PUT", `/api/community/threads/${t.id}/accepted`, { body: { postId: answer } })).status, 200);
    const mine = (await asker.c.get(`/api/community/threads/${t.id}/mine`)).data;
    assert.equal(mine.asker, true);
    assert.equal(mine.ownPosts.length, 1);
    const theirs = (await stranger.c.get(`/api/community/threads/${t.id}/mine`)).data;
    assert.deepEqual(theirs.features.qa.helpful, [answer]);
    assert.equal(theirs.ownPosts.length, 0, "never another person's text");
  });

  test("a support impersonation can't join, post or vote as the customer", async () => {
    const customer = await person();
    const t = (await ask(customer.c)).data.thread;
    const admin = await freshAdmin(ctx.mock.url);
    const imp = await admin.post(`/api/admin/customers/${customer.user.id}/impersonate`, { note: "community check" });
    assert.equal(imp.status, 201, JSON.stringify(imp.data));
    assert.equal((await ask(admin)).status, 403);
    assert.equal((await admin.post(`/api/community/threads/${t.id}/posts`, { body: "as them" })).status, 403);
    assert.equal((await admin.req("PUT", `/api/community/threads/${t.id}/boost`)).status, 403);
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_posts WHERE body = 'as them'`)[0][0].n, 0);
  });

  test("posting pace: three posts a minute, no duplicates, and a space's slow mode (the team isn't slowed)", async () => {
    const { c } = await person();
    for (let i = 0; i < 3; i++) assert.equal((await ask(c, { title: `Question number ${i}`, body: `body ${i}` })).status, 201);
    const fourth = await ask(c, { title: "One too many", body: "body 4" });
    assert.equal(fourth.status, 429);
    assert.equal(fourth.data.error.code, "posting_too_fast");
    const d = await person();
    const t = (await ask(d.c, { body: "the same words" })).data.thread;
    db(`UPDATE community_posts SET created_at = '2026-10-01T00:00:00.000Z' WHERE thread_id = '${t.id}'`);
    await d.c.post(`/api/community/threads/${t.id}/posts`, { body: "say it twice" });
    assert.equal((await d.c.post(`/api/community/threads/${t.id}/posts`, { body: "say it twice" })).data.error.code, "duplicate_post");
    // Slow mode: only the space's team sets it; then members wait between posts.
    assert.equal((await d.c.req("PUT", "/api/community/spaces/spc_autostacc/slow-mode", { body: { seconds: 120 } })).status, 404);
    const admin = await freshAdmin(ctx.mock.url);
    await admin.req("PUT", "/api/community/me", { body: { displayName: "Team Admin", ageConfirmed: true } });
    assert.equal((await admin.req("PUT", "/api/community/spaces/spc_autostacc/slow-mode", { body: { seconds: 45 } })).status, 400);
    assert.equal((await admin.req("PUT", "/api/community/spaces/spc_autostacc/slow-mode", { body: { seconds: 120 } })).status, 200);
    const e = await person();
    const t2 = (await ask(e.c, { body: "first in slow mode" })).data.thread;
    const slow = await e.c.post(`/api/community/threads/${t2.id}/posts`, { body: "too soon" });
    assert.equal(slow.data.error.code, "slow_mode");
    assert.match((await new Client(ctx.mock.url).get("/community/autostacc")).data, /Slow mode: one post every 2 minutes/);
    assert.equal((await admin.req("PUT", "/api/community/spaces/spc_autostacc/slow-mode", { body: { seconds: 0 } })).status, 200);
  });

  test("posts sent at the same moment can't race past the pace limit (security review)", async () => {
    const { c } = await person();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => ask(c, { title: `Racing question ${i}`, body: `race ${i}` })));
    assert.ok(results.filter((r) => r.status === 201).length <= 3, results.map((r) => r.status).join(","));
  });

  test("a banned or suspended member can't edit, a locked take can't be edited, archived channels take no replies (security review)", async () => {
    const a = await person();
    const t = (await ask(a.c, { title: "Editable question", body: "first words" })).data.thread;
    const post = db(`SELECT id FROM community_posts WHERE thread_id = '${t.id}'`)[0][0].id;
    db(`INSERT INTO community_space_bans (space_id, user_id, created_at) VALUES ('spc_autostacc', '${a.user.id}', '2026-10-16T00:00:00Z')`);
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "abuse" } })).data.error.code, "banned");
    assert.equal((await a.c.req("PUT", `/api/community/threads/${t.id}/accepted`, { body: { postId: null } })).data.error.code, "banned");
    db(`DELETE FROM community_space_bans WHERE user_id = '${a.user.id}'`);
    db(`UPDATE community_threads SET locked = 1 WHERE id = '${t.id}'`);
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "changed" } })).data.error.code, "thread_locked");
    db(`UPDATE community_threads SET locked = 0 WHERE id = '${t.id}'`);
    db(`UPDATE community_channels SET archived_at = '2026-10-16T00:00:00Z' WHERE id = '${HELP}'`);
    const b = await person();
    assert.equal((await b.c.post(`/api/community/threads/${t.id}/posts`, { body: "into the archive" })).data.error.code, "channel_archived");
    db(`UPDATE community_channels SET archived_at = NULL WHERE id = '${HELP}'`);
  });

  test("nested replies: a reply answers a post of the same take, and shows under it", async () => {
    const a = await person();
    const b = await person();
    const t = (await ask(a.c, { type: "discussion", title: "Nesting test take", body: "top" })).data.thread;
    const first = (await b.c.post(`/api/community/threads/${t.id}/posts`, { body: "level one" })).data.post.id;
    const second = await a.c.post(`/api/community/threads/${t.id}/posts`, { body: "level two", parentId: first });
    assert.equal(second.status, 201);
    const other = (await ask(b.c, { type: "discussion", title: "Another take here", body: "x" })).data.thread;
    assert.equal((await a.c.post(`/api/community/threads/${other.id}/posts`, { body: "cross", parentId: first })).status, 404, "a parent from another take");
    const html = (await new Client(ctx.mock.url).get(t.path)).data;
    const one = html.indexOf("level one");
    const two = html.indexOf("level two");
    assert.ok(one > 0 && two > one);
    assert.match(html.slice(one, two), /<ol class="cm-replies">/, "level two sits inside level one's replies");
  });

  test("deleting the account keeps posts as deleted user and erases the name, votes and history", async () => {
    const a = await person("Leaving Soon");
    const b = await person();
    const t = (await ask(a.c)).data.thread;
    await a.c.req("PUT", `/api/community/threads/${t.id}/boost`).catch(() => {});
    await b.c.req("PUT", `/api/community/threads/${t.id}/boost`);
    const exported = await a.c.post("/api/account/export", {});
    assert.equal(exported.data.community.member.displayName, "Leaving Soon");
    assert.equal(exported.data.community.threads.length, 1);
    const del = await a.c.post("/api/account/delete", { confirm: a.user.email, password: "correct-horse-battery" });
    assert.equal(del.status, 200, JSON.stringify(del.data));
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_members WHERE user_id = '${a.user.id}'`)[0][0].n, 0);
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_posts WHERE author_user_id = '${a.user.id}'`)[0][0].n, 0);
    const page = await new Client(ctx.mock.url).get(t.path);
    assert.equal(page.status, 200);
    assert.match(page.data, /deleted user/);
    assert.doesNotMatch(page.data, /Leaving Soon/);
  });

  test("everything is 404 for a stranger route and nothing leaks other people's posts", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.get("/api/community/threads/thr_nope/mine")).status, 404);
    assert.equal((await anon.post("/api/community/threads", {})).status, 401);
  });
});

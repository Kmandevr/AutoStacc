// Blocks, crisis notes, spaces without a team and the 12-month cleanup (server/community/features/blocks/, crisis/,
// upkeep/ and core/retention.js; docs/community-safety.md), on the switched-on store (test/api/community.test.js).
// A blocked person can't reply to you; help lines show beside self-harm wording; a space nobody looks after turns
// read-only in the daily sweep and its team reopens it only once old reports are handled; removed text and old
// reports go after 12 months, legal removals stay, and what's gone can't be restored.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

export const SWEEP_TOKEN = "community-sweep-token-for-tests-".padEnd(40, "x");
const HELP = "chn_autostacc_help";
const OLD = "2025-01-01T00:00:00.000Z";

export default (ctx) => describe("community upkeep (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmu"));
    const name = `Upkeep Test ${++n} ${Date.now().toString(36).slice(-4)}`;
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const take = async (c, body = "Opening words here") => (await c.post("/api/community/threads", { channelId: HELP, type: "discussion", title: `Upkeep take ${++n}`, body })).data.thread;
  const replyTo = (c, t, body, parentId) => c.post(`/api/community/threads/${t.id}/posts`, { body, ...(parentId ? { parentId } : {}) });
  const sweep = async () => {
    const r = await fetch(`${ctx.mock.url}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } });
    assert.equal(r.status, 200);
    return (await r.json()).community;
  };

  test("blocking: by name, never yourself; the blocked person can't reply to your take or your post", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const t = await take(a.c);
    const cPost = (await replyTo(c.c, t, "c replies first")).data.post.id;
    const block = (who, name) => who.c.req("PUT", "/api/community/blocks", { body: { name } });
    assert.equal((await block(a, a.name)).data.error.code, "own_account");
    assert.equal((await block(a, "Nobody Has This Name")).data.error.code, "no_member");
    assert.equal((await block(a, b.name)).status, 200);
    assert.equal((await block(a, b.name)).status, 200, "twice is fine");
    assert.deepEqual((await a.c.get("/api/community/blocks")).data.names, [b.name]);
    assert.equal((await replyTo(b.c, t, "let me in")).data.error.code, "blocked");
    // c blocks b too: b can't answer c's post anywhere either.
    await block(c, b.name);
    const t2 = await take((await person()).c);
    const cPost2 = (await replyTo(c.c, t2, "c in another take")).data.post.id;
    assert.equal((await replyTo(b.c, t2, "answering c", cPost2)).data.error.code, "blocked");
    assert.equal((await replyTo(b.c, t2, "fine at the top")).status, 201, "replying to someone else is fine");
    assert.equal((await replyTo(a.c, t, "a can still answer c", cPost)).status, 201);
    assert.equal((await a.c.req("DELETE", "/api/community/blocks", { body: { name: b.name } })).status, 200);
    db(`DELETE FROM rateLimit WHERE key = 'gs:community-pace:${b.user.id}'`); // three posts a minute (pace) counts tries
    assert.equal((await replyTo(b.c, t, "back in")).status, 201);
    assert.equal((await new Client(ctx.mock.url).get("/api/community/blocks")).status, 401);
  });

  test("help lines show beside self-harm wording, and nowhere else", async () => {
    const a = await person();
    const worried = await take(a.c, "Honestly some days I want to end my life");
    const calm = await take(a.c, "Which compressor do you like on drums?");
    assert.match((await new Client(ctx.mock.url).get(worried.path)).data, /class="cm-crisis"[\s\S]*tel:988/);
    assert.doesNotMatch((await new Client(ctx.mock.url).get(calm.path)).data, /cm-crisis/);
  });

  test("a space nobody looks after turns read-only in the sweep; its team reopens it once old reports are handled", async () => {
    const founder = await person();
    const member = await person();
    const id = `spc_up${Date.now().toString(36)}`;
    db(`INSERT INTO community_spaces (id, slug, name, name_key, kind, founder_user_id, last_team_activity_at, created_at)
      VALUES ('${id}', 'upkeep-${id.slice(-6)}', 'Upkeep Space ${id.slice(-6)}', 'upkeepspace${id.slice(-6)}', 'community', '${founder.user.id}', '${OLD}', '${OLD}')`);
    db(`INSERT INTO community_space_roles (space_id, user_id, role, created_at) VALUES ('${id}', '${founder.user.id}', 'founder', '${OLD}')`);
    db(`INSERT INTO community_channels (id, space_id, slug, name, created_at) VALUES ('chn_${id.slice(4)}', '${id}', 'general', 'General', '${OLD}')`);
    const t = (await member.c.post("/api/community/threads", { channelId: `chn_${id.slice(4)}`, type: "discussion", title: "A take in a quiet space", body: "hello there" })).data.thread;
    db(`INSERT INTO community_reports (id, target_type, target_id, space_id, reporter_user_id, reason, note, route, created_at)
      VALUES ('rpt_up${id.slice(-6)}', 'thread', '${t.id}', '${id}', '${member.user.id}', 'spam', 'old report here', 'space', '${OLD}')`);
    const r = await sweep();
    assert.ok(r.features.upkeep.readOnly >= 1, JSON.stringify(r));
    assert.deepEqual(one(`SELECT state, state_reason AS why FROM community_spaces WHERE id = '${id}'`), { state: "read_only", why: "inactive_team" });
    assert.equal(one(`SELECT automatic FROM community_mod_log WHERE space_id = '${id}' AND action = 'read_only'`).automatic, 1);
    assert.equal(one(`SELECT COUNT(*) AS n FROM email_events WHERE kind = 'community-read-only' AND to_email = '${founder.user.email}'`).n, 1);
    assert.equal(one("SELECT state FROM community_spaces WHERE id = 'spc_autostacc'").state, "open", "AutoStacc's own space never");
    assert.equal((await member.c.post("/api/community/threads", { channelId: `chn_${id.slice(4)}`, type: "discussion", title: "Posting while read only", body: "nope" })).data.error.code, "space_read_only");
    assert.equal((await member.c.post(`/api/community/spaces/${id}/reopen`)).status, 404, "not the team");
    const reopen = await founder.c.post(`/api/community/spaces/${id}/reopen`);
    assert.equal(reopen.data.error.code, "reports_waiting");
    assert.equal((await founder.c.post("/api/community/reports/resolve", { targetType: "thread", targetId: t.id, outcome: "dismissed" })).status, 200);
    assert.equal((await founder.c.post(`/api/community/spaces/${id}/reopen`)).status, 200);
    assert.equal(one(`SELECT state FROM community_spaces WHERE id = '${id}'`).state, "open");
    assert.equal((await founder.c.post(`/api/community/spaces/${id}/reopen`)).data.error.code, "not_inactive");
    await sweep();
    assert.equal(one(`SELECT state FROM community_spaces WHERE id = '${id}'`).state, "open", "the team just acted");
  });

  test("after 12 months removed text, old reports and decided appeals go; legal removals stay; gone can't come back", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const ruled = (await replyTo(b.c, t, "rude words to remove")).data.post.id;
    const own = (await replyTo(b.c, t, "deleted by me")).data.post.id;
    const legal = (await replyTo(b.c, t, "legally removed words")).data.post.id;
    const admin = await freshAdmin(ctx.mock.url);
    await admin.req("PUT", "/api/community/me", { body: { displayName: "Team Admin", ageConfirmed: true } });
    assert.equal((await admin.post(`/api/community/mod/posts/${ruled}`, { action: "remove", reason: "Rude" })).status, 200);
    assert.ok(one(`SELECT removed_at FROM community_posts WHERE id = '${ruled}'`).removed_at);
    assert.equal((await b.c.req("DELETE", `/api/community/posts/${own}`)).status, 200);
    db(`UPDATE community_posts SET state = 'removed', removed_reason = 'legal', removed_at = '${OLD}' WHERE id = '${legal}'`);
    db(`UPDATE community_posts SET removed_at = '${OLD}' WHERE id IN ('${ruled}', '${own}')`);
    db(`INSERT INTO community_reports (id, target_type, target_id, space_id, reporter_user_id, reason, note, route, status, handled_at, created_at)
      VALUES ('rpt_old${n}', 'post', '${ruled}', 'spc_autostacc', '${a.user.id}', 'rules', 'old one', 'space', 'upheld', '${OLD}', '${OLD}')`);
    const r = await sweep();
    assert.ok(r.retention.postsCleared >= 2, JSON.stringify(r.retention));
    assert.equal(one(`SELECT body FROM community_posts WHERE id = '${ruled}'`).body, "");
    assert.equal(one(`SELECT body FROM community_posts WHERE id = '${own}'`).body, "");
    assert.equal(one(`SELECT body FROM community_posts WHERE id = '${legal}'`).body, "legally removed words");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_reports WHERE id = 'rpt_old${n}'`).n, 0);
    assert.equal((await admin.post(`/api/community/mod/posts/${ruled}`, { action: "restore" })).data.error.code, "not_changeable");
    assert.match((await new Client(ctx.mock.url).get(t.path)).data, /Removed\./);
  });
});

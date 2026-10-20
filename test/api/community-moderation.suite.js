// Moderation and reports (server/community/core/moderate.js, features/moderation/ and features/reports/;
// docs/community.md, docs/community-safety.md), on the switched-on store (test/api/community.test.js). Only the space's
// team acts, always with a reason the author sees, never twice on the same thing, and everything lands in the team's
// log; bans hold in their space; appeals come once; reports need a reason and a note, route by reason, and only
// trusted reporters hide a post by themselves; the queue hides who reported; a support impersonation can't report.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";
const FEEDBACK = "chn_autostacc_feedback";
const SPACE = "spc_autostacc";

export default (ctx) => describe("community moderation and reports (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  let n = 0;
  const person = async ({ old = false } = {}) => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmm"));
    const name = `Mod Test ${++n} ${Date.now().toString(36).slice(-4)}`;
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    if (old) db(`UPDATE "user" SET createdAt = '2026-01-01T00:00:00.000Z' WHERE id = '${user.id}'`);
    return { c, user, name };
  };
  const team = async () => {
    const admin = await freshAdmin(ctx.mock.url);
    await admin.req("PUT", "/api/community/me", { body: { displayName: "Team Admin", ageConfirmed: true } });
    return admin;
  };
  let t0 = 0;
  const take = async (c) => (await c.post("/api/community/threads", { channelId: HELP, type: "question", title: `Moderation take ${++t0}`, body: `Opening words ${t0}` })).data.thread;
  const replyTo = async (c, t, body = `A reply ${Math.random()}`) => (await c.post(`/api/community/threads/${t.id}/posts`, { body })).data.post.id;
  const mod = (c, kind, targetId, body) => c.post(`/api/community/mod/${kind}/${targetId}`, body);
  const report = (c, targetType, targetId, reason = "rules", note = "This breaks the rules here.") => c.post("/api/community/reports", { targetType, targetId, reason, note });
  const state = (table, id) => db(`SELECT state, removed_reason AS why FROM ${table} WHERE id = '${id}'`)[0][0];

  test("only the space's team acts, with a reason; the reply count follows; the author is told why", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const post = await replyTo(b.c, t);
    assert.equal((await mod(a.c, "posts", post, { action: "hide", reason: "Off topic" })).status, 404, "not the team");
    const admin = await team();
    assert.equal((await mod(admin, "posts", post, { action: "hide" })).data.error.code, "reason_required");
    assert.equal((await mod(admin, "posts", post, { action: "explode", reason: "x" })).status, 400);
    assert.equal((await mod(admin, "posts", post, { action: "hide", reason: "Off topic here" })).status, 200);
    assert.equal(state("community_posts", post).state, "hidden");
    assert.equal(db(`SELECT reply_count AS n FROM community_threads WHERE id = '${t.id}'`)[0][0].n, 0);
    assert.equal((await mod(admin, "posts", post, { action: "hide", reason: "again" })).data.error.code, "not_changeable");
    const page = await new Client(ctx.mock.url).get(t.path);
    assert.match(page.data, /Hidden while the space's team reviews it/);
    const notice = (await b.c.get("/api/community/moderated")).data.items.find((x) => x.id === post);
    assert.equal(notice.reason, "Off topic here");
    assert.equal(notice.appeal, null);
    assert.equal((await a.c.get("/api/community/moderated")).data.items.some((x) => x.id === post), false, "only your own");
    const opening = db(`SELECT id FROM community_posts WHERE thread_id = '${t.id}' ORDER BY created_at LIMIT 1`)[0][0].id;
    assert.equal((await mod(admin, "posts", opening, { action: "hide", reason: "nope" })).data.error.code, "use_thread");
    assert.equal((await mod(admin, "posts", post, { action: "restore" })).status, 200);
    assert.equal(db(`SELECT reply_count AS n FROM community_threads WHERE id = '${t.id}'`)[0][0].n, 1);
    const log = db(`SELECT action, reason, automatic FROM community_mod_log WHERE target_id = '${post}' ORDER BY at`)[0].map((r) => r.action);
    assert.deepEqual(log, ["hide", "restore"]);
  });

  test("a removal by the author or for a legal reason is never undone by a team", async () => {
    const a = await person();
    const t = await take(a.c);
    const post = await replyTo(a.c, t);
    const admin = await team();
    db(`UPDATE community_posts SET state = 'removed', removed_reason = 'legal' WHERE id = '${post}'`);
    assert.equal((await mod(admin, "posts", post, { action: "restore" })).data.error.code, "not_changeable");
    db(`UPDATE community_posts SET removed_reason = 'author' WHERE id = '${post}'`);
    assert.equal((await mod(admin, "posts", post, { action: "restore" })).data.error.code, "not_changeable");
    assert.deepEqual(state("community_posts", post), { state: "removed", why: "author" });
  });

  test("pin, lock, move within the space, hide and remove a take; a removed take can't be pinned", async () => {
    const a = await person();
    const t = await take(a.c);
    const admin = await team();
    assert.equal((await mod(admin, "threads", t.id, { action: "pin" })).status, 200);
    assert.equal((await mod(admin, "threads", t.id, { action: "lock" })).status, 200);
    assert.deepEqual(db(`SELECT pinned, locked FROM community_threads WHERE id = '${t.id}'`)[0][0], { pinned: 1, locked: 1 });
    assert.equal((await a.c.post(`/api/community/threads/${t.id}/posts`, { body: "locked out" })).data.error.code, "thread_locked");
    assert.equal((await mod(admin, "threads", t.id, { action: "move", channelId: FEEDBACK })).status, 200);
    assert.equal(db(`SELECT channel_id AS c FROM community_threads WHERE id = '${t.id}'`)[0][0].c, FEEDBACK);
    assert.equal((await mod(admin, "threads", t.id, { action: "move", channelId: "chn_autostacc_show" })).status, 400, "show takes no questions");
    assert.equal((await mod(admin, "threads", t.id, { action: "move", channelId: "chn_elsewhere" })).status, 404);
    assert.equal((await mod(admin, "threads", t.id, { action: "remove", reason: "Duplicate take" })).status, 200);
    assert.equal((await new Client(ctx.mock.url).get(t.path)).status, 404);
    assert.equal((await mod(admin, "threads", t.id, { action: "unpin" })).data.error.code, "changed");
    assert.equal((await mod(admin, "threads", t.id, { action: "restore" })).status, 200);
    assert.equal((await new Client(ctx.mock.url).get(t.path)).status, 200);
  });

  test("bans hold in their space: never yourself or the team, lifted by the team, named not numbered", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const admin = await team();
    const ban = (body) => admin.req("PUT", `/api/community/spaces/${SPACE}/bans`, { body });
    assert.equal((await b.c.req("PUT", `/api/community/spaces/${SPACE}/bans`, { body: { name: a.name, reason: "x", days: 1 } })).status, 404);
    assert.equal((await ban({ name: "Nobody Called This", reason: "Spam links" })).data.error.code, "no_member");
    assert.equal((await ban({ name: "Team Admin", reason: "Spam links" })).status, 400, "yourself");
    assert.equal((await ban({ name: b.name, reason: "Spam links", days: 0 })).status, 400);
    assert.equal((await ban({ name: b.name })).data.error.code, "reason_required");
    assert.equal((await ban({ name: b.name, reason: "Spam links", days: 7 })).status, 200);
    assert.equal((await b.c.post(`/api/community/threads/${t.id}/posts`, { body: "banned words" })).data.error.code, "banned");
    const list = (await admin.get(`/api/community/spaces/${SPACE}/bans`)).data.bans;
    const entry = list.find((x) => x.name === b.name);
    assert.equal(entry.reason, "Spam links");
    assert.equal(JSON.stringify(list).includes(b.user.id), false, "no account ids");
    const log = (await admin.get(`/api/community/spaces/${SPACE}/mod-log`)).data.log;
    assert.ok(log.some((x) => x.action === "ban" && x.member === b.name));
    assert.equal(JSON.stringify(log).includes(b.user.id), false);
    assert.equal((await admin.req("DELETE", `/api/community/spaces/${SPACE}/bans`, { body: { name: b.name } })).status, 200);
    assert.equal((await b.c.post(`/api/community/threads/${t.id}/posts`, { body: "back again" })).status, 201);
  });

  test("appeals: your own taken-down post, once, with a note; the team grants or refuses with a reason", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const post = await replyTo(b.c, t);
    const other = await replyTo(b.c, t);
    const admin = await team();
    await mod(admin, "posts", post, { action: "remove", reason: "Rude reply" });
    await mod(admin, "posts", other, { action: "hide", reason: "Spammy" });
    const appeal = (c, targetId, note = "I think this was a misunderstanding, honestly.") => c.post("/api/community/appeals", { targetType: "post", targetId, note });
    assert.equal((await appeal(a.c, post)).status, 404, "not yours");
    assert.equal((await appeal(b.c, post, "short")).data.error.code, "note_required");
    assert.equal((await appeal(b.c, post)).status, 201);
    assert.equal((await appeal(b.c, post)).data.error.code, "already_appealed");
    assert.equal((await appeal(b.c, other)).status, 201);
    const queue = (await admin.get(`/api/community/spaces/${SPACE}/appeals`)).data.appeals;
    const mine = queue.filter((x) => x.targetId === post || x.targetId === other);
    assert.equal(mine.length, 2);
    assert.equal((await b.c.get(`/api/community/spaces/${SPACE}/appeals`)).status, 404);
    const grant = mine.find((x) => x.targetId === post);
    const refuse = mine.find((x) => x.targetId === other);
    assert.equal((await admin.post(`/api/community/appeals/${refuse.id}`, { outcome: "refused" })).data.error.code, "reason_required");
    assert.equal((await admin.post(`/api/community/appeals/${grant.id}`, { outcome: "granted" })).status, 200);
    assert.equal((await admin.post(`/api/community/appeals/${grant.id}`, { outcome: "granted" })).data.error.code, "changed");
    assert.equal((await admin.post(`/api/community/appeals/${refuse.id}`, { outcome: "refused", reason: "Still spam" })).status, 200);
    assert.equal(state("community_posts", post).state, "visible");
    assert.equal(state("community_posts", other).state, "hidden");
    const items = (await b.c.get("/api/community/moderated")).data.items;
    assert.equal(items.find((x) => x.id === other).appeal, "refused");
    assert.equal(items.some((x) => x.id === post), false, "back, so not listed");
  });

  test("reports need a reason and a note, never your own post, and route by reason", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const post = await replyTo(b.c, t);
    assert.equal((await report(b.c, "post", post)).data.error.code, "own_post");
    assert.equal((await report(a.c, "post", post, "rules", "bad")).data.error.code, "note_required");
    assert.equal((await report(a.c, "post", post, "because")).status, 400);
    assert.equal((await report(a.c, "post", "pst_nope")).status, 404);
    const plain = new Client(ctx.mock.url);
    await verifiedUser(plain, unique("cmm-plain"));
    assert.equal((await report(plain, "post", post)).data.error.code, "not_a_member");
    const r = await report(a.c, "post", post, "harassment", "They called me names in this reply.");
    assert.equal(r.status, 201);
    assert.equal(r.data.route, "space");
    assert.equal((await report(a.c, "post", post, "harassment", "Again, the same reply as before.")).data.duplicate, true);
    assert.equal((await report(a.c, "thread", t.id)).status, 400, "your own take");
    const c = await person();
    assert.equal((await report(c.c, "post", post, "copyright", "This is my track uploaded without permission.")).data.route, "autostacc");
    // Reporting the opening post reports the take.
    const opening = db(`SELECT id FROM community_posts WHERE thread_id = '${t.id}' ORDER BY created_at LIMIT 1`)[0][0].id;
    assert.equal((await report(c.c, "post", opening)).status, 201);
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_reports WHERE target_type = 'thread' AND target_id = '${t.id}'`)[0][0].n, 1);
  });

  test("three trusted reporters hide a post until the team decides; new accounts don't; the team's own posts wait", async () => {
    const a = await person();
    const t = await take(a.c);
    const post = await replyTo(a.c, t);
    for (let i = 0; i < 3; i++) await report((await person()).c, "post", post);
    assert.equal(state("community_posts", post).state, "visible", "new accounts aren't trusted to hide");
    const trusted = [];
    for (let i = 0; i < 3; i++) trusted.push(await person({ old: true }));
    await report(trusted[0].c, "post", post);
    await report(trusted[1].c, "post", post);
    assert.equal(state("community_posts", post).state, "visible");
    await report(trusted[2].c, "post", post);
    assert.equal(state("community_posts", post).state, "hidden");
    assert.equal(db(`SELECT automatic FROM community_mod_log WHERE target_id = '${post}' AND action = 'auto_hide'`)[0][0].automatic, 1);
    // The team's queue: reporters stay anonymous; dismissing brings it back and lowers the reporters' standing.
    const admin = await team();
    assert.equal((await a.c.get(`/api/community/spaces/${SPACE}/reports`)).status, 404);
    const queue = (await admin.get(`/api/community/spaces/${SPACE}/reports`)).data.reports;
    const entry = queue.find((x) => x.id === post);
    assert.equal(entry.reasons.length, 6);
    assert.equal(entry.state, "hidden");
    for (const p of trusted) assert.equal(JSON.stringify(queue).includes(p.user.id), false);
    assert.equal((await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: post, outcome: "dismissed" })).status, 200);
    assert.equal(state("community_posts", post).state, "visible");
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_reports WHERE target_id = '${post}' AND status = 'dismissed'`)[0][0].n, 6);
    // One fresh trusted report doesn't re-hide it from the old, already-weighed ones.
    await report((await person({ old: true })).c, "post", post);
    assert.equal(state("community_posts", post).state, "visible");
    // The team's own reply is never hidden automatically.
    const teamPost = await replyTo(admin, t, "Team reply here");
    for (const p of trusted) await report(p.c, "post", teamPost);
    assert.equal(state("community_posts", teamPost).state, "visible");
  });

  test("the queue puts danger first; upholding removes with a reason; abused danger reports lose the option", async () => {
    const a = await person();
    const t = await take(a.c);
    const calm = await replyTo(a.c, t, "Just a calm reply");
    const worrying = await replyTo(a.c, t, "Some worrying words here");
    const r = await person();
    await report(r.c, "post", calm, "spam", "Looks like spam to me, honestly.");
    await report(r.c, "post", worrying, "danger", "They sound like they might hurt themselves.");
    const admin = await team();
    const queue = (await admin.get(`/api/community/spaces/${SPACE}/reports`)).data.reports;
    assert.ok(queue.findIndex((x) => x.id === worrying) < queue.findIndex((x) => x.id === calm), "danger first");
    assert.equal(queue.find((x) => x.id === worrying).danger, true);
    assert.equal((await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: calm, outcome: "upheld" })).data.error.code, "reason_required");
    assert.equal((await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: calm, outcome: "upheld", reason: "Spam" })).status, 200);
    assert.deepEqual(state("community_posts", calm), { state: "removed", why: "space_rules" });
    assert.equal((await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: calm, outcome: "dismissed" })).data.error.code, "changed", "already decided");
    // Two dismissed danger reports in 90 days: the danger reason goes away for that reporter.
    await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: worrying, outcome: "dismissed" });
    const w = await person(); // three posts a minute each (the pace feature)
    const another = await replyTo(w.c, t, "Another reply entirely");
    await report(r.c, "post", another, "danger", "Again I think someone is in danger.");
    await admin.post("/api/community/reports/resolve", { targetType: "post", targetId: another, outcome: "dismissed" });
    const third = await replyTo(w.c, t, "A third reply here");
    assert.equal((await report(r.c, "post", third, "danger", "Danger again, I promise this time.")).data.error.code, "danger_unavailable");
    assert.equal((await report(r.c, "post", third, "rules", "Breaks the space's rules though.")).status, 201);
  });

  test("security review: AutoStacc-routed reports and banned reporters can't hide; races decide once; odd keys are 400", async () => {
    const a = await person();
    const t = await take(a.c);
    const post = await replyTo(a.c, t);
    const trusted = [];
    for (let i = 0; i < 3; i++) trusted.push(await person({ old: true }));
    for (const p of trusted) assert.equal((await report(p.c, "post", post, "copyright", "Uploaded my track without permission.")).status, 201);
    assert.equal(state("community_posts", post).state, "visible", "AutoStacc's reports wait for AutoStacc");
    // Banned from the space: no reports there, and old ones stop counting.
    const admin = await team();
    const banned = await person({ old: true });
    await report(banned.c, "post", post);
    assert.equal((await admin.req("PUT", `/api/community/spaces/${SPACE}/bans`, { body: { name: banned.name, reason: "Brigading" } })).status, 200);
    assert.equal((await report(banned.c, "thread", t.id)).data.error.code, "banned");
    await report(trusted[0].c, "post", post, "rules", "Breaks the rules of this space.");
    await report(trusted[1].c, "post", post, "rules", "Breaks the rules of this space.");
    assert.equal(state("community_posts", post).state, "visible", "only 2 counting reporters");
    // One person's reports sent at once land once.
    const r = await person();
    await Promise.all(Array.from({ length: 5 }, () => report(r.c, "thread", t.id)));
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_reports WHERE target_id = '${t.id}' AND reporter_user_id = '${r.user.id}'`)[0][0].n, 1);
    assert.equal((await report(r.c, "post", post, "constructor")).status, 400);
    assert.equal((await mod(admin, "posts", post, { action: "constructor", reason: "x" })).status, 400);
    assert.equal((await mod(admin, "threads", t.id, { action: "toString" })).status, 400);
    // Uphold and dismiss at once: one wins.
    const both = await Promise.all([
      admin.post("/api/community/reports/resolve", { targetType: "thread", targetId: t.id, outcome: "upheld", reason: "Rule break" }),
      admin.post("/api/community/reports/resolve", { targetType: "thread", targetId: t.id, outcome: "dismissed" })]);
    assert.equal(both.filter((x) => x.status === 200).length, 1, both.map((x) => x.status).join(","));
    // Grant and refuse at once: one wins; granting what's already back just closes the appeal.
    const b = await person();
    const t2 = await take((await person()).c); // the first take may be removed by now
    const p2 = await replyTo(b.c, t2);
    await mod(admin, "posts", p2, { action: "hide", reason: "Checking" });
    await b.c.post("/api/community/appeals", { targetType: "post", targetId: p2, note: "Please look at this one again." });
    const ap = db(`SELECT id FROM community_appeals WHERE target_id = '${p2}'`)[0][0].id;
    const decided = await Promise.all([admin.post(`/api/community/appeals/${ap}`, { outcome: "granted" }), admin.post(`/api/community/appeals/${ap}`, { outcome: "refused", reason: "No" })]);
    assert.equal(decided.filter((x) => x.status === 200).length, 1, decided.map((x) => x.status).join(","));
    const p3 = await replyTo(b.c, t2);
    await mod(admin, "posts", p3, { action: "hide", reason: "Checking" });
    await b.c.post("/api/community/appeals", { targetType: "post", targetId: p3, note: "Please look at this one again." });
    await mod(admin, "posts", p3, { action: "restore" });
    const ap3 = db(`SELECT id FROM community_appeals WHERE target_id = '${p3}'`)[0][0].id;
    assert.equal((await admin.post(`/api/community/appeals/${ap3}`, { outcome: "granted" })).status, 200);
    assert.equal(db(`SELECT status FROM community_appeals WHERE id = '${ap3}'`)[0][0].status, "granted");
  });

  test("a support impersonation can't report or moderate", async () => {
    const a = await person();
    const t = await take(a.c);
    const admin = await freshAdmin(ctx.mock.url);
    const b = await person();
    assert.equal((await admin.post(`/api/admin/customers/${b.user.id}/impersonate`, { note: "community moderation check" })).status, 201);
    assert.equal((await report(admin, "thread", t.id)).status, 403);
    assert.equal((await mod(admin, "threads", t.id, { action: "pin" })).status, 403);
    assert.equal(db(`SELECT COUNT(*) AS n FROM community_reports WHERE target_id = '${t.id}'`)[0][0].n, 0);
  });
});

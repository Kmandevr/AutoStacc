// AutoStacc's report queue and community suspensions (server/community/features/legal/; docs/community-safety.md),
// on the switched-on store (test/api/community.test.js). Only admins see it; reports routed to AutoStacc come here
// and never to a space's team; a legal removal is final for the team, kept by retention and explained to the author;
// suspensions stop posting everywhere until lifted; an under-16 account's community activity goes; one decision wins.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";

export default (ctx) => describe("community: AutoStacc's queue (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cml"));
    const name = `Legal Test ${++n} ${Date.now().toString(36).slice(-4)}`;
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const take = async (c) => (await c.post("/api/community/threads", { channelId: HELP, type: "discussion", title: `Legal take ${++n}`, body: `Words ${n}` })).data.thread;
  const reply = async (c, t, body = `reply ${++n}`) => (await c.post(`/api/community/threads/${t.id}/posts`, { body })).data.post.id;
  const report = (c, id, reason = "copyright") => c.post("/api/community/reports", { targetType: "post", targetId: id, reason, note: "This is my track, uploaded without permission." });
  const resolve = (c, id, outcome, extra = {}) => c.post("/api/admin/community/reports/resolve", { targetType: "post", targetId: id, outcome, reason: "Valid copyright notice", ...extra });

  test("only admins; AutoStacc's reports come here with who reported them, never to the space's team", async () => {
    const a = await person();
    const b = await person();
    const t = await take(a.c);
    const post = await reply(a.c, t);
    await report(b.c, post);
    assert.equal((await b.c.get("/api/admin/community/reports")).status, 404);
    assert.equal((await b.c.post("/api/admin/community/reports/resolve", { targetType: "post", targetId: post, outcome: "dismissed" })).status, 404);
    assert.equal((await b.c.get("/api/admin/community/suspensions")).status, 404);
    const admin = await freshAdmin(ctx.mock.url);
    const entry = (await admin.get("/api/admin/community/reports")).data.reports.find((x) => x.id === post);
    assert.equal(entry.reports[0].reporter, b.name);
    assert.equal(entry.author, a.name);
    const spaceQueue = (await admin.get("/api/community/spaces/spc_autostacc/reports")).data.reports;
    assert.equal(spaceQueue.some((x) => x.id === post), false);
  });

  test("a legal removal: final for the team, explained to the author, kept by retention; it can suspend the author", async () => {
    const a = await person();
    const b = await person();
    const t = await take(b.c);
    const post = await reply(a.c, t);
    await report(b.c, post);
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await resolve(admin, post, "removed", { reason: "" })).data.error.code, "reason_required");
    assert.equal((await resolve(admin, post, "removed", { suspendDays: 7 })).status, 200);
    assert.deepEqual(one(`SELECT state, removed_reason AS why FROM community_posts WHERE id = '${post}'`), { state: "removed", why: "legal" });
    assert.equal(one(`SELECT status FROM community_reports WHERE target_id = '${post}'`).status, "upheld");
    assert.equal(one(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'community.report_removed' AND target_id = '${post}'`).n, 1);
    const notice = (await a.c.get("/api/community/moderated")).data.items.find((x) => x.id === post);
    assert.equal(notice.legal, true);
    assert.match(notice.reason, /^Removed by AutoStacc: Valid copyright notice/);
    assert.equal((await a.c.post("/api/community/appeals", { targetType: "post", targetId: post, note: "This is my own work, honestly." })).status, 404);
    await admin.req("PUT", "/api/community/me", { body: { displayName: "Team Admin", ageConfirmed: true } });
    assert.equal((await admin.post(`/api/community/mod/posts/${post}`, { action: "restore" })).data.error.code, "not_changeable");
    assert.equal((await a.c.post(`/api/community/threads/${t.id}/posts`, { body: "while suspended" })).data.error.code, "suspended");
    assert.ok(one(`SELECT until FROM community_suspensions WHERE user_id = '${a.user.id}'`).until);
    // Lifting it: audited, and posting works again.
    const list = (await admin.get("/api/admin/community/suspensions")).data.suspensions;
    assert.ok(list.some((x) => x.userId === a.user.id && x.name === a.name));
    assert.equal((await admin.req("DELETE", `/api/admin/community/suspensions/${a.user.id}`)).status, 200);
    assert.equal((await admin.req("DELETE", `/api/admin/community/suspensions/${a.user.id}`)).status, 404);
    assert.equal((await a.c.post(`/api/community/threads/${t.id}/posts`, { body: "back again" })).status, 201);
  });

  test("what its author deleted can still be removed for a legal reason, and is then kept; dismissing settles only AutoStacc's", async () => {
    const a = await person();
    const b = await person();
    const t = await take(b.c);
    const post = await reply(a.c, t, "soon deleted by me");
    await report(b.c, post);
    const c = await person();
    await report(c.c, post, "harassment");
    assert.equal((await a.c.req("DELETE", `/api/community/posts/${post}`)).status, 200);
    const admin = await freshAdmin(ctx.mock.url);
    const other = await reply(a.c, t, "another reply");
    await report(b.c, other);
    await report(c.c, other, "rules");
    assert.equal((await resolve(admin, other, "dismissed")).status, 200);
    assert.deepEqual(db(`SELECT route, status FROM community_reports WHERE target_id = '${other}' ORDER BY route`)[0], [{ route: "autostacc", status: "dismissed" }, { route: "space", status: "open" }]);
    assert.equal((await resolve(admin, post, "removed")).status, 200);
    assert.deepEqual(one(`SELECT removed_reason AS why, body FROM community_posts WHERE id = '${post}'`), { why: "legal", body: "soon deleted by me" });
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_reports WHERE target_id = '${post}' AND status = 'open'`).n, 0, "the space's report too");
    // Two decisions at once: one wins.
    const p3 = await reply(c.c, t, "a third one");
    await report(b.c, p3);
    const both = await Promise.all([resolve(admin, p3, "removed"), resolve(admin, p3, "dismissed")]);
    assert.equal(both.filter((r) => r.status === 200).length, 1, both.map((r) => r.status).join(","));
  });

  test("an under-16 account: its community activity goes and it can't post again", async () => {
    const kid = await person();
    const b = await person();
    const t = await take(kid.c);
    const post = await reply(kid.c, await take(b.c), "my reply");
    const kept = await reply(kid.c, await take(b.c), "infringing reply kept by law");
    db(`UPDATE community_posts SET state = 'removed', removed_reason = 'legal', removed_at = '2026-10-01T00:00:00.000Z' WHERE id = '${kept}'`);
    db(`INSERT INTO community_post_edits (post_id, at, body) VALUES ('${kept}', '2026-10-01T00:00:00.000Z', 'earlier words')`);
    await report(b.c, post, "underage");
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await resolve(admin, post, "underage", { reason: "Said they're 14 in a post" })).status, 200);
    assert.deepEqual(one(`SELECT state, body, author_user_id AS author FROM community_posts WHERE id = '${post}'`), { state: "removed", body: "", author: null });
    assert.deepEqual(one(`SELECT state, title FROM community_threads WHERE id = '${t.id}'`), { state: "removed", title: "Removed" });
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_members WHERE user_id = '${kid.user.id}'`).n, 0);
    assert.equal(one(`SELECT until FROM community_suspensions WHERE user_id = '${kid.user.id}'`).until, null);
    assert.equal((await kid.c.get("/api/community/me")).data.member, null);
    // What AutoStacc removed for a legal reason stays as it was, edit history too (security review).
    assert.deepEqual(one(`SELECT removed_reason AS why, body FROM community_posts WHERE id = '${kept}'`), { why: "legal", body: "infringing reply kept by law" });
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_post_edits WHERE post_id = '${kept}'`).n, 1);
  });

  test("a copyright notice can take a post down for a legal reason; withdrawing the notice brings it back", async () => {
    const a = await person();
    const b = await person();
    const t = await take(b.c);
    const post = await reply(a.c, t, "a reply with someone else's lyrics");
    const admin = await freshAdmin(ctx.mock.url);
    const nid = (await admin.post("/api/admin/copyright/notices", { claimantName: "Lyric Owner", claimantEmail: "lyrics@example.com", work: "Our song's lyrics", location: "a community reply", statements: true })).data.id;
    assert.equal((await admin.post(`/api/admin/copyright/notices/${nid}`, { outcome: "accepted", uploaderId: a.user.id, targets: [{ kind: "post", id: post }] })).status, 200);
    assert.deepEqual(one(`SELECT state, removed_reason AS why FROM community_posts WHERE id = '${post}'`), { state: "removed", why: "legal" });
    assert.equal((await admin.post(`/api/admin/copyright/notices/${nid}`, { outcome: "withdrawn", note: "Claimant withdrew" })).status, 200);
    assert.deepEqual(one(`SELECT state, removed_reason AS why FROM community_posts WHERE id = '${post}'`), { state: "visible", why: null });
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_mod_log WHERE target_id = '${post}' AND action = 'legal_restore'`).n, 1);
    // Something already down for another reason can't be named, so a counter-notice can never bring it back.
    const gone = await reply(a.c, t, "deleted by its author");
    await a.c.req("DELETE", `/api/community/posts/${gone}`);
    const n2 = (await admin.post("/api/admin/copyright/notices", { claimantName: "Lyric Owner", claimantEmail: "lyrics@example.com", work: "Our song", location: "a reply", statements: true })).data.id;
    assert.equal((await admin.post(`/api/admin/copyright/notices/${n2}`, { outcome: "accepted", uploaderId: a.user.id, targets: [{ kind: "post", id: gone }] })).data.error.code, "target_not_up");
  });

  test("three copyright strikes: no links in new posts or edits; text is fine", async () => {
    const a = await person();
    const t = await take((await person()).c);
    db(`INSERT INTO copyright_notices (id, source, claimant_name, claimant_email, work, location, status, created_at) VALUES ('cpn_textonly${n}', 'email', 'X', 'x@example.com', 'w', 'l', 'accepted', '2026-10-20T00:00:00.000Z')`);
    for (let i = 0; i < 3; i++) db(`INSERT INTO copyright_strikes (id, notice_id, subject, subject_id, units, created_at, expires_at) VALUES ('cps_to${n}x${i}', 'cpn_textonly${n}', 'account', '${a.user.id}', 2, '2026-10-20T00:00:00.000Z', '2027-10-20T00:00:00.000Z')`);
    for (const body of ["see https://example.com/track", "grab it at www.example.com", "[here](https://x.example)"]) {
      assert.equal((await a.c.post(`/api/community/threads/${t.id}/posts`, { body })).data.error.code, "copyright_text_only", body);
    }
    db(`DELETE FROM rateLimit WHERE key = 'gs:community-pace:${a.user.id}'`); // refused tries count toward three a minute
    assert.equal((await a.c.post(`/api/community/threads/${t.id}/posts`, { body: "plain words are fine" })).status, 201);
  });
});

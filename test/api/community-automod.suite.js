// Link approval and automatic moderation on the switched-on store (test/api/community.test.js; features linkrules,
// wordfilter, newaccount, patterns, and the core's held posts): a link to an unknown site holds the post (stored
// hidden, shown to its writer as waiting, listed to the team, approved or rejected once), the safe list and the team's
// allowed sites pass, the ban list is always refused, team members are exempt from holds, rules are the team's alone,
// and each rule works with the others' settings untouched.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

const HELP = "chn_autostacc_help";
const SPACE = "spc_autostacc";

export default (ctx) => describe("community automod (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cma"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: `Auto Test ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } })).status, 201);
    return { c, user };
  };
  const take = (c, body, title = `Automod take ${++n}`) => c.post("/api/community/threads", { channelId: HELP, type: "discussion", title, body });
  const reply = (c, threadId, body) => c.post(`/api/community/threads/${threadId}/posts`, { body });
  const admin = async () => {
    const a = await freshAdmin(ctx.mock.url);
    await a.req("PUT", "/api/community/me", { body: { displayName: `Auto Admin ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } });
    return a;
  };
  const clearPace = (id) => db(`DELETE FROM rateLimit WHERE key ${id ? `= 'gs:community-pace:${id}'` : "LIKE 'gs:community-pace:%'"}`);

  test("an unknown site holds the take: hidden, waiting for its writer, listed to the team, approved once", async () => {
    const a = await person();
    const t = await take(a.c, "my beat is at https://unknown-site.example/beat");
    assert.equal(t.status, 201);
    assert.equal(t.data.held, true);
    const id = t.data.thread.id;
    assert.equal(one(`SELECT state FROM community_threads WHERE id = '${id}'`).state, "hidden");
    assert.equal(one(`SELECT rule FROM community_holds WHERE target_id = '${id}'`).rule, "links");
    assert.equal((await new Client(ctx.mock.url).get(`/community/t/${id}`)).status, 404, "nobody sees it");
    const mine = (await a.c.get("/api/community/holds/mine")).data.held;
    assert.equal(mine.some((x) => x.id === id), true);
    assert.equal((await a.c.get("/api/community/moderated")).data.items.some((x) => x.id === id), false, "waiting isn't a takedown to appeal");
    const team = await admin();
    const queue = (await team.get(`/api/community/spaces/${SPACE}/holds`)).data.held;
    assert.ok(queue.some((x) => x.id === id && x.rule === "links"));
    assert.equal((await a.c.get(`/api/community/spaces/${SPACE}/holds`)).status, 404, "only the team sees the queue");
    assert.equal((await a.c.post("/api/community/holds/decide", { targetType: "thread", targetId: id, outcome: "approve" })).status, 404, "only the team decides");
    assert.equal((await team.post("/api/community/holds/decide", { targetType: "thread", targetId: id, outcome: "approve" })).status, 200);
    assert.equal(one(`SELECT state FROM community_threads WHERE id = '${id}'`).state, "visible");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_holds WHERE target_id = '${id}'`).n, 0);
    assert.equal((await team.post("/api/community/holds/decide", { targetType: "thread", targetId: id, outcome: "reject", reason: "second try" })).status, 404, "decided once");
  });

  test("rejecting needs a reason, removes the post and tells its writer why; a held reply doesn't count until approved", async () => {
    const a = await person();
    const b = await person();
    const t = (await take(b.c, "plain words")).data.thread;
    const before = one(`SELECT reply_count AS n FROM community_threads WHERE id = '${t.id}'`).n;
    const r = await reply(a.c, t.id, "visit https://other-unknown.example");
    assert.equal(r.data.held, true);
    const pid = r.data.post.id;
    assert.equal(one(`SELECT reply_count AS n FROM community_threads WHERE id = '${t.id}'`).n, before);
    const team = await admin();
    assert.equal((await team.post("/api/community/holds/decide", { targetType: "post", targetId: pid, outcome: "reject" })).data.error.code, "reason_required");
    assert.equal((await team.post("/api/community/holds/decide", { targetType: "post", targetId: pid, outcome: "reject", reason: "Not for this space" })).status, 200);
    assert.deepEqual(one(`SELECT state, removed_reason AS why FROM community_posts WHERE id = '${pid}'`), { state: "removed", why: "space_rules" });
    const notice = (await a.c.get("/api/community/moderated")).data.items.find((x) => x.id === pid);
    assert.match(notice.reason, /Not for this space/);
    // Approving a held reply makes it count.
    clearPace(a.user.id);
    const r2 = await reply(a.c, t.id, "another https://third-unknown.example");
    assert.equal((await team.post("/api/community/holds/decide", { targetType: "post", targetId: r2.data.post.id, outcome: "approve" })).status, 200);
    assert.equal(one(`SELECT reply_count AS n FROM community_threads WHERE id = '${t.id}'`).n, before + 1);
  });

  test("safe sites and AutoStacc pass; the ban list is refused; the team's allowed sites pass; a team member's links pass", async () => {
    const a = await person();
    assert.equal((await take(a.c, "https://www.youtube.com/watch?v=abc and https://autostacc.com/shop")).data.held, undefined);
    clearPace(a.user.id);
    const banned = await take(a.c, "see https://www.pornhub.com/x");
    assert.equal(banned.data.error.code, "link_banned");
    clearPace(a.user.id);
    const team = await admin();
    assert.equal((await take(a.c, "https://allowed-by-team.example/x")).data.held, true);
    assert.equal((await a.c.req("PUT", `/api/community/spaces/${SPACE}/allowed-links`, { body: { host: "allowed-by-team.example" } })).status, 404, "only the team");
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/allowed-links`, { body: { host: "https://www.Allowed-By-Team.example/page" } })).status, 200);
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/allowed-links`, { body: { host: "pornhub.com" } })).data.error.code, "site_banned");
    assert.equal((await team.req("PUT", `/api/community/spaces/${SPACE}/allowed-links`, { body: { host: "not a host" } })).status, 400);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "now https://sub.allowed-by-team.example/x")).data.held, undefined);
    clearPace();
    assert.equal((await take(team, "https://never-seen.example/x as the team", "Team post with a link")).data.held, undefined);
    assert.equal((await team.req("DELETE", `/api/community/spaces/${SPACE}/allowed-links`, { body: { host: "allowed-by-team.example" } })).status, 200);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "https://allowed-by-team.example/y")).data.held, true, "removed from the list");
  });

  test("an edit that adds a link to an unknown site is refused, not queued", async () => {
    const a = await person();
    const t = await take(a.c, "plain");
    const post = one(`SELECT id FROM community_posts WHERE thread_id = '${t.data.thread.id}'`).id;
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "now https://edit-unknown.example" } })).data.error.code, "needs_approval");
    assert.equal((await a.c.req("PATCH", `/api/community/posts/${post}`, { body: { body: "still plain, edited" } })).status, 200);
  });

  test("the most any one person can have waiting is five", async () => {
    const a = await person();
    for (let i = 0; i < 5; i++) {
      clearPace(a.user.id);
      assert.equal((await take(a.c, `https://cap-${i}.example`)).data.held, true);
    }
    clearPace(a.user.id);
    assert.equal((await take(a.c, "https://cap-6.example")).data.error.code, "too_many_held");
    assert.equal((await take(a.c, "no link is fine")).status, 201);
  });

  test("team words: hold or refuse, whole words only, team members exempt; only the team edits the list", async () => {
    const a = await person();
    const team = await admin();
    const path = `/api/community/spaces/${SPACE}/filter-words`;
    assert.equal((await a.c.req("PUT", path, { body: { phrase: "buyfollowers", action: "refuse" } })).status, 404);
    assert.equal((await team.req("PUT", path, { body: { phrase: "BuyFollowers", action: "refuse" } })).status, 200);
    assert.equal((await team.req("PUT", path, { body: { phrase: "crossposted", action: "hold" } })).status, 200);
    assert.equal((await team.req("PUT", path, { body: { phrase: "x", action: "hold" } })).status, 400);
    assert.equal((await team.req("PUT", path, { body: { phrase: "word", action: "delete" } })).status, 400);
    assert.equal((await take(a.c, "please BUYFOLLOWERS today")).data.error.code, "filtered");
    clearPace(a.user.id);
    assert.equal((await take(a.c, "this was crossposted from elsewhere")).data.held, true);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "buyfollowersnot is a different word")).status, 201);
    clearPace();
    assert.equal((await take(team, "team may say buyfollowers", "Team and the word")).status, 201);
    const words = (await team.get(path)).data.words;
    const id = words.find((w) => w.phrase === "buyfollowers").id;
    assert.equal((await team.req("DELETE", path, { body: { id } })).status, 200);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "buyfollowers is fine now")).status, 201);
    await team.req("DELETE", path, { body: { id: words.find((w) => w.phrase === "crossposted").id } });
  });

  test("new-account rules: hold a new account's posts, or refuse their links; settings are bounded", async () => {
    const a = await person();
    const team = await admin();
    const path = `/api/community/spaces/${SPACE}/new-account-rule`;
    assert.equal((await a.c.get(path)).status, 404);
    assert.equal((await team.req("PUT", path, { body: { accountDays: 999, spacePosts: 0, mode: "hold" } })).status, 400);
    assert.equal((await team.req("PUT", path, { body: { accountDays: 5, spacePosts: 0, mode: "nolinks" } })).status, 200);
    assert.equal((await take(a.c, "see https://soundcloud.com/x/y")).data.error.code, "new_account_links");
    clearPace(a.user.id);
    assert.equal((await take(a.c, "words only")).status, 201);
    assert.equal((await team.req("PUT", path, { body: { accountDays: 5, spacePosts: 0, mode: "hold" } })).status, 200);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "a new account's plain words")).data.held, true);
    // An old account is not new.
    db(`UPDATE "user" SET createdAt = '2020-01-01T00:00:00.000Z' WHERE id = '${a.user.id}'`);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "an old account's plain words")).status, 201);
    assert.equal((await team.req("PUT", path, { body: { accountDays: 0, spacePosts: 0, mode: "hold" } })).status, 200);
  });

  test("pattern rules: hold or refuse by a form-built test, each switchable; no expression is ever run", async () => {
    const a = await person();
    const team = await admin();
    const path = `/api/community/spaces/${SPACE}/pattern-rules`;
    assert.equal((await a.c.post(path, { name: "x", field: "body", test: "link", action: "hold" })).status, 404);
    assert.equal((await team.post(path, { name: "No shouting", field: "any", test: "caps", action: "refuse" })).status, 201);
    assert.equal((await team.post(path, { name: "Too short", field: "body", test: "short", value: "8", action: "hold" })).status, 201);
    assert.equal((await team.post(path, { name: "bad", field: "body", test: "regex", value: ".*", action: "hold" })).status, 400);
    assert.equal((await team.post(path, { name: "bad", field: "body", test: "contains", value: "x", action: "hold" })).status, 400);
    assert.equal((await take(a.c, "BUY MY BEATS RIGHT NOW EVERYONE")).data.error.code, "rule_refused");
    clearPace(a.user.id);
    assert.equal((await take(a.c, "hi")).data.held, true);
    const rules = (await team.get(path)).data.rules;
    for (const r of rules) assert.equal((await team.req("PATCH", path, { body: { id: r.id, enabled: false } })).status, 200);
    clearPace(a.user.id);
    assert.equal((await take(a.c, "BUY MY BEATS RIGHT NOW EVERYONE")).status, 201);
    for (const r of rules) assert.equal((await team.req("DELETE", path, { body: { id: r.id } })).status, 200);
    assert.equal((await team.req("DELETE", path, { body: { id: "cpr_nope" } })).status, 404);
  });
});

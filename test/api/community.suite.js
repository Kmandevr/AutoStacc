// The community's public pages (server/community/public.js; docs/community.md). The default export runs against a store
// with the community.forum switch on (test/api/community.test.js): spaces, channels and threads render on the server
// from the database with everything escaped, hidden and removed threads don't exist to the public, outdated thread
// addresses redirect, the sitemap lists only what's visible, and pages carry the strict policy. `switchedOff` runs in
// the accounts group (switch off, the default): /community is the static "opening soon" page and nothing under it exists.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sqlAll } from "../support/client.js";

const T0 = "2026-10-16T10:00:00.000Z";
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function switchedOff(ctx) {
  return describe("community (switched off)", () => {
    test("/community is the opening-soon page and nothing under it exists", async () => {
      const anon = new Client(ctx.mock.url);
      const home = await anon.get("/community");
      assert.equal(home.status, 200);
      assert.match(home.data, /Opening soon/);
      assert.match(home.data, /href="\/community-rules"/);
      for (const p of ["/community/autostacc", "/community/autostacc/help", "/community/sitemap.xml", "/community/t/thr_aaaa-x"]) {
        assert.equal((await anon.get(p)).status, 404, p);
      }
    });
  });
}

export default (ctx) => describe("community pages (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const anon = () => new Client(ctx.mock.url);

  // A member, a fan community, and threads in AutoStacc's own space (seeded by migration 0032).
  const seed = () => db(`
    INSERT INTO community_members (user_id, display_name, name_key, age_confirmed_at, created_at) VALUES ('usr_cm1', 'Beat <b>Maker</b>', 'beatmaker', ${q(T0)}, ${q(T0)});
    INSERT INTO community_spaces (id, slug, name, name_key, kind, founder_user_id, official, description, rules, state, last_team_activity_at, created_at)
      VALUES ('spc_fans', 'fan-club', 'Fan <i>club</i>', 'fanclub', 'community', 'usr_cm1', 0, 'Talk about <script>x</script>', '- be **kind**', 'read_only', ${q(T0)}, ${q(T0)});
    INSERT INTO community_channels (id, space_id, slug, name, created_at) VALUES ('chn_fans_gen', 'spc_fans', 'general', 'General', ${q(T0)});
    INSERT INTO community_threads (id, space_id, channel_id, type, title, slug, author_user_id, state, score, reply_count, last_post_at, created_at, accepted_post_id)
      VALUES ('thr_question', 'spc_autostacc', 'chn_autostacc_help', 'question', 'How do I </script><script>alert(1)</script> export stems?', 'how-do-i-export-stems', 'usr_cm1', 'visible', 3, 2, ${q(T0)}, ${q(T0)}, 'pst_a2');
    INSERT INTO community_posts (id, thread_id, author_user_id, body, state, helpful, created_at) VALUES
      ('pst_q1', 'thr_question', 'usr_cm1', 'Question <img src=x onerror=alert(1)> see [docs](javascript:alert(1)) and https://example.test/a', 'visible', 0, ${q(T0)}),
      ('pst_a1', 'thr_question', NULL, 'An answer from someone who left', 'visible', 5, '2026-10-16T10:01:00.000Z'),
      ('pst_a2', 'thr_question', 'usr_cm1', 'The **accepted** answer', 'visible', 1, '2026-10-16T10:02:00.000Z'),
      ('pst_a3', 'thr_question', 'usr_cm1', 'secret removed text', 'removed', 0, '2026-10-16T10:03:00.000Z');
    INSERT INTO community_threads (id, space_id, channel_id, type, title, slug, author_user_id, state, last_post_at, created_at)
      VALUES ('thr_hidden', 'spc_autostacc', 'chn_autostacc_help', 'discussion', 'Hidden thread title', 'hidden-thread', 'usr_cm1', 'hidden', ${q(T0)}, ${q(T0)});
    INSERT INTO community_posts (id, thread_id, author_user_id, body, created_at) VALUES ('pst_h', 'thr_hidden', 'usr_cm1', 'hidden body', ${q(T0)});
    INSERT INTO community_threads (id, space_id, channel_id, type, title, slug, author_user_id, state, last_post_at, created_at)
      VALUES ('thr_fan', 'spc_fans', 'chn_fans_gen', 'discussion', 'Fan thread', 'fan-thread', 'usr_cm1', 'visible', ${q(T0)}, ${q(T0)});
    INSERT INTO community_posts (id, thread_id, author_user_id, body, created_at) VALUES ('pst_f', 'thr_fan', 'usr_cm1', 'hello', ${q(T0)});
  `);

  test("the home page lists spaces and threads, escaped, with the strict policy", async () => {
    seed();
    const r = await anon().get("/community");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(r.data, /<link rel="canonical" href="[^"]+\/community">/);
    assert.match(r.data, /href="\/community\/autostacc"/);
    assert.match(r.data, /Fan &lt;i&gt;club&lt;\/i&gt;/);
    assert.match(r.data, /Unofficial/);
    assert.doesNotMatch(r.data, /Hidden thread title/);
    assert.doesNotMatch(r.data, /Opening soon/, "the template's closed text is replaced");
    assert.doesNotMatch(r.data, /<script>alert|<i>club/);
  });

  test("a thread renders its posts safely, the accepted answer first and removed posts as placeholders", async () => {
    const r = await anon().get("/community/t/thr_question-how-do-i-export-stems");
    assert.equal(r.status, 200);
    const html = r.data;
    assert.doesNotMatch(html, /<img src=x|<script>alert|href="javascript:/i);
    assert.match(html, /Beat &lt;b&gt;Maker&lt;\/b&gt;/);
    assert.match(html, /<span class="cm-deleted">deleted user<\/span>/);
    assert.match(html, /<a href="https:\/\/example.test\/a" rel="ugc nofollow noopener">/);
    assert.ok(html.indexOf("The <strong>accepted</strong> answer") < html.indexOf("An answer from someone who left"), "accepted answer first");
    assert.doesNotMatch(html, /secret removed text/);
    assert.match(html, /Removed\./);
    // Structured data: a question page, and nothing from a post can close its script tag.
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    assert.doesNotMatch(ld, /<\/script/i);
    const data = JSON.parse(ld);
    assert.equal(data["@graph"][0]["@type"], "QAPage");
    assert.equal(data["@graph"][0].mainEntity.answerCount, 2);
    assert.match(data["@graph"][0].mainEntity.acceptedAnswer.text, /accepted/);
  });

  test("a thread's address without or with an old slug redirects to the current one", async () => {
    for (const p of ["/community/t/thr_question", "/community/t/thr_question-old-title"]) {
      const r = await anon().get(p);
      assert.equal(r.status, 301, p);
      assert.match(r.headers.get("location"), /\/community\/t\/thr_question-how-do-i-export-stems$/);
    }
  });

  test("hidden, removed and unknown things don't exist to the public", async () => {
    db(`INSERT INTO community_threads (id, space_id, channel_id, type, title, slug, state, removed_reason, last_post_at, created_at)
      VALUES ('thr_gone', 'spc_autostacc', 'chn_autostacc_help', 'discussion', 'Gone', 'gone', 'removed', 'legal', ${q(T0)}, ${q(T0)})`);
    for (const p of ["/community/t/thr_hidden-hidden-thread", "/community/t/thr_gone-gone", "/community/t/thr_nope-x", "/community/nope",
      "/community/autostacc/nope", "/community/t/THR_QUESTION-x", "/community/a/b/c", "/community/t/thr_question-x/extra"]) {
      const r = await anon().get(p);
      assert.ok(r.status === 404 || r.status === 301, `${p}: ${r.status}`);
      if (r.status === 301) assert.doesNotMatch(r.headers.get("location"), /hidden|gone/);
    }
    assert.equal((await anon().get("/community/t/thr_hidden-hidden-thread")).status, 404);
    assert.equal((await anon().get("/community/t/thr_gone-gone")).status, 404);
  });

  test("a space and its channels: rules through the formatter, the read-only note, sorting and channel filter", async () => {
    const space = await anon().get("/community/fan-club");
    assert.equal(space.status, 200);
    assert.match(space.data, /read-only/);
    assert.match(space.data, /<li>be <strong>kind<\/strong><\/li>/);
    assert.doesNotMatch(space.data, /<script>x/);
    assert.match(space.data, /Fan thread/);
    const channel = await anon().get("/community/autostacc/help?sort=new");
    assert.equal(channel.status, 200);
    assert.match(channel.data, /export stems/);
    assert.doesNotMatch(channel.data, /Fan thread/);
    assert.match(channel.data, /name="robots" content="noindex/, "a sorted view isn't indexed");
    assert.equal((await anon().get("/community/autostacc/show-your-stacc")).status, 200);
    assert.equal((await anon().get("/community/Fan-Club")).status, 301);
  });

  test("the sitemap lists spaces and visible threads only", async () => {
    const r = await anon().get("/community/sitemap.xml");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /xml/);
    assert.match(r.data, /\/community\/t\/thr_question-how-do-i-export-stems</);
    assert.match(r.data, /\/community\/fan-club</);
    assert.doesNotMatch(r.data, /thr_hidden|thr_gone/);
  });

  test("a hidden accepted answer doesn't mark the thread answered or count as an answer", async () => {
    db("UPDATE community_posts SET state = 'hidden' WHERE id = 'pst_a2'");
    const list = await anon().get("/community/autostacc/help");
    assert.doesNotMatch(list.data, /Answered<\/span> How do I/);
    const page = await anon().get("/community/t/thr_question-how-do-i-export-stems");
    assert.match(page.data, /1 answer</);
    assert.doesNotMatch(page.data, /Accepted answer/);
    assert.doesNotMatch(page.data, /The <strong>accepted<\/strong> answer/);
    db("UPDATE community_posts SET state = 'visible' WHERE id = 'pst_a2'");
  });

  test("HEAD answers without a body, and junk parameters still give the same page", async () => {
    const head = await anon().req("HEAD", "/community");
    assert.equal(head.status, 200);
    assert.equal(head.data, "");
    const junk = await anon().get("/community?x=123&sort=nonsense&page=-4");
    assert.equal(junk.status, 200);
    assert.match(junk.data, /<link rel="canonical"/);
  });

  test("only GET and HEAD", async () => {
    const r = await anon().post("/community/autostacc", {});
    assert.notEqual(r.status, 200);
  });
});

// Rich posts on the switched-on store (test/api/community.test.js; server/community/features/{embeds,cards,codeblocks}):
// a take with a music link, a code block and an AutoStacc link renders the player, the block and the marked link, the
// community page's policy allows frames from the four music hosts only, and the card lookup answers only for public
// things (never a hidden take, an unknown address or a bad path) and from the store's own data.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";

const HELP = "chn_autostacc_help";

export default (ctx) => describe("community rich posts (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  let n = 0;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("cmr"));
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: `Rich Test ${++n} ${Date.now().toString(36).slice(-4)}`, ageConfirmed: true } })).status, 201);
    return { c, user };
  };
  const take = async (c, body, title = `Rich take ${++n}`) => ({ ...(await c.post("/api/community/threads", { channelId: HELP, type: "discussion", title, body })).data.thread, title });

  test("a take shows the player, the code block exactly and a marked AutoStacc link; the policy allows only the music hosts", async () => {
    const a = await person();
    const t = await take(a.c, "Hear it https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC\n\n```ini\n[mix]\ngain = **2**\n```\n\nSee https://autostacc.com/community/t/thr_question-how-do-i-export-stems");
    const reader = new Client(ctx.mock.url);
    let r = await reader.get(`/community/t/${t.id}`);
    assert.equal(r.status, 301, "the address with the title's words is the real one");
    r = await reader.get(new URL(r.headers.get("location")).pathname);
    assert.equal(r.status, 200);
    assert.match(r.data, /<iframe src="https:\/\/open\.spotify\.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC"/);
    assert.match(r.data, /<pre><code>\[mix\]\ngain = \*\*2\*\*<\/code><\/pre>/);
    assert.match(r.data, /data-cm-card="\/community\/t\/thr_question-how-do-i-export-stems"/);
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/open\.spotify\.com https:\/\/w\.soundcloud\.com https:\/\/embed\.music\.apple\.com;/);
    assert.match(csp, /script-src 'self';/);
  });

  test("the card lookup: a visible take, a product and a creator; never a hidden take or a made-up address", async () => {
    const a = await person();
    const t = await take(a.c, "A take to card");
    const anon = new Client(ctx.mock.url);
    const q = (p) => anon.get(`/api/community/cards?path=${encodeURIComponent(p)}`);
    const card = await q(`/community/t/${t.id}`);
    assert.equal(card.status, 200);
    assert.deepEqual([card.data.card.kind, card.data.card.title], ["take", t.title]);
    db(`UPDATE community_threads SET state = 'hidden' WHERE id = '${t.id}'`);
    assert.equal((await q(`/community/t/${t.id}`)).status, 404);
    assert.equal((await q("/community/t/thr_nope-x")).status, 404);
    assert.equal((await q("/nothing-here-at-all")).status, 404);
    for (const bad of ["", "shop/x", "//evil.example", "/a/../b", "/x?y=1", `/${"a".repeat(300)}`]) assert.equal((await q(bad)).status, 400, bad);
    assert.equal((await anon.get("/api/community/cards")).status, 400);
    const shop = db("SELECT id FROM products WHERE published = 1 AND deleted_at IS NULL LIMIT 1")[0][0];
    if (shop) {
      const p = await q(`/shop/${shop.id}`);
      assert.equal(p.status, 200);
      assert.equal(p.data.card.kind, "product");
      assert.match(p.data.card.path, /^\/shop\//);
    }
    db(`UPDATE products SET published = 0 WHERE id = '${(shop || {}).id}'`);
    if (shop) assert.equal((await q(`/shop/${shop.id}`)).status, 404, "unpublished products have no card");
  });
});

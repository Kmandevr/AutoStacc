// Pages: the boundary between the public site and the signed-in app, over HTTP as a browser or crawler sees it.
// Public pages answer anyone; the account pages (/dashboard, /account, /settings) are gated on the server and send
// everyone else to login with a safe way back; no page's HTML (public or private) carries anyone's data.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sql, unique } from "../support/client.js";

const PUBLIC = ["/", "/shop", "/shop/wallpapers", "/projects", "/autostacc/glitches-and-stitches", "/autostacc/glitches-and-stitches/music", "/about"];
const GATED = ["/dashboard", "/account", "/settings", "/studio"];
const goesToLogin = (r, next) => {
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `/login?next=${encodeURIComponent(next)}`);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.data, "", "no page at all, not even the empty app");
};

export default (ctx) => describe("pages", () => {
  test("public pages answer anonymous visitors directly", async () => {
    const anon = new Client(ctx.mock.url);
    for (const p of PUBLIC) {
      const r = await anon.get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.data, /<html lang="en">/, p);
    }
    // The home page is the public cover: it offers signing in and creating an account, and the app's links start hidden.
    const home = (await anon.get("/")).data;
    assert.match(home, /href="\/login#signup" data-auth="out"/);
    assert.match(home, /<span data-auth="out">[^<]*<a href="\/login">Log in<\/a>/);
    assert.match(home, /href="\/dashboard" data-auth="in" hidden/);
    assert.doesNotMatch(home, /\/js\/(dashboard|account|settings|store)\.js/, "the cover loads no account or ownership script");
  });

  test("account pages send anonymous visitors to login and back, and never serve the app", async () => {
    const anon = new Client(ctx.mock.url);
    for (const p of GATED) goesToLogin(await anon.get(p), p);
    goesToLogin(await anon.get("/account?tab=orders"), "/account?tab=orders");
    goesToLogin(await anon.get("/settings/"), "/settings");
    goesToLogin(await anon.req("HEAD", "/dashboard"), "/dashboard");
  });

  test("forged, expired and signed-out sessions are no session to the gate", async () => {
    const forged = new Client(ctx.mock.url);
    forged.jar.set("gs.session_token", "forged.token-value");
    for (const p of GATED) goesToLogin(await forged.get(p), p);

    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("gate-expire"));
    assert.equal((await c.get("/dashboard")).status, 200);
    sql(ctx.mock.stateDir, `UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE userId = '${user.id}'`);
    goesToLogin(await c.get("/dashboard"), "/dashboard");

    const d = new Client(ctx.mock.url);
    await verifiedUser(d, unique("gate-signout"));
    const stolen = new Map(d.jar);
    await d.post("/api/auth/sign-out", {});
    for (const p of GATED) goesToLogin(await d.get(p), p);
    const replay = new Client(ctx.mock.url);
    replay.jar = stolen;
    goesToLogin(await replay.get("/dashboard"), "/dashboard");
  });

  test("signed in: the account pages are served, never cached, under the strict CSP", async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("gate-ok"));
    for (const p of GATED) {
      const r = await c.get(p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get("cache-control"), "no-store", p);
      assert.match(r.headers.get("content-security-policy") || "", /script-src 'self'/, p);
      assert.match(r.data, /<meta name="robots" content="noindex">/, p);
      // The page is a shell: who you are comes from the API, so it can never be cached into someone else's page.
      assert.ok(!r.data.includes(user.email) && !r.data.includes(user.id), `${p} embeds nothing about the user`);
    }
    // Public pages stay public and say nothing about who is looking, even to a signed-in visitor.
    for (const p of PUBLIC) {
      const r = await c.get(p);
      assert.equal(r.status, 200, p);
      assert.ok(!r.data.includes(user.email) && !r.data.includes(user.id), `${p} embeds nothing about the user`);
    }
  });

  test("the login redirect can't be bent to another site", async () => {
    const anon = new Client(ctx.mock.url);
    for (const p of ["//evil.example/account", "/account?next=https://evil.example", "/dashboard?x=%2F%2Fevil.example"]) {
      const r = await anon.get(p);
      if (r.status !== 302) continue; // not a gated address at all (e.g. //evil.example/account is a 404)
      const loc = r.headers.get("location");
      assert.match(loc, /^\/login\?next=%2F(dashboard|account|settings)/, `${p} -> ${loc}`);
      const next = new URLSearchParams(loc.split("?")[1]).get("next");
      assert.ok(next.startsWith("/") && !next.startsWith("//"), `${p} -> next ${next}`);
    }
  });

  test("Your Stacc's page opens for guests, but its data stays behind the API", async () => {
    // Guests reach their purchases through the receipt link (/library#key=...), so the page itself isn't gated; what it
    // shows comes only from /api/library, which refuses anyone without a session or a guest key.
    const anon = new Client(ctx.mock.url);
    const page = await anon.get("/library");
    assert.equal(page.status, 200);
    assert.match(page.data, /<meta name="robots" content="noindex">/);
    assert.equal((await anon.get("/api/library")).status, 401);
    assert.equal((await anon.get("/api/orders")).status, 401);
    assert.equal((await anon.post("/api/downloads", { fileId: "pf_abcdefgh" })).status, 401);
  });
});

// Where signing in sends a visitor: the server gate's login redirect (server/pages/guard.js) and the login page's
// return path (GS.safeNext in js/util.js). Both keep visitors on this site, and login never returns to itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loginRedirect, GATED } from "../../server/pages/guard.js";

// js/util.js is a browser script: run it in a bare context and take its GS.
const sandbox = { window: {}, document: {} };
vm.runInNewContext(readFileSync(new URL("../../js/util.js", import.meta.url), "utf8"), sandbox);
const { safeNext, loginPath } = sandbox.window.GS;

test("the gate sends each account page to login and back to itself, query included", () => {
  assert.deepEqual([...GATED], ["/dashboard", "/account", "/settings", "/studio"]);
  for (const p of GATED) assert.equal(loginRedirect(new URL(`https://autostacc.com${p}`)), `/login?next=${encodeURIComponent(p)}`);
  assert.equal(loginRedirect(new URL("https://autostacc.com/account/?tab=orders")), "/login?next=%2Faccount%3Ftab%3Dorders");
});

test("the gate never returns anywhere but its own pages", () => {
  for (const u of ["https://autostacc.com//evil.example/account", "https://autostacc.com/elsewhere", "https://autostacc.com/login"]) {
    assert.equal(loginRedirect(new URL(u)), "/login?next=%2Fdashboard", u);
  }
});

test("login returns only to paths on this site, never to itself; the dashboard otherwise", () => {
  for (const ok of ["/cart", "/dashboard?welcome=1", "/library#signup", "/autostacc/glitches-and-stitches", "/shop?q=a/../b", "/file.v2"]) assert.equal(safeNext(ok), ok);
  for (const bad of ["//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil.example", " /cart", "/login", "/login?next=/x", "/login.html", "/login#signup", "/./login", "/x/../login", "/.//evil.example", "/x/..", "/%2e/login", "/x/%2E%2e/login", "", null, undefined]) {
    assert.equal(safeNext(bad), "/dashboard", String(bad));
  }
  assert.equal(safeNext("//evil.example", "/account"), "/account");
});

test("login links carry the way back, encoded", () => {
  assert.equal(loginPath("/account?tab=orders"), "/login?next=%2Faccount%3Ftab%3Dorders");
  assert.equal(loginPath("/library", "signup"), "/login?next=%2Flibrary#signup");
});

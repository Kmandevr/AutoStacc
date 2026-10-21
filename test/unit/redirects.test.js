// Where signing in sends a visitor: the server gate's login redirect (server/pages/guard.js) and the login page's
// return path (GS.safeNext in js/util.js). Both keep visitors on this site, and login never returns to itself. Also the
// old release addresses in _redirects (they land on content addresses the content Function serves) and the old news
// addresses (straight to the project home, since news is offline until the community opens, #174).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { loginRedirect, GATED, SETTINGS_SECTIONS, ADMIN_PAGES } from "../../server/pages/guard.js";

// js/util.js is a browser script: run it in a bare context and take its GS.
const sandbox = { window: {}, document: {} };
vm.runInNewContext(readFileSync(new URL("../../js/util.js", import.meta.url), "utf8"), sandbox);
const { safeNext, loginPath } = sandbox.window.GS;

test("the gate sends each account page to login and back to itself, query included", () => {
  assert.deepEqual([...GATED], ["/dashboard", "/settings", "/studio"]);
  for (const p of [...GATED, ...SETTINGS_SECTIONS.map((s) => `/settings/${s}`)]) {
    assert.equal(loginRedirect(new URL(`https://autostacc.com${p}`)), `/login?next=${encodeURIComponent(p)}`);
  }
  assert.equal(loginRedirect(new URL("https://autostacc.com/settings/orders/?page=2")), "/login?next=%2Fsettings%2Forders%3Fpage%3D2");
});

test("the gate never returns anywhere but its own pages", () => {
  for (const u of ["https://autostacc.com//evil.example/settings", "https://autostacc.com/elsewhere", "https://autostacc.com/login", "https://autostacc.com/account",
    "https://autostacc.com/settings/nope", "https://autostacc.com/settings/security/x", "https://autostacc.com/settings//evil.example"]) {
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

test("the SEO link check, the page and the store-off rewrites know exactly the Settings sections the server serves", () => {
  const seo = readFileSync(new URL("../../scripts/seo-test.js", import.meta.url), "utf8");
  const listed = JSON.parse(seo.match(/const SETTINGS_SECTIONS = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(listed, SETTINGS_SECTIONS);
  const page = readFileSync(new URL("../../settings.html", import.meta.url), "utf8");
  assert.deepEqual([...page.matchAll(/href="\/settings\/([a-z]+)" data-section="\1"/g)].map((m) => m[1]), SETTINGS_SECTIONS, "the page lists every section, in order");
  const rewrites = readFileSync(new URL("../../_redirects", import.meta.url), "utf8").split("\n").map((l) => l.trim().split(/\s+/)).filter(([, to, code]) => code === "200" && to === "/settings");
  assert.deepEqual(rewrites.map(([from]) => from), SETTINGS_SECTIONS.map((x) => `/settings/${x}`), "the store-off rewrites cover exactly the sections");
});

test("the Control Center's sub-pages are the same in the gate, the page data and the store-off rewrites", () => {
  const box = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../../data/workspaces.js", import.meta.url), "utf8"), box);
  assert.deepEqual([...box.window.WORKSPACES.control.pages.map((p) => p.id)], ADMIN_PAGES, "the gate serves every sub-page the Control Center has");
  const rewrites = readFileSync(new URL("../../_redirects", import.meta.url), "utf8").split("\n").map((l) => l.trim().split(/\s+/)).filter(([from, to, code]) => from.startsWith("/admin/") && to === "/admin" && code === "200");
  assert.deepEqual(rewrites.map(([from]) => from), ADMIN_PAGES.map((x) => `/admin/${x}`), "the store-off rewrites cover exactly the sub-pages");
});

test("old release addresses redirect to the content Function's addresses; old news addresses go straight to the project home", () => {
  const { contentAddress, retiredAddress } = createRequire(import.meta.url)("../../scripts/lib/data.js");
  const rules = readFileSync(new URL("../../_redirects", import.meta.url), "utf8").split("\n").map((l) => l.trim().split(/\s+/))
    .filter(([from, , code]) => from && !from.startsWith("#") && code === "301");
  const to = (from) => (rules.find(([f]) => f === from) || [])[1];
  assert.equal(to("/music/*"), "/autostacc/glitches-and-stitches/music/:splat", "the old /music/* still redirects");
  assert.ok(contentAddress(to("/music/*").replace(":splat", "hail")), "to a release address");
  // News is offline until each creator's community opens (#174): no rule may land on a news address (a 301 chain).
  for (const from of ["/news", "/news/*", "/news.html", "/projects/glitches-and-stitches/news", "/projects/glitches-and-stitches/news/*"])
    assert.equal(to(from), "/autostacc/glitches-and-stitches", from);
  // The first matching rule wins, so the news rules sit before the project's catch-all.
  const order = rules.map(([f]) => f);
  assert.ok(order.indexOf("/projects/glitches-and-stitches/news/*") < order.indexOf("/projects/glitches-and-stitches/*"));
  for (const [from, target] of rules) assert.equal(retiredAddress(target.replace(":splat", "x")), null, `${from} -> ${target} is a chain`);
  // What contentAddress recognizes: /<creator>/<published first-party project>/music/<slug> and /events[/<slug>].
  assert.deepEqual({ ...contentAddress("/autostacc/glitches-and-stitches/music/hail") }, { project: "glitches-and-stitches", kind: "music", slug: "hail" });
  assert.deepEqual({ ...contentAddress("/autostacc/glitches-and-stitches/events/launch-night?x=1") }, { project: "glitches-and-stitches", kind: "events", slug: "launch-night" });
  assert.deepEqual({ ...contentAddress("/autostacc/glitches-and-stitches/events") }, { project: "glitches-and-stitches", kind: "events", slug: "" });
  for (const no of ["/autostacc/glitches-and-stitches/music", "/autostacc/glitches-and-stitches/press/hail", "/autostacc/nope/music/hail",
    "/autostacc/glitches-and-stitches/music/Hail", "/autostacc/glitches-and-stitches/music/hail/x", "/x/glitches-and-stitches/music/hail", "music/hail",
    "/autostacc/glitches-and-stitches/news/hail-out-now"])
    assert.equal(contentAddress(no), null, no);
  // A retired news address is answered with a 301 to the project home.
  for (const p of ["/autostacc/glitches-and-stitches/news", "/autostacc/glitches-and-stitches/news/hail-out-now?x=1"])
    assert.equal(retiredAddress(p), "/autostacc/glitches-and-stitches", p);
  for (const no of ["/autostacc/nope/news", "/autostacc/glitches-and-stitches/news/Hail", "/autostacc/glitches-and-stitches/music/hail"])
    assert.equal(retiredAddress(no), null, no);
});

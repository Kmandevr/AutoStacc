// Page preloading: speculation-rules.json (sent on every page by the Speculation-Rules header in _headers) preloads
// same-origin pages but never anything with side effects or query-string state, and js/prefetch.js, the fallback for
// browsers without Speculation Rules, skips the same addresses. Also that the file ships and its type is set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const rules = JSON.parse(read("speculation-rules.json"));
const MUST_SKIP = ["/api/*", "/media/*", "/logout", "/admin", "/admin/*", "/cart", "/checkout", "/checkout/*"];

test("the rules prefetch same-origin pages at moderate eagerness, and only the home page eagerly", () => {
  assert.deepEqual(Object.keys(rules), ["prefetch"]);
  assert.equal(rules.prefetch.length, 2);
  // The logo is Home on phones (owner, 2026-10-22): / is fetched ahead so it opens at once.
  assert.deepEqual(rules.prefetch[1], { source: "list", urls: ["/"], eagerness: "eager" });
  const [rule] = rules.prefetch;
  assert.equal(rule.source, "document");
  assert.equal(rule.eagerness, "moderate");
  assert.deepEqual(rule.where.and[0], { href_matches: "/*" });
});

test("the rules exclude side effects, admin, checkout, query strings and opted-out links", () => {
  const nots = rules.prefetch[0].where.and.slice(1).map((c) => c.not);
  assert.ok(nots.every(Boolean), "every condition after the first is an exclusion");
  const paths = nots.filter((n) => n.href_matches).map((n) => n.href_matches.pathname);
  for (const p of MUST_SKIP) assert.ok(paths.includes(p), `${p} must be excluded`);
  const selectors = nots.filter((n) => n.selector_matches).map((n) => n.selector_matches).join(",");
  for (const s of ["[href*='?']", "[download]", "[data-no-prefetch]"]) assert.ok(selectors.includes(s), `${s} must be excluded`);
});

test("the header names the file, the file has its type, and the build ships it", () => {
  const headers = read("_headers");
  assert.match(headers, /^\/\*\n(?: {2}.+\n)*? {2}Speculation-Rules: "\/speculation-rules\.json"$/m);
  assert.match(headers, /^\/speculation-rules\.json\n {2}Content-Type: application\/speculationrules\+json$/m);
  for (const src of headers.match(/script-src [^;\n]*/g)) assert.equal(src, "script-src 'self'", "no inline rules: the script policy stays strict");
  assert.match(read("scripts/dist.js"), /ROOT_FILES = \[[^\]]*"speculation-rules\.json"/);
});

// Runs js/prefetch.js against a tiny fake page and returns what it preloads for each link address.
function fallback(supports) {
  const listeners = {}, added = [];
  const link = (href, attrs = []) => ({ getAttribute: () => href, matches: (sel) => attrs.some((a) => sel.includes(a)) });
  const sandbox = {
    window: { HTMLScriptElement: { supports: () => supports } }, navigator: {}, URL, Set,
    location: { href: "https://autostacc.com/shop", origin: "https://autostacc.com", pathname: "/shop" },
    setTimeout, clearTimeout,
    document: {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      createElement: () => ({}), head: { appendChild: (l) => added.push(l.href) },
    },
  };
  vm.runInNewContext(read("js/prefetch.js"), sandbox);
  const press = (href, attrs) => {
    const a = link(href, attrs);
    listeners.pointerdown?.({ target: { closest: () => a } });
  };
  return { listeners, added, press };
}

test("the fallback stays out of the way where Speculation Rules work", () => {
  assert.deepEqual(fallback(true).listeners, {});
});

test("the fallback preloads plain same-origin pages and skips the excluded ones", () => {
  const f = fallback(false);
  for (const href of ["/projects", "/autostacc/glitches-and-stitches#music", "/projects"]) f.press(href);
  for (const href of ["/api/cart", "/media/x.mp3", "/logout", "/admin", "/admin/users", "/cart", "/checkout",
    "/checkout/done", "/shop?sort=new", "?page=2", "https://elsewhere.example/", "/shop"]) f.press(href);
  f.press("/projects/file", ["[download]"]);
  f.press("/explore", ["[data-no-prefetch]"]);
  assert.deepEqual(f.added, ["https://autostacc.com/projects", "https://autostacc.com/autostacc/glitches-and-stitches"]);
});

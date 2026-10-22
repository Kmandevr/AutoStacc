// The automatic-moderation rules' pure parts: which sites a text links to, the site lists' matching (a site and its
// subdomains, never look-alikes), and what each pattern-rule test matches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkHosts } from "../../server/community/core/format.js";
import { siteIn, SAFE, BANNED } from "../../server/community/features/linkrules/lists.js";
import { matches } from "../../server/community/features/patterns/index.js";

test("a text's linked sites: bare and labelled links, lowercase, no www, no repeats, nothing from code or plain words", () => {
  assert.deepEqual(linkHosts("see https://WWW.Example.com/a and [x](https://example.com/b) and https://other.test/."), ["example.com", "other.test"]);
  assert.deepEqual(linkHosts("`https://in-code.test` and example.org and javascript:alert(1)"), []);
});

test("a site matches itself and its subdomains, not look-alikes", () => {
  assert.equal(siteIn("soundcloud.com", SAFE), true);
  assert.equal(siteIn("m.soundcloud.com", SAFE), true);
  assert.equal(siteIn("notsoundcloud.com", SAFE), false);
  assert.equal(siteIn("soundcloud.com.evil.example", SAFE), false);
  assert.equal(siteIn("www.pornhub.com", BANNED), true);
  assert.equal(SAFE.some((d) => BANNED.includes(d)), false);
});

test("pattern tests", () => {
  const m = (test, value, text, field = "body") => matches({ field, test, value }, { title: "Title here", body: text });
  assert.equal(m("contains", "Free Samples", "get FREE samples now"), true);
  assert.equal(m("contains", "free", "nothing", "title"), false);
  assert.equal(m("starts", "hello", "  Hello there"), true);
  assert.equal(m("starts", "hello", "say hello"), false);
  assert.equal(m("link", "", "go to https://x.example"), true);
  assert.equal(m("link", "", "no link here"), false);
  assert.equal(m("caps", "", "BUY MY BEATS RIGHT NOW PLEASE"), true);
  assert.equal(m("caps", "", "Short CAPS"), false);
  assert.equal(m("short", "10", "tiny"), true);
  assert.equal(m("short", "10", "long enough to pass"), false);
  assert.equal(matches({ field: "any", test: "contains", value: "title" }, { title: "Title here", body: "x" }), true);
});

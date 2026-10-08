// The trust pages' text markup (scripts/lib/rich-text.js): everything is escaped except [links](...) to this site,
// https:// or mailto:, **bold** and {contact}; a bad link fails the build. Plus the licence box on product pages, and
// the rule that every kind of product with a licence points at one that exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inline, contact, licenseBox } = require("../../scripts/lib/rich-text.js");
const { loadData } = require("../../scripts/lib/data.js");

const SITE = { email: "support@autostacc.com" };

test("text is escaped; only the allowed markup becomes HTML", () => {
  assert.equal(inline(SITE, "<script>alert(1)</script> & \"x\"", "t"), "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;");
  assert.equal(inline(SITE, "see [Settings](/settings/privacy) **now**", "t"), 'see <a href="/settings/privacy">Settings</a> <strong>now</strong>');
  assert.equal(inline(SITE, "[Stripe](https://stripe.com/privacy)", "t"), '<a href="https://stripe.com/privacy" rel="noopener">Stripe</a>');
  // A label or link can't smuggle markup in: it was escaped before the link was built.
  assert.equal(inline(SITE, '[<img src=x onerror=alert(1)>](/x")', "t"), '<a href="/x&quot;">&lt;img src=x onerror=alert(1)&gt;</a>');
});

test("links must stay on the site, use HTTPS or be mailto; anything else fails the build", () => {
  for (const bad of ["javascript:alert(1)", "//evil.example", "http://plain.example", "data:text/html,x", "evil.example"]) {
    assert.throws(() => inline(SITE, `[x](${bad})`, "data/legal.js privacy"), /must start with/, bad);
  }
});

test("{contact} is the real support address, or says plainly there isn't one yet", () => {
  assert.equal(inline(SITE, "{contact}", "t"), 'Email <a href="mailto:support@autostacc.com">support@autostacc.com</a>.');
  assert.match(contact({ email: "" }), /isn't set up yet/);
  assert.doesNotMatch(contact({ email: "" }), /@/);
});

test("every licensed kind of product points at a licence that exists, and product pages show it", () => {
  const data = loadData();
  for (const [kind, t] of Object.entries(data.productTypes)) {
    if (t.license) assert.ok(data.licenses[t.license], `${kind} -> ${t.license}`);
  }
  const box = licenseBox(data.SITE, data, { id: "x", type: "sample-pack" });
  assert.match(box, /Sound licence/);
  assert.match(box, /href="\/license#sounds"/);
  assert.equal(licenseBox(data.SITE, data, { id: "y", type: "other" }), "", "no fixed licence, no box");
});

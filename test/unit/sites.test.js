// Creator sites, pure parts: slugs and the reserved list (every top-level page, folder and Function of the site is
// reserved), safe text and links, embeds built only from known share links, the site document's checks, rendered
// pages that can't carry scripts, and the revenue split.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RESERVED, slugProblem } from "../../server/lib/slugs.js";
import { markup, safeUrl } from "../../server/sites/text.js";
import { embedFor } from "../../server/sites/embeds.js";
import { cleanDocument } from "../../server/sites/document.js";
import { renderPage, CSP } from "../../server/sites/render.js";
import { splitLine } from "../../server/revenue/split.js";
import { sniffImage } from "../../server/sites/images.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("every top-level name the site uses is reserved, so no creator can take it", () => {
  // Git-ignored local folders (build output, tool caches such as graphify-out) are never published, so they're skipped.
  const names = fs.readdirSync(ROOT);
  let ignored = new Set();
  try { ignored = new Set(execFileSync("git", ["check-ignore", ...names], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n")); } catch { /* none ignored, or no git */ }
  const top = names.filter((f) => !f.startsWith(".") && !ignored.has(f) && !["node_modules", "README.md", "CLAUDE.md", "package.json", "package-lock.json", "wrangler.toml", "test", "docs", "db"].includes(f));
  const fromFunctions = fs.readdirSync(path.join(ROOT, "functions")).filter((f) => !f.startsWith("[") && !f.startsWith(".") && f !== "package.json");
  const creators = new Set(["autostacc", "autostacc.html"]);
  for (const f of [...top, ...fromFunctions].filter((x) => !creators.has(x))) {
    assert.ok(RESERVED.has(f.replace(/\.(html|js)$/, "")) || RESERVED.has(f), `${f} must be in server/lib/slugs.js RESERVED`);
  }
  assert.equal(slugProblem("glitches-and-stitches"), null);
  assert.equal(slugProblem("shop"), "reserved");
  assert.equal(slugProblem("Upper"), "format");
  assert.equal(slugProblem("a--b"), "format");
  assert.equal(slugProblem("ab"), "length");
});

test("links: https, mailto and root-relative only", () => {
  for (const ok of ["https://example.org/x?y=1", "/shop/wallpapers", "mailto:hi@example.org"]) assert.ok(safeUrl(ok), ok);
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "http://plain.example", "https://user:pw@example.org", "/\\evil.example", "vbscript:x", "", "/api/auth/verify-email?token=x", "/media/sites/as_x", "/API/x"])
    assert.equal(safeUrl(bad), null, bad);
});

test("text markup escapes everything before adding its few tags", () => {
  const html = markup("<b>hi</b> **bold** *it* [ok](https://a.example) [no](javascript:x)\n\nnext");
  assert.match(html, /^<p>&lt;b&gt;hi&lt;\/b&gt; <strong>bold<\/strong> <em>it<\/em> <a href="https:\/\/a.example\/"/);
  assert.ok(!/href="javascript/.test(html));
  assert.match(html, /\[no\]\(javascript:x\)/);
  assert.match(html, /<\/p>\n<p>next<\/p>$/);
  assert.equal(markup('[x](https://a.example/"onmouseover="alert(1))'), '<p><a href="https://a.example/%22onmouseover=%22alert(1" rel="noopener noreferrer nofollow ugc" target="_blank">x</a>)</p>');
});

test("embeds come only from known share links and are rebuilt, never copied", () => {
  assert.equal(embedFor("https://www.youtube.com/watch?v=dQw4w9WgXcQ").src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(embedFor("https://youtu.be/dQw4w9WgXcQ").src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(embedFor("https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3?si=x").src, "https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3");
  assert.match(embedFor("https://soundcloud.com/artist/track-name").src, /^https:\/\/w\.soundcloud\.com\/player\/\?url=https%3A%2F%2Fsoundcloud\.com%2Fartist%2Ftrack-name/);
  assert.equal(embedFor("https://music.apple.com/us/album/hail/1847091235?i=1847091237").src, "https://embed.music.apple.com/us/album/hail/1847091235?i=1847091237");
  for (const bad of ["https://evil.example/watch?v=x", "https://www.youtube.com/watch?v=<script>", "http://youtu.be/dQw4w9WgXcQ", "https://open.spotify.com/track/x\"onload", "https://youtube.com.evil.example/watch?v=abc", "javascript:alert(1)"])
    assert.equal(embedFor(bad), null, bad);
});

test("the site document: limits, page addresses and block fields", () => {
  assert.throws(() => cleanDocument({ pages: [] }), /add at least one page/);
  assert.throws(() => cleanDocument({ pages: Array.from({ length: 13 }, (_, i) => ({ slug: `p${i}`, title: "x", blocks: [] })) }), /at most 12/);
  assert.throws(() => cleanDocument({ pages: [{ title: "x", blocks: [{ type: "html", html: "<script>" }] }] }), /must be one of/);
  const { doc, assets, products } = cleanDocument({ theme: { preset: "nope", accent: "red;}body{x", font: "comic" }, pages: [
    { slug: "ignored", title: "Home", blocks: [{ type: "gallery", images: [{ asset: "as_" + "b".repeat(26), alt: "x" }] }, { type: "products", ids: ["wallpapers"] }] },
    { slug: "Events", title: "Events", blocks: [] }] });
  assert.deepEqual(doc.theme, { preset: "midnight", accent: "#a855f7", font: "inter" }, "unknown theme values fall back, never reach CSS");
  assert.equal(doc.pages[0].slug, "", "the first page is the home");
  assert.equal(doc.pages[1].slug, "events");
  assert.deepEqual([...assets], ["as_" + "b".repeat(26)]);
  assert.deepEqual([...products], ["wallpapers"]);
});

test("a rendered page has no script, a strict CSP, and shows only the creator's own images and products", () => {
  const { doc } = cleanDocument({ pages: [{ title: "Home", blocks: [{ type: "image", asset: "as_" + "c".repeat(26), alt: "x" }, { type: "products", ids: ["a-b", "c-d"] }] }] });
  const html = renderPage({ siteUrl: "https://autostacc.com", creator: { slug: "me", name: "Me <3" }, project: { slug: "p", name: "P" }, doc, page: doc.pages[0], indexable: false,
    ctx: { images: new Map(), products: new Map([["a-b", { title: "Mine", path: "/shop/a-b", artwork: null }]]) } });
  assert.ok(!/<script/i.test(html));
  assert.ok(!/as_ccc/.test(html));
  assert.match(html, /Mine/);
  assert.ok(!/c-d/.test(html));
  assert.match(html, /Me &lt;3/);
  for (const rule of ["default-src 'none'", "script-src 'none'", "form-action 'none'", "frame-ancestors 'none'", "base-uri 'none'"]) assert.ok(CSP.includes(rule), rule);
});

test("images are recognised by their bytes, not their names", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniffImage(png).type, "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("<svg><script>x</script></svg>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a......")).type, "image/gif");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 ")).type, "image/webp");
});

test("revenue split: fee + creator share always equals net", () => {
  assert.deepEqual(splitLine({ lineTotalCents: 1000, discountCents: 0, feeBps: 0 }), { netCents: 1000, platformFeeCents: 0, creatorShareCents: 1000 });
  assert.deepEqual(splitLine({ lineTotalCents: 999, discountCents: 100, feeBps: 1000 }), { netCents: 899, platformFeeCents: 90, creatorShareCents: 809 });
  assert.deepEqual(splitLine({ lineTotalCents: 500, discountCents: 600, feeBps: 10000 }), { netCents: 0, platformFeeCents: 0, creatorShareCents: 0 });
  for (let net = 0; net < 300; net += 7) for (const bps of [0, 1, 333, 1500, 10000]) {
    const s = splitLine({ lineTotalCents: net, feeBps: bps });
    assert.equal(s.platformFeeCents + s.creatorShareCents, s.netCents);
    assert.ok(s.platformFeeCents >= 0 && s.creatorShareCents >= 0);
  }
});

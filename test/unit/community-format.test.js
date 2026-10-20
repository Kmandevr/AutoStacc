// The community's one formatter (server/community/core/format.js): everything escaped, a small markup set, links only to
// valid http(s) addresses with their domain shown, and no way for HTML, scripts or other link schemes to get through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { format, inline, plain, safeUrl, MAX_BODY } from "../../server/community/core/format.js";

test("plain text is escaped, never markup", () => {
  assert.equal(inline(`<script>alert("x")</script> & 'q'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
  assert.equal(format("<img src=x onerror=alert(1)>"), "<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  assert.equal(format("<b>bold?</b>"), "<p>&lt;b&gt;bold?&lt;/b&gt;</p>");
});

test("bold, italic and code", () => {
  assert.equal(inline("**loud** and *soft*"), "<strong>loud</strong> and <em>soft</em>");
  assert.equal(inline("2 * 3 * 4"), "2 * 3 * 4");
  assert.equal(inline("snake_case and a*b*c"), "snake_case and a*b*c");
  assert.equal(inline("`<b>**not bold**</b>`"), "<code>&lt;b&gt;**not bold**&lt;/b&gt;</code>");
});

test("links: http(s) only, domain shown, ugc nofollow", () => {
  assert.equal(inline("see https://example.com/a?b=1&c=2."),
    'see <a href="https://example.com/a?b=1&amp;c=2" rel="ugc nofollow noopener"><bdi>https://example.com/a?b=1&amp;c=2</bdi></a> <span class="link-host">(example.com)</span>.');
  assert.equal(inline("[my track](https://www.soundcloud.com/x)"),
    '<a href="https://www.soundcloud.com/x" rel="ugc nofollow noopener"><bdi>my track</bdi></a> <span class="link-host">(soundcloud.com)</span>');
  // a label can't hide where a link goes
  assert.match(inline("[https://autostacc.com](https://evil.test/login)"), /\(evil\.test\)/);
});

test("other schemes and odd addresses stay text", () => {
  for (const bad of ["[x](javascript:alert(1))", "[x](data:text/html,hi)", "[x](//evil.test)", "[x](/settings)", "[x](https://user:pw@evil.test)"]) {
    const html = inline(bad);
    assert.doesNotMatch(html, /<a /, bad);
  }
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://a:b@x.test"), null);
  assert.equal(safeUrl("https://x.test/").hostname, "x.test");
});

test("quotes in a link can't break out of the attribute", () => {
  const html = inline('https://x.test/"onmouseover="alert(1)');
  assert.doesNotMatch(html, /" onmouseover|"onmouseover="alert/);
  assert.doesNotMatch(inline(`[a](https://x.test/'onclick='1)`), /'onclick='/);
});

test("paragraphs, line breaks, lists and quotes", () => {
  assert.equal(format("one\ntwo\n\nthree"), "<p>one<br>two</p>\n<p>three</p>");
  assert.equal(format("Steps:\n- kick\n- snare\n1. first\n2. second"),
    "<p>Steps:</p>\n<ul><li>kick</li><li>snare</li></ul>\n<ol><li>first</li><li>second</li></ol>");
  assert.equal(format("> quoted **text**\n> more\nreply"), "<blockquote><p>quoted <strong>text</strong><br>more</p></blockquote>\n<p>reply</p>");
  assert.equal(format("   \n\n "), "");
});

test("long bodies are cut at the limit and plain() drops markers", () => {
  assert.ok(format("a".repeat(MAX_BODY + 50)).length <= MAX_BODY + 7);
  assert.equal(plain("**Hi** see [this](https://x.test) and `code`\n\nok"), "Hi see this and code ok");
});

test("direction controls are dropped and labels are isolated", () => {
  const html = inline("[\u202emoc.lapyap](https://evil.test) after");
  assert.doesNotMatch(html, /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/);
  assert.match(html, /<bdi>moc\.lapyap<\/bdi><\/a> <span class="link-host">\(evil\.test\)<\/span> after/);
  assert.doesNotMatch(format("a\u202eb"), /\u202e/);
});

test("long runs of punctuation after an address stay fast", () => {
  const t0 = performance.now();
  const html = inline("https://a.test/" + ".".repeat(MAX_BODY) + "x");
  assert.ok(performance.now() - t0 < 50, "formatting took too long");
  assert.match(html, /<a href=/);
});

test("an address with no real host stays text", () => {
  assert.equal(safeUrl("https://www./"), null);
  assert.doesNotMatch(inline("see https://www./ ok"), /<a /);
});

test("hasLink matches exactly what the formatter shows as a link (security review)", async () => {
  const { hasLink, format } = await import("../../server/community/core/format.js");
  for (const t of ["xhttps://glued.example/f", "_https://e.example", "see https://a.example.", "[x](https://y.example)"]) {
    assert.equal(hasLink(t), true, t);
    assert.match(format(t), /<a /, t);
  }
  for (const t of ["plain words", "hxxp://nope", "[x](javascript:alert(1))", "www.example.com"]) {
    assert.equal(hasLink(t), /<a /.test(format(t)), t);
  }
});

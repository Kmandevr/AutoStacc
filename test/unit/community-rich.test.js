// Rich posts (server/community/features/{embeds,cards,codeblocks}): players are rebuilt from the parsed link and only
// for the four services, code blocks keep their text exactly and read nothing inside as formatting, cards only mark
// links on AutoStacc's own address, and with a feature's rule left out its links stay plain links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "../../server/community/core/format.js";
import embeds from "../../server/community/features/embeds/index.js";
import cards from "../../server/community/features/cards/index.js";
import codeblocks from "../../server/community/features/codeblocks/index.js";
import { cardPath } from "../../server/community/features/cards/resolve.js";

const ext = (...fs) => ({ links: fs.flatMap((f) => f.format.links || []), blocks: fs.flatMap((f) => f.format.blocks || []) });
const all = ext(embeds, cards, codeblocks);
const none = { links: [], blocks: [] };

test("a share link from a known service becomes its player, rebuilt from the parsed link", () => {
  const html = format("Listen: https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", all);
  assert.match(html, /<iframe src="https:\/\/open\.spotify\.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC"/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"/);
  assert.match(format("https://youtu.be/dQw4w9WgXcQ", all), /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(format("https://soundcloud.com/artist/track", all), /w\.soundcloud\.com\/player/);
  assert.match(format("https://music.apple.com/us/album/some-album/1234567890", all), /embed\.music\.apple\.com/);
});

test("other sites, odd ports and look-alike hosts get no player, and a hostile label can't reach the frame", () => {
  for (const u of ["https://evil.example/watch?v=dQw4w9WgXcQ", "https://open.spotify.com.evil.example/track/4uLU6hMCjMI75M1A2tKUQC", "https://youtube.com:8443/watch?v=abc", "http://youtu.be/dQw4w9WgXcQ"]) {
    assert.doesNotMatch(format(u, all), /<iframe/, u);
  }
  const html = format('[x" onload="alert(1)](https://youtu.be/dQw4w9WgXcQ)', all);
  assert.doesNotMatch(html, /onload="/);
  assert.equal((html.match(/<iframe/g) || []).length, 1);
});

test("with the embeds rule left out, the same link stays a plain link", () => {
  const html = format("https://youtu.be/dQw4w9WgXcQ", ext(cards, codeblocks));
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /<a href="https:\/\/youtu\.be\/dQw4w9WgXcQ"/);
});

test("a code block keeps its text exactly and reads nothing inside it", () => {
  const body = "Try this:\n```json\n{ \"a\":   \"**not bold**\",\n  \"u\": \"https://x.example\" }\n  <script>alert(1)</script>\n```\nthanks";
  const html = format(body, all);
  assert.match(html, /<figure class="cm-code"><span class="cm-code-lang">json<\/span><pre><code>\{ &quot;a&quot;:   &quot;\*\*not bold\*\*&quot;,\n  &quot;u&quot;: &quot;https:\/\/x\.example&quot; \}\n  &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre><\/figure>/);
  assert.doesNotMatch(html, /<strong>|<script|<a href="https:\/\/x/);
  assert.match(html, /<p>Try this:<\/p>/);
  assert.match(html, /<p>thanks<\/p>/);
});

test("a fence that never closes, or a bad language word, stays ordinary text", () => {
  assert.doesNotMatch(format("```\nno end", all), /<figure/);
  assert.doesNotMatch(format('```"><img src=x>\ncode\n```', all), /<figure|<img/);
  assert.doesNotMatch(format("```js\ncode\n```", none), /<figure/);
});

test("cards mark only AutoStacc's own plain addresses; the plain link is kept", () => {
  assert.match(format("https://autostacc.com/community/t/thr_abc123-hello", ext(cards)), /<a href="\/community\/t\/thr_abc123-hello" data-cm-card="\/community\/t\/thr_abc123-hello">/);
  assert.match(format("[a project](https://autostacc.com/autostacc/glitches-and-stitches)", ext(cards)), /data-cm-card="\/autostacc\/glitches-and-stitches"/);
  for (const u of ["https://autostacc.com.evil.example/x", "https://evil.example/https://autostacc.com/x", "https://autostacc.com/?a=1", "https://autostacc.com/x#y", "https://autostacc.com/"]) {
    assert.doesNotMatch(format(u, ext(cards)), /data-cm-card/, u);
  }
  assert.doesNotMatch(format("https://autostacc.com/shop/abc", none), /data-cm-card/);
});

test("a card address is a short plain path or nothing", () => {
  assert.equal(cardPath("/shop/abc/"), "/shop/abc");
  for (const bad of [null, "shop/abc", "/a/../b", "//evil.example", "/x?y=1", "/" + "a".repeat(300), "/a b"]) assert.equal(cardPath(bad), null, String(bad));
});

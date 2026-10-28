// Word levels and the tag rule (server/lib/words.js, server/lib/tags.js, server/tags/tags.js; owner, 2026-10-27,
// #230): mild words pass everywhere, strong words are kept out of names and tags and softened in posts, slurs are
// refused everywhere; whole words only; tags are folded, capped and checked; suggestions tolerate typos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findWords, checkName, checkPost, soften, hasStrong } from "../../server/lib/words.js";
import { cleanTags, foldTag } from "../../server/lib/tags.js";
import { match } from "../../server/tags/tags.js";
import { format } from "../../server/community/core/format.js";
import { HttpError } from "../../server/lib/http.js";

const refused = (fn, code) => assert.throws(fn, (e) => e instanceof HttpError && e.code === code);

test("mild words pass in names, tags and posts", () => {
  for (const name of ["Living Hell", "Holy Shit Records", "Damn Fine Loops", "Sick Basslines", "Bloody Crap Mix", "Pissed Off"]) assert.equal(checkName(name), name);
  assert.deepEqual(cleanTags(["living-hell", "shit", "bad-ass"]), ["living-hell", "shit", "bad-ass"]);
  assert.equal(findWords("this track is the shit, hell yeah").length, 0);
});

test("strong words: refused in names and tags, allowed in posts", () => {
  refused(() => checkName("Fuck This Beat"), "word_not_allowed");
  refused(() => checkName("my bitch remix"), "word_not_allowed");
  refused(() => cleanTags(["fucking-loud"]), "word_not_allowed");
  assert.equal(checkPost("that drop is fucking huge"), "that drop is fucking huge");
  assert.ok(hasStrong("You absolute W4NKER"));
  assert.equal(soften("fucking"), "f******");
});

test("slurs are refused everywhere, look-alike digits included", () => {
  refused(() => checkPost("you f4ggot"), "filtered");
  refused(() => checkName("n1gger beats"), "word_not_allowed");
  refused(() => checkPost("RETARD"), "filtered");
});

test("whole words only: no Scunthorpe problem, reclaimed words pass", () => {
  for (const text of ["Scunthorpe", "class assassin", "Dickens and cocktails", "spicy shitake", "queer techno night", "coonhound"]) {
    assert.equal(findWords(text).length, 0, text);
  }
});

test("tags are folded, deduplicated and capped at 8", () => {
  assert.equal(foldTag("#Lo Fi"), "lo-fi");
  assert.equal(foldTag("Électro & Bass"), "electro-and-bass");
  assert.deepEqual(cleanTags(["Techno", "#techno", "TECHNO", "Lo Fi"]), ["techno", "lo-fi"]);
  refused(() => cleanTags(["a", "b", "c", "d", "e", "f", "g", "h", "i"]), "invalid_field");
  refused(() => cleanTags(["a", "b", "c", "d"], "tags", 3), "invalid_field");
});

test("suggestions: starts-with first, then contains, then close spellings; never merged", () => {
  const all = new Map([["techno", 40], ["tech-house", 12], ["acid-techno", 5], ["trap", 30], ["tap", 2]]);
  assert.deepEqual(match(all, "tec").map((x) => x.tag), ["techno", "tech-house", "acid-techno"]);
  assert.equal(match(all, "tecnho")[0].tag, "techno", "a typo still finds it");
  assert.deepEqual(match(all, "trap").map((x) => x.tag), ["trap", "tap"], "a close spelling is offered after the exact one");
  assert.deepEqual(cleanTags(["tap"]), ["tap"], "but a tag is saved as typed, never merged into a near one");
  assert.deepEqual(match(all, "ta").map((x) => x.tag), ["tap"], "two letters: no typo guessing");
});

test("posts: strong words softened with the word kept for the reader's setting; #tags link to search", () => {
  const html = format("that is **fucking** loud #Lo-Fi");
  assert.match(html, /<span class="cm-sw" data-w="fucking">f&#42;&#42;&#42;&#42;&#42;&#42;<\/span>/);
  assert.match(html, /<a class="cm-hashtag" href="\/search\?q=%23lo-fi">#Lo-Fi<\/a>/);
  assert.doesNotMatch(format("see https://example.com/#anchor and C#minor"), /cm-hashtag/);
});

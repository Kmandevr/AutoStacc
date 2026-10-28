// Word levels (owner, 2026-10-27, #230; docs/community.md "Word levels"): mild words pass everywhere; STRONG words are
// refused in titles, names and tags and softened in posts by the reader's setting; SLURS are refused everywhere. Whole
// words only ("class", "assassin", "Scunthorpe" never match), case and accents folded, and digits read as the letters
// they stand in for (n1gger, b!tch), the same way usernames are checked. Lists: server/lib/word-lists.js.
import { fail } from "./http.js";
import { STRONG, SLURS } from "./word-lists.js";

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i" };
// Lowercase, accents off, look-alike symbols read as letters. Keeps the text's length, so matches map back to it.
export const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plain = (s) => fold(s).replace(/[0134578@$!|]/g, (c) => LEET[c]);

const strongSet = new Set(STRONG);
const slurSet = new Set(SLURS);
// Words are runs of letters and digits (and the symbols above, read as letters); everything else separates them.
const WORD = /[\p{L}\p{N}@$!|]+/gu;

// The listed words in a text: [{ word (as written), level: "strong" | "slur", index }].
export function findWords(text) {
  const src = String(text || "");
  const out = [];
  for (const m of src.matchAll(WORD)) {
    // A trailing "!" or "|" is punctuation, not a letter ("fuck!" is "fuck").
    const raw = m[0].replace(/[!|]+$/, "");
    if (!raw) continue;
    const w = plain(raw);
    const level = slurSet.has(w) ? "slur" : strongSet.has(w) ? "strong" : null;
    if (level) out.push({ word: raw, level, index: m.index });
  }
  return out;
}

export const hasSlur = (text) => findWords(text).some((x) => x.level === "slur");
export const hasStrong = (text) => findWords(text).some((x) => x.level === "strong");

// A title, a name or a tag: no strong words and no slurs. Answers 400 naming the field.
export function checkName(text, field = "title", what = "Titles and names") {
  const hit = findWords(text)[0];
  if (!hit) return text;
  fail(400, "word_not_allowed", hit.level === "slur" ? "That uses a word AutoStacc doesn't allow anywhere." : `${what} can't contain strong swear words.`, { field });
}

// A post: slurs refused; strong words pass (readers see them by their own setting).
export function checkPost(text, field = "body") {
  if (hasSlur(text)) fail(403, "filtered", "That uses a word AutoStacc doesn't allow anywhere.", { field });
  return text;
}

// The softened form shown by default: the first letter, then a star for each other letter (f***).
export const soften = (word) => word.slice(0, 1) + "*".repeat(Math.max(1, [...word].length - 1));

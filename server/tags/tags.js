// Every tag on AutoStacc in one place (owner, 2026-10-27, #230; docs/discovery.md "Tags"): the counts each module
// exports for what people can see (products, releases and events, creators and projects, community spaces and takes),
// with AutoStacc's admins' rules applied (tag_rules: a hidden tag is left out, a renamed one counts under its new
// name). suggest() finds tags for what someone is typing, tolerating a typo or two (#tecnho finds #techno), most-used
// first. Nothing tagged is ever rewritten.
import { rules, ruled } from "./rules.js";
import { foldTag } from "../lib/tags.js";
import { productTagCounts } from "../catalog/products.js";
import { contentTagCounts } from "../content/content.js";
import { creatorTagCounts } from "../creators/creators.js";
import { communityTagCounts } from "../community/index.js";

export { rules, ruled };


// Map tag → how many things carry it, rules applied.
export async function counts(db) {
  const [map, ...lists] = await Promise.all([rules(db), productTagCounts(db), contentTagCounts(db), creatorTagCounts(db), communityTagCounts(db)]);
  const out = new Map();
  for (const { tag, n } of lists.flat()) {
    const t = typeof tag === "string" ? ruled(map, tag) : null;
    if (t) out.set(t, (out.get(t) || 0) + n);
  }
  return out;
}

// Edit distance where swapping two neighbouring letters is one edit (tecnho → techno), stopping early once past `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

// Tags matching what's typed: starts-with first, then contains, then close spellings; each group most-used first.
export function match(all, typed, limit = 8) {
  const q = foldTag(typed);
  if (!q) return [];
  const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  const scored = [];
  for (const [tag, n] of all) {
    const rank = tag.startsWith(q) ? 0 : tag.includes(q) ? 1 : max && distance(q, tag.slice(0, q.length + max), max) <= max ? 2 : max && distance(q, tag, max) <= max ? 2 : -1;
    if (rank >= 0) scored.push({ tag, n, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || b.n - a.n || a.tag.localeCompare(b.tag)).slice(0, limit).map(({ tag, n }) => ({ tag, count: n }));
}

export const suggest = async (db, typed, limit) => match(await counts(db), typed, limit);

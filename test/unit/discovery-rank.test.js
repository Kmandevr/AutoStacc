// The recommendation model (server/discovery/rank.js) on hand-made catalogs: scores stay in 0..1, stated preferences
// lead, missing details are neutral, a view isn't treated like a save, dismissed look-alikes sink, sections never repeat
// a product or let one creator crowd them, new products and creators get room, and "Bestselling" needs real sales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { affinity, similarity, context, score, rankAll, diversify, sections } from "../../server/discovery/rank.js";
import { WEIGHTS, POLICY } from "../../server/discovery/weights.js";

const AT = "2026-10-09T12:00:00.000Z";
const days = (n) => new Date(Date.parse(AT) - n * 86400000).toISOString();
let n = 0;
const P = (facets, extra = {}) => ({ id: `p${++n}`, title: `Product ${n}`, type: "sample-pack", project: "a", facets, eff: 1000, list: 1000,
  verified: true, sold: 0, wishes: 0, views: 0, released: days(300), text: "", ...extra });

test("every component and the total stay between 0 and 1, and the weights are a fixed, documented set", () => {
  const cands = [P({ genre: ["house"] }, { sold: 50, views: 900, released: days(1) }), P({}), P({ genre: ["techno"] }, { eff: 0, list: 0 })];
  const ctx = context(cands, { prefs: { genre: ["house"] }, anchors: [{ product: cands[2], weight: 1, kind: "wishlist" }], words: ["house"] }, { at: AT });
  for (const c of cands) {
    const s = score(c, ctx);
    assert.ok(s.total >= 0 && s.total <= 1, String(s.total));
    for (const [k, v] of Object.entries(s.parts)) assert.ok(v >= 0 && v <= 1, `${k} = ${v}`);
  }
  assert.deepEqual(Object.keys(WEIGHTS).sort(), ["behavior", "discovery", "freshness", "popularity", "preference", "price", "quality", "search"]);
});

test("a stated genre beats popularity; a product that doesn't state its genre is neutral, not last", () => {
  const house = P({ genre: ["house"] });
  const popularTechno = P({ genre: ["techno"] }, { sold: 500, wishes: 100, views: 5000 });
  const unstated = P({});
  const ranked = rankAll([popularTechno, unstated, house], context([popularTechno, unstated, house], { prefs: { genre: ["house"] } }, { at: AT }));
  assert.equal(ranked[0].c, house);
  const pref = (c) => ranked.find((x) => x.c === c).parts.preference;
  assert.ok(pref(unstated) > pref(popularTechno), "unknown is better than a known mismatch");
});

test("a view counts far less than a save: one glance doesn't reshape the store", () => {
  const seen = P({ genre: ["trap"] });
  const glanced = affinity({ anchors: [{ product: seen, weight: 0.15, kind: "view" }], prefs: { genre: ["house"] } });
  const saved = affinity({ anchors: [{ product: seen, weight: 1, kind: "wishlist" }], prefs: { genre: ["house"] } });
  assert.ok(glanced.genre.trap < saved.genre.trap);
  assert.equal(glanced.genre.house, 1, "the explicit choice stays on top");
});

test("look-alikes of a dismissed product sink; repeatedly shown and passed-over products rotate down", () => {
  const dismissed = P({ genre: ["trap"], contents: ["loops"] });
  const lookalike = P({ genre: ["trap"], contents: ["loops"] });
  const other = P({ genre: ["ambient"], contents: ["textures"] });
  const base = context([lookalike, other], {}, { at: AT });
  const after = context([lookalike, other], { dismissedProducts: [dismissed] }, { at: AT });
  assert.ok(score(lookalike, after).total < score(lookalike, base).total);
  const shown = context([other], { shown: { [other.id]: 3 } }, { at: AT });
  assert.ok(score(other, shown).total < score(other, base).total);
});

test("diversity: no more than two per creator, and each further one from the same creator is worth less", () => {
  const same = Array.from({ length: 6 }, () => P({ genre: ["house"] }, { project: "big" }));
  const others = [P({ genre: ["house"] }, { project: "x" }), P({ genre: ["house"] }, { project: "y" })];
  const ctx = context([...same, ...others], { prefs: { genre: ["house"] } }, { at: AT });
  const picks = diversify(rankAll([...same, ...others], ctx), 6);
  assert.ok(picks.filter((x) => x.c.project === "big").length <= POLICY.perCreator);
  assert.ok(picks.some((x) => x.c.project === "x") && picks.some((x) => x.c.project === "y"));
});

test("sections: no product twice, no 'for you' for a newcomer, new products get a place, bestselling needs real sales", () => {
  const fresh = P({ genre: ["ambient"] }, { project: "newbie", released: days(2), verified: false });
  const popular = Array.from({ length: 4 }, (_, i) => P({ genre: ["house"] }, { project: `p${i}`, sold: i === 0 ? 2 : 10 + i }));
  const free = [P({ genre: ["pop"] }, { eff: 0, list: 0, project: "f1" }), P({ genre: ["pop"] }, { eff: 0, list: 0, project: "f2" })];
  const cands = [fresh, ...popular, ...free];
  const cold = sections(cands, {}, { at: AT });
  assert.equal(cold.personal, false);
  assert.ok(!cold.sections.some((s) => s.id === "for-you"));
  const all = cold.sections.flatMap((s) => s.items.map((x) => x.c.id));
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.includes(fresh.id), "an unverified creator's new product isn't buried");
  const best = cold.sections.find((s) => s.id === "bestselling");
  assert.ok(best.items.every((x) => x.c.sold >= POLICY.bestsellerMin), "2 sales is not enough to be called a bestseller");
  const warm = sections(cands, { prefs: { genre: ["pop"] } }, { at: AT });
  assert.equal(warm.sections[0].id, "for-you");
  assert.equal(warm.sections[0].items[0].c.facets.genre[0], "pop");
});

test("similarity: same kind and shared details count; nothing in common is near zero", () => {
  const a = P({ genre: ["house"], contents: ["loops"], format: ["wav"] });
  const b = P({ genre: ["house"], contents: ["loops"], format: ["wav"] });
  const c = P({ genre: ["metal"] }, { type: "visuals", project: "z" });
  assert.ok(similarity(a, b) > 0.8);
  assert.ok(similarity(a, c) < 0.1);
});

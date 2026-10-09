// The recommendation model: scores eligible products for one person and builds the store's sections. Pure (no I/O),
// so it is tested directly (test/unit/discovery-rank.test.js). Eligibility (visible, purchasable, within stated limits,
// not owned or dismissed) is decided before this, in SQL (server/discovery/recommend.js); this only orders what is left
// and keeps the result varied. Every component is 0..1; weights and policy are server/discovery/weights.js.
import { WEIGHTS, EVIDENCE, TASTE_FACETS, POLICY } from "./weights.js";
import { label } from "./vocabulary.js";

const DAY = 86400000;
const clamp = (x) => Math.max(0, Math.min(1, x));

// Small stable hash in 0..1 (FNV-1a): today's exploration order for a product, different per device seed.
function jitter(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const valuesOf = (p, facet) => (facet === "category" ? [p.type] : (p.facets && p.facets[facet]) || []);

// Taste: { facet: { value: 0..1 } } from explicit choices (full weight), filters used and products engaged with.
export function affinity(profile) {
  const raw = {};
  const bump = (facet, value, by) => { (raw[facet] ||= {})[value] = (raw[facet][value] || 0) + by; };
  for (const [facet, values] of Object.entries(profile.prefs || {})) for (const v of values) bump(facet, v, EVIDENCE.preference * 2);
  for (const [facet, counts] of Object.entries(profile.filters || {})) {
    for (const [v, n] of Object.entries(counts)) bump(facet, v, EVIDENCE.filter * Math.min(n, 3));
  }
  for (const a of profile.anchors || []) {
    for (const facet of Object.keys(TASTE_FACETS)) for (const v of valuesOf(a.product, facet)) bump(facet, v, a.weight);
  }
  const out = {};
  for (const [facet, map] of Object.entries(raw)) {
    const top = Math.max(...Object.values(map), 0);
    if (top <= 0) continue;
    out[facet] = Object.fromEntries(Object.entries(map).map(([v, x]) => [v, clamp(x / top)]));
  }
  return out;
}

// How alike two products are, 0..1: shared facet values (Jaccard), same kind, same maker.
export function similarity(a, b) {
  const set = (p) => new Set(Object.entries(p.facets || {}).flatMap(([f, vs]) => vs.map((v) => `${f}:${v}`)));
  const sa = set(a), sb = set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return clamp(0.6 * (union ? inter / union : 0) + (a.type === b.type ? 0.3 : 0) + (a.project && a.project === b.project ? 0.1 : 0));
}

// Everything that depends on the whole candidate set or the profile, worked out once per request.
export function context(cands, profile, { at = new Date().toISOString(), weights = WEIGHTS } = {}) {
  const taste = affinity(profile);
  const anchors = (profile.anchors || []).filter((a) => a.weight > 0);
  const prices = anchors.map((a) => a.product.eff).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  const pop = (c) => Math.log1p(3 * (c.sold || 0) + 2 * (c.wishes || 0) + 0.1 * (c.views || 0));
  const popTop = Math.max(...cands.map(pop), 0);
  const usual = new Set([...Object.keys(taste.category || {}), ...Object.keys(taste.genre || {})]);
  return { taste, anchors, priceMid: prices.length ? prices[Math.floor(prices.length / 2)] : null, pop, popTop, usual, at: Date.parse(at),
    words: (profile.words || []).slice(0, 8), dismissedLike: (profile.dismissedProducts || []), shown: profile.shown || {}, seed: profile.seed || "",
    day: at.slice(0, 10), weights, personal: Boolean(Object.keys(taste).length || anchors.length || (profile.words || []).length) };
}

// One product's components (each 0..1), weighted score and the main reason it fits.
export function score(c, ctx) {
  const parts = {};
  // Preference: for each taste facet the person has, the best match among the product's values (neutral if unstated).
  let pw = 0, ps = 0, best = null;
  for (const [facet, fw] of Object.entries(TASTE_FACETS)) {
    const t = ctx.taste[facet];
    if (!t) continue;
    const vals = valuesOf(c, facet);
    let m = vals.length ? 0 : POLICY.neutral;
    for (const v of vals) if ((t[v] || 0) > m) { m = t[v]; if (!best || m * fw > best.s) best = { s: m * fw, facet, v, m }; }
    pw += fw; ps += fw * m;
  }
  parts.preference = pw ? ps / pw : 0;
  // Search: share of the words found, a title hit counting double.
  if (ctx.words.length) {
    const title = (c.title || "").toLowerCase(), text = (c.text || "").toLowerCase();
    parts.search = ctx.words.reduce((s, w) => s + (title.includes(w) ? 1 : text.includes(w) ? 0.5 : 0), 0) / ctx.words.length;
  } else parts.search = 0;
  // Behavior: the closest engaged product, by how much the engagement says.
  let near = null;
  for (const a of ctx.anchors) {
    if (a.product.id === c.id) continue;
    const s = similarity(c, a.product) * Math.min(1, a.weight);
    if (!near || s > near.s) near = { s, a };
  }
  parts.behavior = near ? near.s : 0;
  // Dismissed products pull their look-alikes down.
  const unlike = Math.max(0, ...ctx.dismissedLike.map((d) => similarity(c, d)));
  // Price: closeness on a log scale to the middle of the prices explored; free products fit anyone's budget.
  parts.price = ctx.priceMid === null ? 0 : c.eff === 0 ? 0.8 : clamp(1 - Math.abs(Math.log1p(c.eff) - Math.log1p(ctx.priceMid)) / 2);
  parts.quality = c.verified ? 1 : 0.5;
  parts.popularity = ctx.popTop ? ctx.pop(c) / ctx.popTop : 0;
  const age = (ctx.at - Date.parse(c.released || 0)) / DAY;
  parts.freshness = age >= 0 && age < POLICY.freshDays ? 1 - age / POLICY.freshDays : 0;
  // Discovery: outside the usual kinds and genres, or seldom seen yet, plus a little of today's rotation.
  const outside = ctx.usual.size && !valuesOf(c, "category").some((v) => ctx.usual.has(v)) && !valuesOf(c, "genre").some((v) => ctx.usual.has(v));
  parts.discovery = clamp((outside ? 0.5 : 0) + ((c.views || 0) < 20 ? 0.3 : 0) + 0.2 * jitter(ctx.day, ctx.seed, c.id));
  const w = ctx.weights;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  let total = Object.entries(w).reduce((s, [k, x]) => s + x * (parts[k] || 0), 0) / sum;
  total *= 1 - Math.min(POLICY.repeatPenaltyMax, POLICY.repeatPenalty * (ctx.shown[c.id] || 0));
  total *= 1 - 0.5 * unlike;
  // Something already engaged with is known to the person: it may still appear, but new things come first.
  if (ctx.anchors.some((a) => a.product.id === c.id)) total *= POLICY.seenFactor;
  const why = near && near.s >= 0.35 ? `Similar to ${near.a.product.title}`
    : best && best.m >= 0.5 ? `Matches ${best.facet === "category" ? "what you browse" : label(best.facet, best.v)}`
    : outside ? "Something different" : parts.popularity > 0.6 ? "Popular right now" : "";
  return { c, total, parts, why, outside: Boolean(outside) };
}

export const rankAll = (cands, ctx) => cands.map((c) => score(c, ctx)).sort((a, b) => b.total - a.total || (a.c.id < b.c.id ? -1 : 1));

// Picks n from a ranked list, skipping `taken` and keeping creators and genres varied: each further product from the
// same creator or primary genre is worth less, and no creator has more than POLICY.perCreator.
export function diversify(ranked, n, taken = new Set(), key = (x) => x.total) {
  const pool = ranked.filter((x) => !taken.has(x.c.id));
  const picks = [], byCreator = {}, byGenre = {};
  while (picks.length < n && pool.length) {
    let bi = -1, bv = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const x = pool[i];
      const cr = x.c.project || x.c.id, g = valuesOf(x.c, "genre")[0] || "";
      if ((byCreator[cr] || 0) >= POLICY.perCreator) continue;
      const v = key(x) * POLICY.creatorDecay ** (byCreator[cr] || 0) * POLICY.genreDecay ** (g ? byGenre[g] || 0 : 0);
      if (v > bv) { bv = v; bi = i; }
    }
    if (bi < 0) break;
    const [x] = pool.splice(bi, 1);
    picks.push(x);
    byCreator[x.c.project || x.c.id] = (byCreator[x.c.project || x.c.id] || 0) + 1;
    const g = valuesOf(x.c, "genre")[0];
    if (g) byGenre[g] = (byGenre[g] || 0) + 1;
  }
  return picks;
}

// The store's sections, in order, each product at most once across all of them. A section that would show fewer than
// POLICY.minSection products is left out rather than padded.
export function sections(cands, profile, opts = {}) {
  const ctx = context(cands, profile, opts);
  const ranked = rankAll(cands, ctx);
  const taken = new Set();
  const size = opts.size || POLICY.sectionSize;
  const out = [];
  const add = (id, title, list, reason) => {
    const picks = diversify(list, size, taken, opts.key);
    if (picks.length < POLICY.minSection) return;
    picks.forEach((x) => taken.add(x.c.id));
    out.push({ id, title, reason, items: picks });
  };
  const genres = Object.entries(ctx.taste.genre || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  if (ctx.personal) add("for-you", "Recommended for you", ranked, "From what you chose and engaged with here");
  if (genres.length) {
    add("your-genres", `Popular in ${genres.map((g) => label("genre", g)).join(" & ")}`,
      ranked.filter((x) => genres.some((g) => valuesOf(x.c, "genre").includes(g))).sort((a, b) => b.parts.popularity - a.parts.popularity || b.total - a.total),
      "Your genres, by what people buy and save");
  }
  if (ctx.anchors.some((a) => a.kind === "wishlist" || a.kind === "owned" || a.kind === "cart")) {
    add("similar", "Similar to your favorites", [...ranked].filter((x) => x.parts.behavior >= 0.3).sort((a, b) => b.parts.behavior - a.parts.behavior),
      "Close to what you saved, carted or own");
  }
  add("bestselling", "Bestselling", ranked.filter((x) => (x.c.sold || 0) >= POLICY.bestsellerMin).sort((a, b) => b.c.sold - a.c.sold || b.total - a.total),
    "Most bought in the last 90 days (confirmed purchases)");
  add("deals", ctx.personal ? "Deals matching your interests" : "On sale now", ranked.filter((x) => x.c.eff < x.c.list), "Running sales only");
  add("recent", "Recently added", ranked.filter((x) => x.parts.freshness > 0).sort((a, b) => Date.parse(b.c.released) - Date.parse(a.c.released)),
    `New in the last ${POLICY.freshDays} days`);
  add("free", "Free and worth trying", ranked.filter((x) => x.c.eff === 0 && x.c.list === 0), "Free to claim with an account");
  add("different", "Discover something different",
    [...ranked].sort((a, b) => (b.parts.discovery + b.parts.quality * 0.2) - (a.parts.discovery + a.parts.quality * 0.2)),
    ctx.personal ? "Outside what you usually look at" : "A varied mix to start from");
  return { sections: out, personal: ctx.personal, ctx };
}

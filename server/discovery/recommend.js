// Recommendations for one request: checks the profile the browser sends (its own on-device history, never stored
// here), adds what the account itself holds (confirmed purchases, and the wishlist while personalizing is on), decides
// eligibility in SQL (hard limits first), then ranks and builds sections with server/discovery/rank.js.
import { fail } from "../lib/http.js";
import { resolveAccess } from "../entitlements/access.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { sellersOf } from "../catalog/products.js";
import { listWishlist } from "../wishlist/wishlist.js";
import { FACETS, canonical } from "./vocabulary.js";
import { parseFilters } from "./filters.js";
import { candidates, visibleByIds } from "./search.js";
import { facetsOf } from "./facets.js";
import { productSignals } from "./signals.js";
import { EVIDENCE, TASTE_FACETS, POLICY } from "./weights.js";
import { sections, rankAll, context, diversify } from "./rank.js";
import { storeProduct } from "./present.js";

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const KINDS_OF_EVENT = ["view", "click", "preview", "cart", "wishlist"];
const ids = (raw, name, max) => {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > max || raw.some((x) => typeof x !== "string" || !ID.test(x))) fail(400, "invalid_field", `${name} is a list of up to ${max} product ids.`, { field: name });
  return [...new Set(raw)];
};

// The profile as the browser sends it, checked and reduced to what the model uses. Anything unknown is dropped.
export function cleanProfile(body, kinds) {
  const b = body && typeof body === "object" ? body : {};
  const personalize = b.personalize !== false;
  const prefs = {};
  for (const [facet, values] of Object.entries(b.prefs || {})) {
    if (!(facet in TASTE_FACETS) || !Array.isArray(values)) continue;
    const ok = values.slice(0, 12).map((x) => (facet === "category" ? (kinds.includes(x) ? x : null) : canonical(facet, String(x)))).filter(Boolean);
    if (ok.length) prefs[facet] = [...new Set(ok)];
  }
  const events = Array.isArray(b.interactions) ? b.interactions.slice(0, 60) : [];
  const interactions = new Map();
  for (const e of events) {
    if (!e || !ID.test(String(e.id)) || !KINDS_OF_EVENT.includes(e.kind)) continue;
    const n = Math.max(1, Math.min(5, Number(e.n) || 1));
    // Repeats count less each time: three views aren't three times the interest.
    const w = EVIDENCE[e.kind] * (1 + Math.log2(n)) / 2 + EVIDENCE[e.kind] / 2;
    const prev = interactions.get(e.id) || { weight: 0, kind: e.kind };
    interactions.set(e.id, { weight: Math.min(1, prev.weight + w), kind: EVIDENCE[e.kind] > EVIDENCE[prev.kind] ? e.kind : prev.kind });
  }
  const filters = {};
  for (const [facet, counts] of Object.entries(b.filters || {}).slice(0, 12)) {
    if (!FACETS[facet] || !counts || typeof counts !== "object") continue;
    for (const [v, n] of Object.entries(counts).slice(0, 12)) {
      const c = canonical(facet, v);
      if (c && Number(n) > 0) (filters[facet] ||= {})[c] = Math.min(10, Number(n));
    }
  }
  const words = (Array.isArray(b.searches) ? b.searches : []).slice(0, 5).filter((s) => typeof s === "string")
    .flatMap((s) => s.toLowerCase().slice(0, 100).split(/\s+/)).filter((w) => w.length > 1).slice(0, 8);
  const shown = {};
  for (const [k, n] of Object.entries(b.shown || {}).slice(0, 200)) if (ID.test(k) && Number(n) > 0) shown[k] = Math.min(10, Number(n));
  const seed = typeof b.seed === "string" ? b.seed.slice(0, 32) : "";
  const constraints = typeof b.constraints === "string" ? b.constraints.slice(0, 500) : "";
  return {
    personalize, seed, constraints,
    dismissed: ids(b.dismissed, "dismissed", 200),
    cart: ids(b.cart, "cart", 50),
    ...(personalize ? { prefs, interactions, filters, words, shown } : { prefs: {}, interactions: new Map(), filters: {}, words: [], shown: {} })
  };
}

// Candidate rows to the shape rank.js scores.
const toCandidate = (r, facets, signals) => {
  const s = signals.get(r.id) || {};
  return { id: r.id, title: r.title, type: r.type, project: r.project_id, facets: facets[r.id] || {}, eff: r.eff, list: r.price_cents,
    verified: r.source !== "studio" || Boolean(r.trusted), sold: r.sold, wishes: s.wishes || 0, views: s.views || 0,
    released: r.released, text: r.search_text, row: r };
};

export async function recommend(app, body, { sales, kinds, at = new Date().toISOString(), only = null } = {}) {
  const started = Date.now();
  const profile = cleanProfile(body, kinds);
  const access = await resolveAccess(app);
  const user = access.user;
  const [owned, wished] = await Promise.all([
    ownedProductIds(app.db, access),
    user && profile.personalize ? listWishlist(app.db, user.id) : []
  ]);
  // Hard limits the person set (price ceiling, compatibility, kind) use the search's own filter rules.
  const f = parseFilters(new URLSearchParams(profile.constraints), kinds);
  const exclude = [...new Set([...owned, ...profile.dismissed, ...profile.cart])];
  const anchorIds = [...new Set([...profile.interactions.keys(), ...wished.map((w) => w.product_id), ...owned, ...profile.dismissed])];
  const [rows, anchorRows, signals] = await Promise.all([
    candidates(app.db, f, { sales, at, exclude, limit: POLICY.candidates }),
    visibleByIds(app.db, anchorIds.slice(0, 300), { sales, at }),
    productSignals(app.db, at)
  ]);
  const facets = await facetsOf(app.db, [...new Set([...rows, ...anchorRows].map((r) => r.id))]);
  const sellerRows = await sellersOf(app.db, [...rows, ...anchorRows]);
  const trusted = (r) => ({ ...r, trusted: (sellerRows.get(r.id) || {}).trusted });
  const cands = rows.map((r) => toCandidate(trusted(r), facets, signals));
  const anchorsById = new Map(anchorRows.map((r) => [r.id, toCandidate(trusted(r), facets, signals)]));
  const anchors = [];
  for (const [pid, it] of profile.interactions) if (anchorsById.has(pid)) anchors.push({ product: anchorsById.get(pid), weight: it.weight, kind: it.kind });
  for (const w of wished) if (anchorsById.has(w.product_id)) anchors.push({ product: anchorsById.get(w.product_id), weight: EVIDENCE.wishlist, kind: "wishlist" });
  if (profile.personalize) for (const o of owned) if (anchorsById.has(o)) anchors.push({ product: anchorsById.get(o), weight: EVIDENCE.owned, kind: "owned" });
  const model = { prefs: profile.prefs, filters: profile.filters, anchors, words: profile.words, shown: profile.shown, seed: profile.seed,
    dismissedProducts: profile.dismissed.map((d) => anchorsById.get(d)).filter(Boolean) };
  const shape = (x) => ({ ...storeProduct(x.c.row, { sales, seller: sellerRows.get(x.c.id), facets: facets[x.c.id], at }), why: x.why });
  if (only === "list") {
    const ctx = context(cands, model, { at });
    return { products: diversify(rankAll(cands, ctx), Number(body.limit) > 0 ? Math.min(24, Number(body.limit)) : 12).map(shape), personal: ctx.personal, ms: Date.now() - started };
  }
  const built = sections(cands, model, { at });
  return {
    personal: built.personal,
    sections: built.sections.map((s) => ({ id: s.id, title: s.title, reason: s.reason, products: s.items.map(shape) })),
    ms: Date.now() - started
  };
}

// Products like one product (its page's "You might also like"): the same model with that product as the only anchor,
// no personal data, so the answer can be cached for everyone.
export async function similarTo(app, productId, { sales, kinds, at = new Date().toISOString(), limit = 8 }) {
  const [anchorRow] = await visibleByIds(app.db, [productId], { sales, at });
  if (!anchorRow) fail(404, "not_found", "No product with that id.");
  const rows = await candidates(app.db, parseFilters(new URLSearchParams(), kinds), { sales, at, exclude: [productId], limit: POLICY.candidates });
  const facets = await facetsOf(app.db, [productId, ...rows.map((r) => r.id)]);
  const signals = await productSignals(app.db, at);
  const sellerRows = await sellersOf(app.db, [anchorRow, ...rows]);
  const trusted = (r) => ({ ...r, trusted: (sellerRows.get(r.id) || {}).trusted });
  const anchor = toCandidate(trusted(anchorRow), facets, signals);
  const ctx = context(rows.map((r) => toCandidate(trusted(r), facets, signals)), { anchors: [{ product: anchor, weight: 1, kind: "view" }] }, { at });
  const ranked = rankAll(rows.map((r) => toCandidate(trusted(r), facets, signals)), ctx).filter((x) => x.parts.behavior > 0.2);
  return diversify(ranked, limit, new Set(), (x) => x.parts.behavior + 0.1 * x.parts.popularity)
    .map((x) => ({ ...storeProduct(x.c.row, { sales, seller: sellerRows.get(x.c.id), facets: facets[x.c.id], at }), why: x.why }));
}

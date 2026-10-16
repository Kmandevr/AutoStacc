// Store search in SQL: filters (OR within a group, AND between groups), facet counts, price and BPM ranges, sorting and
// paging, all in D1, so the browser never loads the catalog. Every statement reads the visible products through one CTE
// that also works out the price right now (running sales applied exactly as server/promotions salePrice does), so price
// filters, "on sale" and price sorting agree with what checkout charges. Lists go in as one JSON parameter each
// (json_each), keeping statements far under D1's bound-parameter limit.
import { all } from "../lib/db.js";
import { MIN_CHARGE_CENTS } from "../promotions/promotions.js";
import { FACETS, schemaOf, label } from "./vocabulary.js";
import { NEW_DAYS } from "./filters.js";
import { RATINGS_SQL } from "../reviews/reviews.js";
import { RATING } from "./weights.js";

const PURCHASE_DAYS = 90;
const iso = (at, days) => new Date(Date.parse(at) - days * 86400000).toISOString();

// The price now, per running sale (server/promotions/promotions.js salePrice): the lowest applicable sale price, never
// below the minimum charge, for paid products in the sale's currency.
function effective(sales) {
  const params = [];
  const parts = sales.map((s) => {
    // Parameters in the order their "?" appear: scope list, currency, amount off.
    let scope = "1";
    if (s.scope !== "all") { scope = `${s.scope === "products" ? "p.id" : "p.project_id"} IN (SELECT value FROM json_each(?))`; params.push(s.scope_ids || "[]"); }
    params.push(s.currency, s.percent_off || s.amount_off_cents);
    const off = s.percent_off ? "(p.price_cents * ? / 100)" : "?";
    return `CASE WHEN p.price_cents > 0 AND ${scope} AND p.currency = ? THEN MAX(p.price_cents - ${off}, MIN(p.price_cents, ${MIN_CHARGE_CENTS})) ELSE p.price_cents END`;
  });
  return { sql: parts.length ? `MIN(p.price_cents, ${parts.join(", ")})` : "p.price_cents", params };
}

// WITH e: visible products with eff (price now), sold (confirmed purchases, 90 days), released (date for "new"), and
// buyers' reviews: how many are shown, their average and its confidence-adjusted score (weights.js RATING).
function base(sales, at, derived = true) {
  const eff = effective(sales);
  return {
    sql: `WITH sold AS (SELECT product_id, COUNT(*) AS n FROM entitlements WHERE source_type = 'purchase' AND status = 'active' AND granted_at >= ? GROUP BY product_id),
      rv AS (${RATINGS_SQL}),
      e AS (SELECT p.*, ${eff.sql} AS eff, COALESCE(sold.n, 0) AS sold, COALESCE(p.released_at, p.created_at) AS released,
        COALESCE(rv.n, 0) AS reviews, rv.avg AS rating, (${RATING.prior * RATING.weight} + COALESCE(rv.n, 0) * COALESCE(rv.avg, 0)) / (${RATING.weight} + COALESCE(rv.n, 0)) AS rating_score,
        CASE WHEN p.bpm_min IS NOT NULL OR ${derived ? 0 : 1} THEN p.bpm_min ELSE pc.bpm_min END AS bpm_lo,
        CASE WHEN p.bpm_min IS NOT NULL OR ${derived ? 0 : 1} THEN p.bpm_max ELSE pc.bpm_max END AS bpm_hi
        FROM products p LEFT JOIN sold ON sold.product_id = p.id LEFT JOIN rv ON rv.product_id = p.id LEFT JOIN product_contents pc ON pc.product_id = p.id
        WHERE p.published = 1 AND p.deleted_at IS NULL)`,
    params: [iso(at, PURCHASE_DAYS), at, ...eff.params]
  };
}

// The WHERE for the filter object, leaving out one group (`skip`) for that group's own counts.
function where(f, at, skip = "") {
  const c = [], params = [];
  const add = (sql, ...p) => { c.push(sql); params.push(...p); };
  for (const w of f.words) add("e.search_text LIKE ? ESCAPE '\\'", `%${w.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
  if (f.categories.length && skip !== "category") add("e.type IN (SELECT value FROM json_each(?))", JSON.stringify(f.categories));
  if (f.creators.length && skip !== "creator") add("e.project_id IN (SELECT value FROM json_each(?))", JSON.stringify(f.creators));
  for (const [facet, values] of Object.entries(f.facets)) {
    if (skip === facet) continue;
    add("e.id IN (SELECT product_id FROM product_facets WHERE facet = ? AND value IN (SELECT value FROM json_each(?)))", facet, JSON.stringify(values));
  }
  if (skip !== "price") {
    if (f.priceMin !== null) add("e.eff >= ?", f.priceMin);
    if (f.priceMax !== null) add("e.eff <= ?", f.priceMax);
  }
  if (skip !== "free" && f.free !== null) add(f.free ? "e.price_cents = 0" : "e.price_cents > 0");
  if (skip !== "sale" && f.sale) add("e.eff < e.price_cents");
  if (skip !== "new" && f.recent) add("e.released >= ?", iso(at, NEW_DAYS));
  if (skip !== "rating" && f.ratingMin != null) add("e.rating >= ?", f.ratingMin);
  if (skip !== "bpm") {
    // The creator's tempo range, else the one the files' published details give (contents.js).
    if (f.bpmMin !== null) add("e.bpm_hi >= ?", f.bpmMin);
    if (f.bpmMax !== null) add("e.bpm_lo <= ?", f.bpmMax);
  }
  return { sql: c.length ? c.join(" AND ") : "1", params };
}

// Relevance to the words: a title hit counts most, then any other match (search_text holds tags, facet labels, maker).
function relevance(words) {
  if (!words.length) return { sql: "0", params: [] };
  const like = (w) => `%${w.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  return {
    sql: words.map(() => "(CASE WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 3 ELSE 1 END)").join(" + "),
    params: words.map(like)
  };
}

const ORDER = {
  relevance: "rel DESC, e.featured DESC, e.sold DESC, e.released DESC",
  bestselling: "e.sold DESC, e.released DESC",
  rating: "e.rating_score DESC, e.reviews DESC, e.sold DESC",
  newest: "e.released DESC",
  "price-asc": "e.eff ASC",
  "price-desc": "e.eff DESC",
  discount: "(e.price_cents - e.eff) * 1.0 / MAX(e.price_cents, 1) DESC, e.eff ASC",
  name: "e.title COLLATE NOCASE ASC"
};

// Runs the search: one batch of statements (page, total, every facet group's counts, ranges, toggles).
// derived: the store.derivedFacets switch (off, the files' tempo range isn't used either).
export async function search(db, f, { sales = [], kinds = [], at = new Date().toISOString(), derived = true } = {}) {
  const b = base(sales, at, derived);
  const w = where(f, at);
  const rel = relevance(f.words);
  const statement = (sql, ...params) => db.prepare(sql).bind(...params);
  const stmts = [
    statement(`${b.sql} SELECT e.*, ${rel.sql} AS rel FROM e WHERE ${w.sql} ORDER BY ${ORDER[f.sort]}, e.id LIMIT ? OFFSET ?`,
      ...b.params, ...rel.params, ...w.params, f.per, (f.page - 1) * f.per),
    statement(`${b.sql} SELECT COUNT(*) AS n FROM e WHERE ${w.sql}`, ...b.params, ...w.params)
  ];
  // Facet groups that apply to the chosen kinds (all kinds when none is chosen); selected groups count without themselves.
  // Derived facets (worked out from files, contents.js) apply to every kind: they show wherever a product has values.
  const shown = Object.keys(FACETS).filter((facet) => FACETS[facet].derived || (f.categories.length ? f.categories : kinds).some((k) => schemaOf(k).facets.includes(facet)));
  const groups = [];
  const unselected = shown.filter((facet) => !f.facets[facet]);
  if (unselected.length) {
    groups.push(unselected);
    stmts.push(statement(`${b.sql} SELECT pf.facet, pf.value, COUNT(*) AS n FROM product_facets pf JOIN e ON e.id = pf.product_id
      WHERE pf.facet IN (SELECT value FROM json_each(?)) AND ${w.sql} GROUP BY pf.facet, pf.value`, ...b.params, JSON.stringify(unselected), ...w.params));
  }
  for (const facet of shown.filter((x) => f.facets[x])) {
    const wf = where(f, at, facet);
    groups.push([facet]);
    stmts.push(statement(`${b.sql} SELECT pf.facet, pf.value, COUNT(*) AS n FROM product_facets pf JOIN e ON e.id = pf.product_id
      WHERE pf.facet = ? AND ${wf.sql} GROUP BY pf.facet, pf.value`, ...b.params, facet, ...wf.params));
  }
  const wc = where(f, at, "category"), wp = where(f, at, "creator"), wr = where(f, at, "price"), wb = where(f, at, "bpm");
  const wt = (k) => where(f, at, k);
  stmts.push(
    statement(`${b.sql} SELECT e.type AS value, COUNT(*) AS n FROM e WHERE ${wc.sql} GROUP BY e.type`, ...b.params, ...wc.params),
    statement(`${b.sql} SELECT e.project_id AS value, j.name AS name, COUNT(*) AS n FROM e LEFT JOIN projects j ON j.id = e.project_id
      WHERE ${wp.sql} AND e.project_id IS NOT NULL GROUP BY e.project_id ORDER BY n DESC, j.name LIMIT 30`, ...b.params, ...wp.params),
    statement(`${b.sql} SELECT MIN(e.eff) AS lo, MAX(e.eff) AS hi FROM e WHERE ${wr.sql}`, ...b.params, ...wr.params),
    statement(`${b.sql} SELECT MIN(e.bpm_lo) AS lo, MAX(e.bpm_hi) AS hi FROM e WHERE ${wb.sql}`, ...b.params, ...wb.params),
    statement(`${b.sql} SELECT SUM(e.price_cents = 0) AS n FROM e WHERE ${wt("free").sql}`, ...b.params, ...wt("free").params),
    statement(`${b.sql} SELECT SUM(e.eff < e.price_cents) AS n FROM e WHERE ${wt("sale").sql}`, ...b.params, ...wt("sale").params),
    statement(`${b.sql} SELECT SUM(e.released >= ?) AS n FROM e WHERE ${wt("new").sql}`, ...b.params, iso(at, NEW_DAYS), ...wt("new").params),
    statement(`${b.sql} SELECT SUM(e.rating >= 4) AS n FROM e WHERE ${wt("rating").sql}`, ...b.params, ...wt("rating").params)
  );
  const res = await db.batch(stmts);
  const rows = (i) => res[i].results || [];
  const [page, total] = [rows(0), rows(1)[0].n];
  let i = 2;
  const facetCounts = {};
  for (const g of groups) {
    for (const facet of g) facetCounts[facet] = {};
    for (const r of rows(i++)) facetCounts[r.facet][r.value] = r.n;
  }
  const [cats, makers, price, bpm, free, sale, fresh, rated] = [rows(i), rows(i + 1), rows(i + 2)[0], rows(i + 3)[0], rows(i + 4)[0], rows(i + 5)[0], rows(i + 6)[0], rows(i + 7)[0]];
  return {
    rows: page,
    total,
    facets: shown.map((facet) => ({
      id: facet, label: FACETS[facet].label, multi: FACETS[facet].multi,
      values: Object.keys(FACETS[facet].values)
        .map((value) => ({ value, label: label(facet, value), count: facetCounts[facet][value] || 0, selected: (f.facets[facet] || []).includes(value) }))
        .filter((x) => x.count || x.selected)
    })).filter((g) => g.values.length),
    categories: cats.map((r) => ({ value: r.value, count: r.n, selected: f.categories.includes(r.value) })),
    creators: makers.map((r) => ({ value: r.value, label: r.name || r.value, count: r.n, selected: f.creators.includes(r.value) })),
    ranges: { price: { min: price.lo, max: price.hi }, bpm: { min: bpm.lo, max: bpm.hi } },
    toggles: { free: free.n || 0, sale: sale.n || 0, new: fresh.n || 0, rated: rated.n || 0 }
  };
}

// For autocomplete: titles that match, plus the makers (projects) whose names match. Visible products only.
export async function suggestTitles(db, word, limit = 6) {
  const like = `%${word.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const [titles, makers] = await Promise.all([
    all(db, `SELECT id, title, type, source FROM products WHERE published = 1 AND deleted_at IS NULL AND lower(title) LIKE ? ESCAPE '\\'
      ORDER BY featured DESC, title LIMIT ?`, like, limit),
    all(db, `SELECT j.id, j.name, COUNT(p.id) AS n FROM projects j JOIN products p ON p.project_id = j.id AND p.published = 1 AND p.deleted_at IS NULL
      WHERE lower(j.name) LIKE ? ESCAPE '\\' GROUP BY j.id ORDER BY n DESC LIMIT 3`, like)
  ]);
  return { titles, makers };
}

// Facet values that occur on at least one visible product, with how many (for autocomplete's tag suggestions).
export const facetValueCounts = (db) => all(db, `SELECT pf.facet, pf.value, COUNT(*) AS n FROM product_facets pf JOIN products p ON p.id = pf.product_id
  WHERE p.published = 1 AND p.deleted_at IS NULL GROUP BY pf.facet, pf.value`);

// Products a recommendation may show: everything the filter allows (hard limits like a price ceiling or a required
// DAW), on sale or free right now, minus `exclude` (owned, dismissed, in the cart). Most-sold, newest and a random
// slice, so new products get a fair chance even in a large catalog. Up to `limit`, no duplicates.
export async function candidates(db, f, { sales = [], at = new Date().toISOString(), exclude = [], limit = 400 } = {}) {
  const b = base(sales, at), w = where(f, at);
  const cond = `${w.sql} AND e.sales_paused = 0 AND e.id NOT IN (SELECT value FROM json_each(?))`;
  const pick = (order, n) => db.prepare(`${b.sql} SELECT e.* FROM e WHERE ${cond} ORDER BY ${order}, e.id LIMIT ?`)
    .bind(...b.params, ...w.params, JSON.stringify(exclude), n);
  const res = await db.batch([pick("e.sold DESC, e.released DESC", Math.ceil(limit * 0.6)), pick("e.released DESC", Math.ceil(limit * 0.2)),
    pick("random()", Math.ceil(limit * 0.2))]);
  const seen = new Map();
  for (const r of res.flatMap((x) => x.results || [])) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()].slice(0, limit);
}

// Visible products by id, with the same computed columns (the products a person engaged with, as anchors).
export async function visibleByIds(db, ids, { sales = [], at = new Date().toISOString() } = {}) {
  if (!ids.length) return [];
  const b = base(sales, at);
  return all(db, `${b.sql} SELECT e.* FROM e WHERE e.id IN (SELECT value FROM json_each(?))`, ...b.params, JSON.stringify(ids));
}

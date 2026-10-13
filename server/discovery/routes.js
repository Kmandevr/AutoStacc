// Store discovery API: GET /api/store/search (filters, counts, sort, pages; public and cacheable), GET /api/store/suggest
// (autocomplete), GET /api/store/similar/:productId, POST /api/store/recommendations (personal sections from the
// profile the browser sends; never stored, never cached). Ownership is not in these answers: the browser reads it from
// /api/products/state, the one place that decides it.
import { json, readJson, fail, id } from "../lib/http.js";
import { routes as contentsRoutes } from "./contents-routes.js";
import { limit } from "../lib/ratelimit.js";
import { runningSales } from "../promotions/promotions.js";
import { sellersOf, productPath } from "../catalog/products.js";
import { SELLING } from "../creators/policy.js";
import { FACETS, label, fold } from "./vocabulary.js";
import { parseFilters } from "./filters.js";
import { search, suggestTitles, facetValueCounts } from "./search.js";
import { facetsOf } from "./facets.js";
import { storeProduct } from "./present.js";
import { recommend, similarTo } from "./recommend.js";

const kinds = SELLING.kinds;
const PUBLIC = { "Cache-Control": "public, max-age=60" };

async function find(app) {
  const started = Date.now();
  const at = new Date().toISOString();
  const f = parseFilters(new URL(app.request.url).searchParams, kinds);
  const sales = await runningSales(app.db, at);
  const r = await search(app.db, f, { sales, kinds, at });
  const [facets, sellers] = await Promise.all([facetsOf(app.db, r.rows.map((x) => x.id)), sellersOf(app.db, r.rows)]);
  return json({
    total: r.total, page: f.page, per: f.per, pages: Math.max(1, Math.ceil(r.total / f.per)), sort: f.sort,
    products: r.rows.map((row) => storeProduct(row, { sales, seller: sellers.get(row.id), facets: facets[row.id], at })),
    facets: r.facets, categories: r.categories, creators: r.creators, ranges: r.ranges, toggles: r.toggles,
    ignored: f.ignored, ms: Date.now() - started
  }, 200, PUBLIC);
}

// Autocomplete: product titles, makers and vocabulary values that match the typed text and exist on visible products.
async function suggest(app) {
  const q = (new URL(app.request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return json({ titles: [], makers: [], tags: [] }, 200, PUBLIC);
  if (q.length > 60) fail(400, "invalid_filter", "Type up to 60 characters.", { field: "q" });
  const [{ titles, makers }, counts] = await Promise.all([suggestTitles(app.db, q), facetValueCounts(app.db)]);
  const fq = fold(q);
  const tags = counts.filter((c) => FACETS[c.facet] && (fold(label(c.facet, c.value)).includes(fq) || c.value.includes(fq)))
    .sort((a, b) => b.n - a.n).slice(0, 6)
    .map((c) => ({ facet: c.facet, facetLabel: FACETS[c.facet].label, value: c.value, label: label(c.facet, c.value), count: c.n }));
  return json({ titles: titles.map((t) => ({ id: t.id, title: t.title, type: t.type, path: productPath(t) })), makers: makers.map((m) => ({ id: m.id, name: m.name, count: m.n })), tags }, 200, PUBLIC);
}

async function similar(app, { productId }) {
  const at = new Date().toISOString();
  const products = await similarTo(app, id(productId, "productId"), { sales: await runningSales(app.db, at), kinds, at });
  return json({ products }, 200, PUBLIC);
}

async function recommendations(app) {
  await limit(app, "recommendations", 60, 60);
  const body = await readJson(app.request, 16 * 1024);
  const at = new Date().toISOString();
  const res = await recommend(app, body, { sales: await runningSales(app.db, at), kinds, at, only: body && body.only === "list" ? "list" : null });
  return json(res, 200, { "Cache-Control": "private, no-store" });
}

export const routes = [
  ...contentsRoutes,
  ["GET", "/api/store/search", find],
  ["GET", "/api/store/suggest", suggest],
  ["GET", "/api/store/similar/:productId", similar],
  ["POST", "/api/store/recommendations", recommendations, { impersonation: "allow" }]
];

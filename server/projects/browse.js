// The projects browser (GET /api/projects/browse): every visible project with what it is about and what it makes,
// derived from real records only. First-party projects bring their genres, tagline, image and the dates of their
// releases, news and shows (synced from data/); every project adds what its published products say (kinds, genre and
// style facets, when they were added). Filters (OR within a group, AND between), counts per group without itself,
// search, sort and pages are worked out here, on the server. Nothing here is for sale: a project only says how many
// store items it has.
import { all, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { canonical, label } from "../discovery/vocabulary.js";
import { listVisibleProjects, publicProject } from "./projects.js";
import { listFollows } from "./follows.js";

export const SORTS = ["active", "name", "newest", "items"];
export const ACTIVE_DAYS = 30;
export const SHOW_DAYS = 60;
const PER = 24;
const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const list = (raw, name) => {
  const items = [...new Set((raw || "").split(",").map((x) => x.trim()).filter(Boolean))];
  if (items.length > 20 || items.some((x) => !WORD.test(x))) fail(400, "invalid_filter", `${name} is a list of lowercase words.`, { field: name });
  return items;
};
const flag = (raw, name) => {
  if (raw === null || raw === "") return null;
  if (raw !== "0" && raw !== "1") fail(400, "invalid_filter", `${name} is 0 or 1.`, { field: name });
  return raw === "1";
};

export function parseProjectFilters(params, kinds) {
  const q = (params.get("q") || "").trim().toLowerCase();
  if (q.length > 80) fail(400, "invalid_filter", "Search is up to 80 characters.", { field: "q" });
  const ignored = [];
  const keep = (facet) => list(params.get(facet), facet).map((w) => canonical(facet, w) || (ignored.push(`${facet}:${w}`), null)).filter(Boolean);
  const makes = list(params.get("makes"), "makes").filter((m) => (m === "releases" || kinds.includes(m) ? true : (ignored.push(`makes:${m}`), false)));
  const sort = params.get("sort") || "active";
  if (!SORTS.includes(sort)) fail(400, "invalid_filter", `sort is one of ${SORTS.join(", ")}.`, { field: "sort" });
  const page = Number(params.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) fail(400, "invalid_filter", "page is a whole number from 1.", { field: "page" });
  return { q, words: q.split(/\s+/).filter(Boolean).slice(0, 6), genre: keep("genre"), style: keep("style"), makes,
    active: flag(params.get("active"), "active"), followed: flag(params.get("followed"), "followed"), sort, page, ignored };
}

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// Every visible project as the browser shows it, plus whether `userId` follows it.
export async function projectEntries(db, { userId = null, at = new Date().toISOString() } = {}) {
  const [rows, kinds, facets, follows] = await Promise.all([
    listVisibleProjects(db),
    all(db, `SELECT project_id, type, COUNT(*) AS n, MAX(CASE WHEN COALESCE(released_at, created_at) <= ? THEN COALESCE(released_at, created_at) END) AS last
      FROM products WHERE published = 1 AND deleted_at IS NULL AND project_id IS NOT NULL GROUP BY project_id, type`, at), // a future release isn't activity yet
    all(db, `SELECT p.project_id, pf.facet, pf.value, COUNT(*) AS n FROM product_facets pf JOIN products p ON p.id = pf.product_id
      WHERE p.published = 1 AND p.deleted_at IS NULL AND pf.facet IN ('genre', 'style') GROUP BY p.project_id, pf.facet, pf.value`),
    userId ? listFollows(db, userId) : []
  ]);
  const followed = new Map(follows.map((f) => [f.project_id, f]));
  const today = at.slice(0, 10);
  return rows.map((r) => {
    const activity = parseJson(r.activity, {});
    const own = kinds.filter((k) => k.project_id === r.id);
    const tags = new Set(parseJson(r.genres, []));
    for (const x of facets.filter((x) => x.project_id === r.id)) tags.add(`${x.facet}:${x.value}`);
    const past = (d) => d && d <= today;
    const dates = [...(activity.releases || []), ...(activity.news || [])].filter(past).map((d) => `${d}T00:00:00.000Z`);
    const productLast = own.map((k) => k.last).filter(Boolean).sort().pop() || null;
    const lastActive = [...dates, productLast].filter(Boolean).sort().pop() || null;
    const nextShow = (activity.shows || []).filter((d) => d >= today).sort()[0] || null;
    const makes = [...((activity.releases || []).length ? ["releases"] : []), ...own.map((k) => k.type)];
    const f = followed.get(r.id);
    return {
      ...publicProject(r),
      tagline: r.tagline || null, image: r.image || null,
      genres: [...tags].map((t) => { const [facet, value] = t.split(":"); return { facet, value, label: label(facet, value) }; }),
      makes, items: own.reduce((s, k) => s + k.n, 0), releases: (activity.releases || []).length, news: (activity.news || []).length,
      lastActive, nextShow, createdAt: r.created_at,
      recent: Boolean((lastActive && daysBetween(lastActive, at) <= ACTIVE_DAYS) || (nextShow && daysBetween(at, `${nextShow}T00:00:00.000Z`) <= SHOW_DAYS)),
      following: f ? { autoStacc: Boolean(f.auto_stacc) } : null
    };
  });
}

// Filters, counts, sort and the page.
export function browse(entries, f, { signedIn = false } = {}) {
  const text = (e) => [e.name, e.tagline || "", e.creator || "", ...e.genres.map((g) => g.label)].join(" ").toLowerCase();
  const tagged = (e, facet, values) => values.some((v) => e.genres.some((g) => g.facet === facet && g.value === v));
  const pass = (e, skip) => f.words.every((w) => text(e).includes(w))
    && (skip === "genre" || !f.genre.length || tagged(e, "genre", f.genre))
    && (skip === "style" || !f.style.length || tagged(e, "style", f.style))
    && (skip === "makes" || !f.makes.length || f.makes.some((m) => e.makes.includes(m)))
    && (skip === "active" || !f.active || e.recent)
    && (skip === "followed" || f.followed === null || !signedIn || Boolean(e.following) === f.followed);
  const counts = (facet) => {
    const out = {};
    for (const e of entries.filter((x) => pass(x, facet))) for (const g of e.genres.filter((x) => x.facet === facet)) out[g.value] = (out[g.value] || 0) + 1;
    return Object.entries(out).map(([value, count]) => ({ value, label: label(facet, value), count, selected: f[facet].includes(value) })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const makesCounts = {};
  for (const e of entries.filter((x) => pass(x, "makes"))) for (const m of new Set(e.makes)) makesCounts[m] = (makesCounts[m] || 0) + 1;
  const order = {
    active: (a, b) => (b.recent - a.recent) || String(b.lastActive || "").localeCompare(String(a.lastActive || "")) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.name.localeCompare(b.name),
    items: (a, b) => b.items - a.items || a.name.localeCompare(b.name)
  }[f.sort];
  const hits = entries.filter((e) => pass(e)).sort(order);
  return {
    total: hits.length, page: f.page, per: PER, pages: Math.max(1, Math.ceil(hits.length / PER)), sort: f.sort,
    projects: hits.slice((f.page - 1) * PER, f.page * PER).map(({ createdAt, ...e }) => e),
    facets: { genre: counts("genre"), style: counts("style"),
      makes: Object.entries(makesCounts).map(([value, count]) => ({ value, count, selected: f.makes.includes(value) })) },
    toggles: { active: entries.filter((x) => pass(x, "active") && x.recent).length,
      followed: signedIn ? entries.filter((x) => pass(x, "followed") && x.following).length : null },
    ignored: f.ignored
  };
}

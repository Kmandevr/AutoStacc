// Public release and news pages for every creator, first-party included: /<creator>/<project>/music/<slug> and
// /<creator>/<project>/news/<slug>, rendered from D1 (server/content/content.js) by render.js, plus /sitemap-content.xml
// (sitemap.js). Only published content of visible projects; anything unknown returns null so the static site answers
// (its 404 page). Mixed case and a trailing slash answer a 301 to the clean address, and so do old slugs of renamed
// creators and projects while their hold lasts. Kept in the edge cache for a minute in production.
import { first } from "../lib/db.js";
import { getCreatorBySlug, getCreator, getProject, getProjectBySlug } from "../creators/creators.js";
import { heldTarget } from "../creators/holds.js";
import { markup } from "../sites/text.js";
import { getPublished, newsAboutRelease, sitemapEntries } from "./content.js";
import { renderRelease, renderNews, pageHeaders } from "./render.js";
import { sitemapXml } from "./sitemap.js";

const SEGMENT = /^[A-Za-z0-9-]{1,60}$/;
const KIND = { music: "releases", news: "news" };
export const SITEMAP_PATH = "/sitemap-content.xml";

const redirect = (siteUrl, path) => new Response(null, { status: 301, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });
const json = (v, fallback) => {
  if (typeof v !== "string") return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};
// content.js may hand back a stored row or its public shape; both become the shape render.js reads.
const pick = (x, ...keys) => { for (const k of keys) if (x[k] !== undefined && x[k] !== null) return x[k]; return undefined; };
const asRelease = (x) => x && ({
  slug: pick(x, "slug", "id"), title: x.title, type: x.type, date: pick(x, "date", "release_date"), upc: x.upc || "",
  description: x.description || "", artwork: json(x.artwork, null), tracks: json(x.tracks, []), credits: json(x.credits, []),
  embedUrl: pick(x, "embedUrl", "embed_url") || "", fallbackEmbedUrl: pick(x, "fallbackEmbedUrl", "fallback_embed_url") || "", links: json(x.links, [])
});
const asNews = (x) => x && ({
  slug: pick(x, "slug", "id"), title: x.title, tag: x.tag || "", date: pick(x, "date", "post_date"), summary: x.summary || "",
  release: pick(x, "release", "release_slug") || "", bodyHtml: pick(x, "bodyHtml") ?? markup(x.body || "")
});

// Whether the project has a list page for music or news: a first-party project's hand-written pages (it opts into the
// feature in data/projects.js), a Studio project's published site page of that name.
async function lists(db, creator, project) {
  if (creator.source === "catalog") {
    const features = json(project.features, []);
    const has = (f) => Array.isArray(features) && features.includes(f);
    return { music: has("releases"), news: has("news") };
  }
  const page = async (slug) => Boolean(await first(db, "SELECT 1 AS ok FROM site_pages WHERE project_id = ? AND slug = ?", project.id, slug));
  const [music, news] = await Promise.all([page("music"), page("news")]);
  return { music, news };
}

// A renamed creator or project: the same address under its new slug, while the old one is held.
async function moved(db, siteUrl, [creatorSlug, projectSlug, ...rest]) {
  const creator = await getCreatorBySlug(db, creatorSlug);
  if (!creator) {
    const to = await heldTarget(db, "creator", "", creatorSlug).then((id) => id && getCreator(db, id));
    return to ? redirect(siteUrl, "/" + [to.slug, projectSlug, ...rest].join("/")) : null;
  }
  if (await getProjectBySlug(db, creator.id, projectSlug)) return null;
  const to = await heldTarget(db, "project", creator.id, projectSlug).then((id) => id && getProject(db, id));
  return to && to.published ? redirect(siteUrl, "/" + [creator.slug, to.slug, ...rest].join("/")) : null;
}

async function resolve(app, segs, head) {
  const { db, config } = app;
  const [creatorSlug, projectSlug, section, slug] = segs;
  const kind = KIND[section];
  const found = await getPublished(db, kind, creatorSlug, projectSlug, slug);
  if (!found) return moved(db, config.siteUrl, segs);
  // The stored rows (look, features, trusted), whatever shape content.js answers with; visibility is checked again here.
  const creator = await getCreatorBySlug(db, creatorSlug);
  const project = creator && await getProjectBySlug(db, creator.id, projectSlug);
  const item = found.item || found.row || found;
  if (!project || creator.status !== "active" || !creator.published || !project.published) return null;
  const home = `/${creator.slug}/${project.slug}`;
  const ctx = { creator, project, home, index: Boolean(creator.trusted), frame: creator.source === "catalog", look: json(project.look, null) || {}, lists: await lists(db, creator, project) };
  let html;
  if (kind === "releases") {
    const r = asRelease(item);
    const news = (await newsAboutRelease(db, project.id, r.slug) || []).map(asNews).filter((n) => n && n.slug);
    html = renderRelease(config.siteUrl, ctx, r, news);
  } else {
    const n = asNews(item);
    const about = n.release ? await getPublished(db, "releases", creator.slug, project.slug, n.release) : null;
    html = renderNews(config.siteUrl, ctx, n, about && asRelease(about.item || about.row || about));
  }
  return new Response(head ? null : html, { headers: pageHeaders() });
}

// The content sitemap: every published release and news post of a trusted creator (the others are noindex).
async function sitemap(app, head) {
  const xml = sitemapXml(app.config.siteUrl, await sitemapEntries(app.db) || []);
  return new Response(head ? null : xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" } });
}

// A Response for a release or news page (or the content sitemap), or null to let the next handler answer.
export async function contentPage(app) {
  const { request } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const head = request.method === "HEAD";
  if (url.pathname === SITEMAP_PATH) return sitemap(app, head);
  const segs = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  if (segs.length !== 4 || !segs.every((s) => SEGMENT.test(s))) return null;
  const lower = segs.map((s) => s.toLowerCase());
  if (!KIND[lower[2]]) return null;
  if (lower.join("/") !== segs.join("/") || url.pathname.endsWith("/")) return redirect(app.config.siteUrl, "/" + lower.join("/") + url.search);
  // Edge cache in production only, so local runs and tests see a publish or a removal at once.
  const cache = app.config.appEnv === "production" && typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.origin + url.pathname, { method: "GET" });
  const hit = cache && !head ? await cache.match(key) : null;
  if (hit) return hit;
  const res = await resolve(app, lower, head);
  if (res && cache && !head && res.status === 200 && app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

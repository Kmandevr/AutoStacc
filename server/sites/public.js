// Public creator addresses for Studio creators: /<creator> (profile), /<creator>/<project> (site home) and
// /<creator>/<project>/<page>. Pages were rendered at publish time (sites/publish.js), so a view is one indexed read,
// kept in the edge cache for a minute. Returns a Response, or null to let the static site answer (first-party
// creators' pages are static files; anything unknown gets the ordinary 404 page). Old slugs of renamed creators and
// projects answer a 301 while their hold lasts; mixed-case addresses a 301 to lowercase.
import { first, all } from "../lib/db.js";
import { RESERVED } from "../lib/slugs.js";
import { getCreatorBySlug, getCreator, getProject, getProjectBySlug } from "../creators/creators.js";
import { heldTarget } from "../creators/holds.js";
import { renderProfile, PAGE_HEADERS } from "./render.js";

const SEGMENT = /^[A-Za-z0-9-]{1,60}$/;

const redirect = (siteUrl, path) => new Response(null, { status: 301, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });
const page = (html, head) => new Response(head ? null : html, { headers: PAGE_HEADERS });

async function resolve(app, segs, head) {
  const { db, config } = app;
  const [creatorSlug, projectSlug, pageSlug] = segs;
  const creator = await getCreatorBySlug(db, creatorSlug);
  if (!creator) {
    const moved = await heldTarget(db, "creator", "", creatorSlug);
    const to = moved && await getCreator(db, moved);
    return to ? redirect(config.siteUrl, "/" + [to.slug, ...segs.slice(1)].join("/")) : null;
  }
  if (creator.source !== "studio" || creator.status !== "active" || !creator.published) return null;
  if (!projectSlug) {
    const projects = await all(db, "SELECT slug, name FROM projects WHERE creator_id = ? AND published = 1 AND deleted_at IS NULL ORDER BY name", creator.id);
    return page(renderProfile({ siteUrl: config.siteUrl, creator, projects, indexable: Boolean(creator.trusted) }), head);
  }
  const project = await getProjectBySlug(db, creator.id, projectSlug);
  if (!project) {
    const moved = await heldTarget(db, "project", creator.id, projectSlug);
    const to = moved && await getProject(db, moved);
    return to && to.published ? redirect(config.siteUrl, "/" + [creator.slug, to.slug, ...segs.slice(2)].join("/")) : null;
  }
  if (!project.published) return null;
  if (pageSlug === "home") return redirect(config.siteUrl, `/${creator.slug}/${project.slug}`);
  const row = await first(db, "SELECT html FROM site_pages WHERE project_id = ? AND slug = ?", project.id, pageSlug || "");
  return row ? page(row.html, head) : null;
}

export async function sitePage(app) {
  const { request } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const segs = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  if (segs.length < 1 || segs.length > 3 || !segs.every((s) => SEGMENT.test(s))) return null;
  const lower = segs.map((s) => s.toLowerCase());
  if (lower.join("/") !== segs.join("/")) return redirect(app.config.siteUrl, "/" + lower.join("/") + url.search);
  if (RESERVED.has(lower[0])) return null;
  if (url.pathname.endsWith("/")) return redirect(app.config.siteUrl, "/" + lower.join("/") + url.search);
  // Edge cache in production only, so local runs and tests see a publish or a suspension at once.
  const cache = app.config.appEnv === "production" && typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.origin + url.pathname, { method: "GET" });
  const hit = cache && request.method === "GET" ? await cache.match(key) : null;
  if (hit) return hit;
  const res = await resolve(app, lower, request.method === "HEAD");
  if (res && cache && request.method === "GET" && res.status === 200 && app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

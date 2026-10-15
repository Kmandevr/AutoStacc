// Public creator addresses for Studio creators: /<creator> (profile), /<creator>/<name> (a project's home, else a page
// of the profile: sites/addresses.js) and /<creator>/<project>/<page>. Pages were rendered at publish time
// (sites/publish.js), so a view is one indexed read, kept in the edge cache for a minute. A site whose scheduled publish
// is due is published first (sites/schedule.js). A creator without a published profile shows the generated list of
// their projects. Returns a Response, or null to let the static site answer (first-party
// creators' pages are static files; anything unknown gets the ordinary 404 page). Old slugs of renamed creators and
// projects answer a 301 while their hold lasts; mixed-case addresses a 301 to lowercase.
import { first, all } from "../lib/db.js";
import { RESERVED } from "../lib/slugs.js";
import { getCreatorBySlug, getCreator, getProject, getProjectBySlug } from "../creators/creators.js";
import { heldTarget } from "../creators/holds.js";
import { renderProfileList, pageHeaders } from "./render.js";
import { projectSite, profileSite } from "./targets.js";
import { runIfDue } from "./schedule.js";

const SEGMENT = /^[A-Za-z0-9-]{1,60}$/;

const redirect = (siteUrl, path) => new Response(null, { status: 301, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });
const respond = (config, html, head) => new Response(head ? null : html, { headers: pageHeaders(config.siteUrl) });
const profilePage = (db, creatorId, slug) => first(db, `SELECT p.html FROM profile_pages p JOIN creator_sites s ON s.creator_id = p.creator_id
  WHERE p.creator_id = ? AND p.slug = ? AND s.live = 1`, creatorId, slug);

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
  if (!projectSlug || !pageSlug) await runIfDue(app, profileSite(creator));
  if (!projectSlug) {
    const own = await profilePage(db, creator.id, "");
    if (own) return respond(config, own.html, head);
    const projects = await all(db, "SELECT slug, name FROM projects WHERE creator_id = ? AND published = 1 AND deleted_at IS NULL ORDER BY name", creator.id);
    return respond(config, renderProfileList({ siteUrl: config.siteUrl, creator, projects, indexable: Boolean(creator.trusted) }), head);
  }
  const project = await getProjectBySlug(db, creator.id, projectSlug);
  if (!project && !pageSlug) {
    const own = projectSlug !== "home" && await profilePage(db, creator.id, projectSlug);
    if (own) return respond(config, own.html, head);
  }
  if (!project) {
    const moved = await heldTarget(db, "project", creator.id, projectSlug);
    const to = moved && await getProject(db, moved);
    return to && to.published ? redirect(config.siteUrl, "/" + [creator.slug, to.slug, ...segs.slice(2)].join("/")) : null;
  }
  await runIfDue(app, projectSite(creator, project));
  const live = project.published || (await getProject(db, project.id)).published;
  if (!live) return null;
  if (pageSlug === "home") return redirect(config.siteUrl, `/${creator.slug}/${project.slug}`);
  const row = await first(db, "SELECT html FROM site_pages WHERE project_id = ? AND slug = ?", project.id, pageSlug || "");
  return row ? respond(config, row.html, head) : null;
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

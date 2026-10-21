// Public content pages for every creator, first-party included, rendered from D1 (content.js): a release at
// /<creator>/<project>/music/<slug> (render-release.js), an event at /<creator>/<project>/events/<slug> with its .ics
// file at .../<slug>.ics, a project's events list at /<creator>/<project>/events (render-event.js; a Studio project's
// own published site page "events" wins, a first-party project has it when it opts into "events"), the events calendar
// /events (calendar.js) and /sitemap-content.xml (sitemap.js). News is off until each creator's community opens (#174):
// /<creator>/<project>/news and /news/<slug> answer a 301 to the project's home. Only published content of visible
// projects; anything unknown returns null so the next handler or the static site answers (its 404 page). Mixed case
// and a trailing slash answer a 301 to the clean address, and so do old slugs of renamed creators and projects while
// their hold lasts. Kept in the edge cache in production.
import { first } from "../lib/db.js";
import { getCreatorBySlug, getCreator, getProject, getProjectBySlug } from "../creators/creators.js";
import { heldTarget } from "../creators/holds.js";
import { getVisibleProject } from "../projects/projects.js";
import { getPublished, projectContent, today } from "./content.js";
import { pageHeaders } from "./page.js";
import { renderRelease } from "./render-release.js";
import { renderEvent, renderEventList } from "./render-event.js";
import { renderCalendar } from "./calendar.js";
import { eventIcs } from "./ics.js";
import { sitemapXml, sitemapEntries, CALENDAR_PATH } from "./sitemap.js";

const SEGMENT = /^[A-Za-z0-9-]{1,60}$/;
const SECTIONS = { music: [4], events: [3, 4], news: [3, 4] };
export const SITEMAP_PATH = "/sitemap-content.xml";

const redirect = (siteUrl, path, status = 301) => new Response(null, { status, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });
const json = (v, fallback) => {
  if (typeof v !== "string") return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

// The project's list pages: a first-party project's (it opts into the feature), a Studio project's music page when it
// published a site page "music", and its events list always (its own page "events", or ours).
async function lists(db, creator, project) {
  if (creator.source === "catalog") {
    const features = json(project.features, []);
    const has = (f) => Array.isArray(features) && features.includes(f);
    return { music: has("releases"), events: has("events") };
  }
  const page = async (slug) => Boolean(await first(db, "SELECT 1 AS ok FROM site_pages WHERE project_id = ? AND slug = ?", project.id, slug));
  return { music: await page("music"), events: true, ownEvents: await page("events") };
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

// The stored creator and project (look, features, trusted) when both are visible, as the renderers' ctx.
async function projectCtx(db, creatorSlug, projectSlug) {
  const creator = await getCreatorBySlug(db, creatorSlug);
  const project = creator && await getProjectBySlug(db, creator.id, projectSlug);
  if (!project || creator.status !== "active" || !creator.published || !project.published || !(await getVisibleProject(db, project.id))) return null;
  const home = `/${creator.slug}/${project.slug}`;
  return { creator, project, home, index: Boolean(creator.trusted), frame: creator.source === "catalog", look: json(project.look, null) || {}, lists: await lists(db, creator, project) };
}

async function resolve(app, segs, { head, ics }) {
  const { db, config } = app;
  const [creatorSlug, projectSlug, section, slug] = segs;
  const ctx = await projectCtx(db, creatorSlug, projectSlug);
  if (!ctx) return moved(db, config.siteUrl, segs);
  if (section === "news") return redirect(config.siteUrl, ctx.home);
  let body;
  if (section === "events" && !slug) {
    if (ctx.lists.ownEvents || !ctx.lists.events) return null;
    body = renderEventList(config.siteUrl, ctx, (await projectContent(db, ctx.project.id)).events);
  } else {
    const found = await getPublished(db, section === "music" ? "releases" : "events", creatorSlug, projectSlug, slug);
    if (!found || found.project.id !== ctx.project.id) return null;
    if (ics) {
      const host = new URL(config.siteUrl).host;
      return new Response(head ? null : eventIcs(found.item, { url: config.siteUrl + found.item.path, host, organizer: ctx.project.name }), { headers: {
        "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${found.item.id}.ics"`,
        "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
    }
    body = section === "music" ? renderRelease(config.siteUrl, ctx, found.item) : renderEvent(config.siteUrl, ctx, found.item);
  }
  return new Response(head ? null : body, { headers: pageHeaders() });
}

async function sitemap(app, head) {
  const xml = sitemapXml(app.config.siteUrl, await sitemapEntries(app.db) || []);
  return new Response(head ? null : xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" } });
}

async function calendar(app, url, head) {
  try {
    return new Response(head ? null : await renderCalendar(app, url.searchParams, today()), { headers: pageHeaders(120) });
  } catch (e) {
    if (e && e.status === 400) return redirect(app.config.siteUrl, CALENDAR_PATH, 302); // a bad filter: the plain calendar
    throw e;
  }
}

// Edge cache in production only, so local runs and tests see a publish or a removal at once. One page for everyone.
async function cached(app, key, head, make) {
  const cache = app.config.appEnv === "production" && typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && !head ? await cache.match(key) : null;
  if (hit) return hit;
  const res = await make();
  if (res && cache && !head && res.status === 200 && app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// A Response for a content page, the calendar or the content sitemap, or null to let the next handler answer.
export async function contentPage(app) {
  const { request } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const head = request.method === "HEAD";
  if (url.pathname === SITEMAP_PATH) return sitemap(app, head);
  if (url.pathname !== CALENDAR_PATH && url.pathname.replace(/\/+$/, "").toLowerCase() === CALENDAR_PATH) return redirect(app.config.siteUrl, CALENDAR_PATH + url.search);
  if (url.pathname === CALENDAR_PATH) return cached(app, new Request(url.origin + url.pathname + url.search), head, () => calendar(app, url, head));
  const segs = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  const ics = segs.length === 4 && /\.ics$/i.test(segs[3]);
  if (ics) segs[3] = segs[3].slice(0, -4);
  if (!segs.every((s) => SEGMENT.test(s))) return null;
  const lower = segs.map((s) => s.toLowerCase());
  const lengths = SECTIONS[lower[2]];
  if (!lengths || !lengths.includes(segs.length) || (ics && lower[2] !== "events")) return null;
  const clean = "/" + lower.join("/") + (ics ? ".ics" : "");
  if (clean !== url.pathname) return redirect(app.config.siteUrl, clean + url.search);
  return cached(app, new Request(url.origin + url.pathname), head, () => resolve(app, lower, { head, ics }));
}

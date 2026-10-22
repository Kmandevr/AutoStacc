// A project space's own address (docs/community.md, "Addresses"): /<creator>/<project>/community and
// /<creator>/<project>/community/<channel>, served from functions/[[path]].js ahead of the creator pages. Only projects
// with the "community" feature answer; everything else (and the whole thing while community.forum is off) answers null,
// so the creator pages and the 404 behave as before. The page is the community's own (public.js), drawn for that space;
// a first-party project with the feature on gets its space made on the first visit. /community/<space> for a project
// space redirects here (public.js), so each page has one address.
import { isOn } from "../../lib/features.js";
import { first } from "../../lib/db.js";
import { communityPage } from "./public.js";
import { ensureProjectSpace } from "./project-space.js";

const PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/community(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?\/?$/;

export async function projectCommunityPage(app) {
  const { request } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (!isOn(app, "community.forum")) return null;
  const url = new URL(request.url);
  const m = url.pathname.match(PATH);
  if (!m) return null;
  const project = await first(app.db, `SELECT p.id, p.features FROM projects p JOIN creators c ON c.id = p.creator_id
    WHERE c.slug = ? AND (p.slug = ? OR (p.slug IS NULL AND p.id = ?)) AND p.published = 1 AND p.deleted_at IS NULL
      AND (p.source = 'catalog' OR (c.status = 'active' AND c.deleted_at IS NULL))`, m[1], m[2], m[2]);
  if (!project || !JSON.parse(project.features || "[]").includes("community")) return null;
  const space = await ensureProjectSpace(app.db, project.id);
  if (!space) return null;
  // The community's own renderer, asked for the space by its /community address; it knows this is the canonical one.
  const inner = new URL(`/community/${space.slug}${m[3] ? `/${m[3]}` : ""}${url.search}`, url.origin);
  const template = async () => {
    const page = await app.ctx.env.ASSETS.fetch(new URL("/community", url));
    const html = page.ok ? await page.text() : "";
    return /<!-- community:main:start -->/.test(html) && /<!-- seo:start/.test(html) ? html : null;
  };
  return communityPage({ ...app, canonicalServe: true, cachePath: url.pathname.replace(/\/+$/, ""), request: new Request(inner, { method: request.method, headers: request.headers }) }, template);
}

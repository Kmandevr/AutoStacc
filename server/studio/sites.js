// Studio API, sites (docs/builder.md): the visual builder's draft, a private preview, publishing, history, scheduling,
// for a project's site (/api/studio/projects/:projectId/...) and a creator's profile (/api/studio/creators/:creatorId/...),
// with the same handlers. A draft is the site document (server/sites/document.js), checked whole on every save; publishing
// renders it into static pages. The preview is rendered on request for the creator only, with the same CSP as the
// public page and marked noindex. Site files (images, fonts) are in studio/site-files.js.
import { json, readJson, fail, str } from "../lib/http.js";
import { first, run, now, parseJson } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS, quotaOf } from "../creators/policy.js";
import { requireCreator, projectsOf } from "../creators/creators.js";
import { requireProject } from "../creators/projects.js";
import { rolesFor, capabilitiesOf } from "../creators/roles.js";
import { storageUsed } from "../creators/storage.js";
import { cleanDocument, starterDocument } from "../sites/document.js";
import { ELEMENT_TYPES, EFFECTS, HOVERS } from "../sites/elements.js";
import { NETWORKS } from "../sites/networks.js";
import { PRESETS, FONTS, HEADERS } from "../sites/theme.js";
import { EMBED_PROVIDERS } from "../sites/embeds.js";
import { renderPage, pageHeaders } from "../sites/render.js";
import { publishSite, unpublishSite, siteContext, checkAddresses } from "../sites/publish.js";
import { listVersions, restoreVersion } from "../sites/versions.js";
import { scheduleSite, cancelSchedule } from "../sites/schedule.js";
import { projectSite, profileSite } from "../sites/targets.js";
import { listImages, imageSrc } from "../sites/images.js";
import { listProjectProducts } from "../catalog/products.js";
import { productPath } from "../creators/products.js";
import { TEMPLATES, templateById } from "../sites/templates.js";

// The site a request is about, and the account's role in its creator, for a member who may do this (roles.js:
// "site.edit" to see and change drafts, "site.publish" to put them live). Not a member: 404.
async function targetOf(app, params, user, capability = "site.edit") {
  if (params.projectId) {
    const { project, creator, role } = await requireProject(app.db, params.projectId, user, rolesFor(capability));
    return { target: projectSite(creator, project), role };
  }
  const { creator, role } = await requireCreator(app.db, params.creatorId, user, rolesFor(capability));
  // A profile's row is made on first use.
  await run(app.db, "INSERT OR IGNORE INTO creator_sites (creator_id, draft, draft_updated_at) VALUES (?, '{}', ?)", creator.id, now());
  return { target: profileSite(creator), role };
}

const starter = (target) => starterDocument(target.name, { profile: target.kind === "profile" });
const draftOf = (row, target) => {
  const raw = parseJson(row && row.draft, {});
  return raw.pages ? cleanDocument(raw).doc : starter(target);
};

async function getSite(app, params) {
  const user = await requireUser(app);
  const { target, role } = await targetOf(app, params, user);
  const creator = target.creator;
  const [site, files, projects, used] = await Promise.all([
    first(app.db, `SELECT draft, draft_updated_at, published_at, version, scheduled_at FROM ${target.table} WHERE ${target.key} = ?`, target.id),
    listImages(app.db, creator.id),
    projectsOf(app.db, creator.id),
    storageUsed(app.db, creator.id)
  ]);
  const products = await listProjectProducts(app.db, projects.map((p) => p.id));
  const live = target.kind === "project" ? Boolean(target.project.published) : Boolean((await first(app.db, "SELECT live FROM creator_sites WHERE creator_id = ?", creator.id)).live);
  return json({
    site: { kind: target.kind, id: target.id, name: target.name, path: target.base, live, savedAt: site && site.draft_updated_at, publishedAt: site && site.published_at,
      version: site ? site.version : 0, scheduledAt: (site && site.scheduled_at) || null, fresh: !parseJson(site && site.draft, {}).pages },
    creator: { id: creator.id, slug: creator.slug, name: creator.name, trusted: Boolean(creator.trusted) },
    role, capabilities: capabilitiesOf(role),
    document: draftOf(site, target),
    files: files.map((i) => ({ id: i.id, src: imageSrc(i.id), filename: i.filename, contentType: i.content_type, sizeBytes: i.size_bytes })),
    products: products.map((p) => ({ id: p.id, title: p.title, path: productPath(p), artwork: p.artwork, preview: p.preview || null })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, path: `/${creator.slug}/${p.slug}`, published: Boolean(p.published) })),
    storage: { usedBytes: used, quotaBytes: quotaOf(creator) },
    options: { elements: ELEMENT_TYPES, effects: EFFECTS, hovers: HOVERS, networks: NETWORKS, embeds: EMBED_PROVIDERS, limits: LIMITS,
      presets: Object.entries(PRESETS).map(([id, p]) => ({ id, ...p })), fonts: Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label })),
      headers: Object.entries(HEADERS).map(([id, label]) => ({ id, label })), templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, blurb: t.blurb })) }
  });
}

async function saveSite(app, params) {
  const user = await requireUser(app);
  await limit(app, "studio-save", 60, 60);
  const { target } = await targetOf(app, params, user);
  const body = await readJson(app.request, LIMITS.siteDocumentBytes + 1024);
  const { doc } = cleanDocument(body.document);
  await checkAddresses(app.db, target, doc);
  const t = now();
  await run(app.db, `UPDATE ${target.table} SET draft = ?, draft_updated_at = ? WHERE ${target.key} = ?`, JSON.stringify(doc), t, target.id);
  return json({ document: doc, savedAt: t });
}

async function preview(app, params) {
  const user = await requireUser(app);
  const { target } = await targetOf(app, params, user);
  const site = await first(app.db, `SELECT draft FROM ${target.table} WHERE ${target.key} = ?`, target.id);
  const { doc, ...refs } = cleanDocument(draftOf(site, target));
  const slug = new URL(app.request.url).searchParams.get("page") || "";
  const page = doc.pages.find((p) => p.slug === slug) || doc.pages[0];
  const ctx = await siteContext(app.db, target, refs);
  const html = renderPage({ siteUrl: app.config.siteUrl, target, doc, page, ctx, indexable: false });
  return new Response(html, { headers: { ...pageHeaders(app.config.siteUrl), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

async function publish(app, params) {
  const user = await requireUser(app);
  await limit(app, "studio-publish", 20, 600);
  const { target } = await targetOf(app, params, user, "site.publish");
  return json(await publishSite(app, target, { user }));
}

async function unpublish(app, params) {
  const user = await requireUser(app);
  const { target } = await targetOf(app, params, user, "site.publish");
  await unpublishSite(app, target);
  return json({ ok: true });
}

async function versions(app, params) {
  const user = await requireUser(app);
  const { target } = await targetOf(app, params, user);
  return json({ versions: (await listVersions(app.db, target)).map((v) => ({ version: v.version, publishedAt: v.published_at, byYou: v.published_by === user.id, scheduled: !v.published_by })) });
}

async function restore(app, params) {
  const user = await requireUser(app);
  const { target } = await targetOf(app, params, user);
  const version = Number(params.version);
  if (!Number.isInteger(version) || version < 1) fail(404, "not_found", "No such version.");
  return json(await restoreVersion(app.db, target, version));
}

async function schedule(app, params) {
  const user = await requireUser(app);
  await limit(app, "studio-publish", 20, 600);
  const { target } = await targetOf(app, params, user, "site.publish");
  const body = await readJson(app.request);
  return json(await scheduleSite(app.db, target, str(body.at, "at", { max: 40 }), user));
}

async function unschedule(app, params) {
  const user = await requireUser(app);
  const { target } = await targetOf(app, params, user, "site.publish");
  await cancelSchedule(app.db, target);
  return json({ ok: true });
}

// A starter template's document, checked (the editor puts it in the draft; nothing is saved until the creator saves).
async function template(app, { templateId }) {
  await requireUser(app);
  const t = templateById(templateId);
  if (!t) fail(404, "not_found", "No such template.");
  return json({ id: t.id, label: t.label, document: cleanDocument(t.doc).doc });
}

const both = (method, rest, handler) => [
  [method, `/api/studio/projects/:projectId/${rest}`, handler],
  [method, `/api/studio/creators/:creatorId/${rest}`, handler]
];

export const routes = [
  ["GET", "/api/studio/templates/:templateId", template],
  ...both("GET", "site", getSite),
  ...both("PUT", "site", saveSite),
  ...both("GET", "preview", preview),
  ...both("POST", "publish", publish),
  ...both("POST", "unpublish", unpublish),
  ...both("GET", "versions", versions),
  ...both("POST", "versions/:version/restore", restore),
  ...both("PUT", "schedule", schedule),
  ...both("DELETE", "schedule", unschedule)
];

// Studio API, sites: the no-code editor's draft, a private preview, publishing, and the creator's images. A draft is
// the site document (server/sites/document.js), checked whole on every save; publishing renders it into static pages.
// The preview is rendered on request for the creator only, with the same CSP as the public page and marked noindex.
import { json, readJson, fail, str } from "../lib/http.js";
import { first, run, now, parseJson } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS } from "../creators/policy.js";
import { requireCreator, projectsOf } from "../creators/creators.js";
import { requireProject } from "../creators/projects.js";
import { cleanDocument, starterDocument, BLOCK_TYPES, NETWORKS } from "../sites/document.js";
import { PRESETS, FONTS } from "../sites/theme.js";
import { EMBED_PROVIDERS } from "../sites/embeds.js";
import { renderPage, PAGE_HEADERS } from "../sites/render.js";
import { publishProject, unpublishProject } from "../sites/publish.js";
import { listImages, ownImages, uploadImage, deleteImage, imageSrc, usageOf } from "../sites/images.js";
import { listProjectProducts } from "../catalog/products.js";
import { productPath } from "../creators/products.js";
import { safeFilename } from "../storage/buckets.js";

async function getSite(app, { projectId }) {
  const user = await requireUser(app);
  const { project, creator } = await requireProject(app.db, projectId, user);
  const [site, images, projects] = await Promise.all([
    first(app.db, "SELECT draft, draft_updated_at, published_at, version FROM project_sites WHERE project_id = ?", project.id),
    listImages(app.db, creator.id),
    projectsOf(app.db, creator.id)
  ]);
  const draft = parseJson(site && site.draft, {});
  const products = await listProjectProducts(app.db, projects.map((p) => p.id));
  return json({
    project: { id: project.id, slug: project.slug, name: project.name, published: Boolean(project.published), path: `/${creator.slug}/${project.slug}` },
    creator: { id: creator.id, slug: creator.slug, name: creator.name, trusted: Boolean(creator.trusted) },
    document: draft.pages ? draft : starterDocument(project.name),
    savedAt: site && site.draft_updated_at, publishedAt: site && site.published_at,
    images: images.map((i) => ({ id: i.id, src: imageSrc(i.id), filename: i.filename, sizeBytes: i.size_bytes })),
    products: products.map((p) => ({ id: p.id, title: p.title })),
    options: { blocks: BLOCK_TYPES, networks: NETWORKS, embeds: EMBED_PROVIDERS, limits: LIMITS,
      presets: Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })), fonts: Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label })) }
  });
}

async function saveSite(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-save", 60, 60);
  const { project } = await requireProject(app.db, projectId, user);
  const body = await readJson(app.request, LIMITS.siteDocumentBytes + 1024);
  const { doc } = cleanDocument(body.document);
  const t = now();
  await run(app.db, "UPDATE project_sites SET draft = ?, draft_updated_at = ? WHERE project_id = ?", JSON.stringify(doc), t, project.id);
  return json({ document: doc, savedAt: t });
}

async function preview(app, { projectId }) {
  const user = await requireUser(app);
  const { project, creator } = await requireProject(app.db, projectId, user);
  const site = await first(app.db, "SELECT draft FROM project_sites WHERE project_id = ?", project.id);
  const raw = parseJson(site && site.draft, {});
  const { doc, assets } = cleanDocument(raw.pages ? raw : starterDocument(project.name));
  const slug = new URL(app.request.url).searchParams.get("page") || "";
  const page = doc.pages.find((p) => p.slug === slug) || doc.pages[0];
  const projects = await projectsOf(app.db, creator.id);
  const images = await ownImages(app.db, creator.id, [...assets]);
  const products = await listProjectProducts(app.db, projects.map((p) => p.id));
  const ctx = { images: new Map(images.map((x) => [x.id, imageSrc(x.id)])), products: new Map(products.map((p) => [p.id, { title: p.title, path: productPath(p), artwork: p.artwork }])) };
  const html = renderPage({ siteUrl: app.config.siteUrl, creator, project, doc, page, ctx, indexable: false });
  return new Response(html, { headers: { ...PAGE_HEADERS, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

async function publish(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-publish", 20, 600);
  const { project, creator } = await requireProject(app.db, projectId, user);
  return json(await publishProject(app, creator, project));
}

async function unpublish(app, { projectId }) {
  const user = await requireUser(app);
  const { project } = await requireProject(app.db, projectId, user);
  await unpublishProject(app, project);
  return json({ ok: true });
}

async function images(app, { creatorId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user);
  const [list, usage] = await Promise.all([listImages(app.db, creator.id), usageOf(app.db, creator.id)]);
  return json({ images: list.map((i) => ({ id: i.id, src: imageSrc(i.id), filename: i.filename, sizeBytes: i.size_bytes })), usage });
}

// Raw upload: PUT the image bytes with ?filename=... .
async function upload(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-upload", 30, 600);
  const { creator } = await requireCreator(app.db, creatorId, user);
  const filename = safeFilename(str(new URL(app.request.url).searchParams.get("filename") || "image", "filename", { max: 120 }));
  return json({ image: await uploadImage(app, creator, user, filename) }, 201);
}

async function removeImage(app, { creatorId, imageId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user);
  if (typeof imageId !== "string" || !/^as_[a-z2-7]{20,40}$/.test(imageId)) fail(404, "not_found", "No image with that id.");
  await deleteImage(app, creator.id, imageId);
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/studio/projects/:projectId/site", getSite],
  ["PUT", "/api/studio/projects/:projectId/site", saveSite],
  ["GET", "/api/studio/projects/:projectId/preview", preview],
  ["POST", "/api/studio/projects/:projectId/publish", publish],
  ["POST", "/api/studio/projects/:projectId/unpublish", unpublish],
  ["GET", "/api/studio/creators/:creatorId/images", images],
  ["PUT", "/api/studio/creators/:creatorId/images", upload],
  ["DELETE", "/api/studio/creators/:creatorId/images/:imageId", removeImage]
];

// Project content API (server/content/content.js): the public reads of a project's (or every project's newest)
// published releases, news and shows, and the Studio's list, create, change and delete for every creator, first-party
// included. Writing a draft needs the "site.edit" capability; publishing, unpublishing, changing a live item and
// deleting need "site.publish" (server/creators/roles.js). Anyone else gets "nothing here".
import { json, readJson, fail, id, int } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireProject } from "../creators/projects.js";
import { rolesFor, can } from "../creators/roles.js";
import { getVisibleProject } from "../projects/projects.js";
import { listImages, imageSrc } from "../sites/images.js";
import { EMBED_PROVIDERS } from "../sites/embeds.js";
import { KINDS, cleanContent } from "./clean.js";
import { KIND, projectContent, latestContent, getItem, listItems, createItem, updateItem, deleteItem, studioView, valuesOf } from "./content.js";

const CACHE = { "Cache-Control": "public, max-age=60" };
const BODY = { releases: 24 * 1024, news: 32 * 1024, shows: 4 * 1024 };

async function projectPublic(app, { projectId }) {
  const project = await getVisibleProject(app.db, id(projectId, "projectId"));
  if (!project) fail(404, "not_found", "No project with that id.");
  return json(await projectContent(app.db, project.id), 200, CACHE);
}

async function latest(app) {
  const raw = new URL(app.request.url).searchParams.get("limit");
  const max = raw === null || raw === "" ? 12 : int(Number(raw), "limit", { min: 1, max: 50 });
  return json(await latestContent(app.db, max), 200, CACHE);
}

// Catalog (first-party) projects take part too: content is the same for every creator (docs/creators.md).
const access = (app, projectId, user, capability) => requireProject(app.db, projectId, user, rolesFor(capability), { allowCatalog: true });

async function list(app, { projectId, kind }) {
  const user = await requireUser(app);
  const { project, creator, role } = await access(app, projectId, user, "site.edit");
  const [rows, images] = await Promise.all([listItems(app.db, kind, project.id), kind === "releases" ? listImages(app.db, creator.id) : []]);
  return json({
    items: rows.map((r) => studioView(kind, r)), canPublish: can(role, "site.publish"), max: KIND[kind].max,
    ...(kind === "releases" ? { images: images.filter((i) => i.content_type.startsWith("image/")).map((i) => ({ id: i.id, src: imageSrc(i.id), filename: i.filename })), embedProviders: EMBED_PROVIDERS } : {})
  });
}

async function create(app, { projectId, kind }) {
  const user = await requireUser(app);
  await limit(app, "studio-content", 60, 3600);
  const { project, creator } = await access(app, projectId, user, "site.edit");
  const values = await cleanContent(kind, await readJson(app.request, BODY[kind]), { create: true, ctx: { db: app.db, creatorId: creator.id } });
  if (values.published) fail(400, "invalid_field", "A new item starts as a draft.", { field: "published" });
  const row = await createItem(app.db, kind, project, user, values);
  return json({ item: studioView(kind, row) }, 201);
}

// The item and the caller's access to it; someone else's item looks like no item.
async function own(app, kind, itemId, user, capability) {
  const row = await getItem(app.db, kind, id(itemId, "id"));
  if (!row) fail(404, "not_found", "Nothing here.");
  const { creator, role } = await access(app, row.project_id, user, capability);
  return { row, creator, role };
}

async function change(app, { kind, itemId }) {
  const user = await requireUser(app);
  await limit(app, "studio-content-edit", 600, 3600);
  const { row, creator, role } = await own(app, kind, itemId, user, "site.edit");
  const values = await cleanContent(kind, await readJson(app.request, BODY[kind]), { old: valuesOf(kind, row), ctx: { db: app.db, creatorId: creator.id } });
  // An editor changes drafts only; what is or goes live takes a publisher.
  if ((row.published || values.published !== undefined) && !can(role, "site.publish")) fail(403, "not_allowed", "Only owners, admins and publishers change what is live.");
  return json({ item: studioView(kind, await updateItem(app.db, kind, row, values)) });
}

async function remove(app, { kind, itemId }) {
  const user = await requireUser(app);
  await limit(app, "studio-content-edit", 600, 3600);
  const { row } = await own(app, kind, itemId, user, "site.publish");
  await deleteItem(app.db, kind, row);
  return json({ ok: true });
}

// Literal paths per kind, so these never shadow another Studio route (/api/studio/products/..., say).
const withKind = (kind, handler) => (app, params) => handler(app, { ...params, kind });
export const routes = [
  ["GET", "/api/projects/:projectId/content", projectPublic],
  ["GET", "/api/content/latest", latest],
  ...KINDS.flatMap((kind) => [
    ["GET", `/api/studio/projects/:projectId/${kind}`, withKind(kind, list)],
    ["POST", `/api/studio/projects/:projectId/${kind}`, withKind(kind, create)],
    ["PATCH", `/api/studio/${kind}/:itemId`, withKind(kind, change)],
    ["DELETE", `/api/studio/${kind}/:itemId`, withKind(kind, remove)]
  ])
];

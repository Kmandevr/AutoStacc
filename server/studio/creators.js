// Studio API, creators and projects: any account with a confirmed email can claim a creator name (free, within
// LIMITS) and make projects under it. Names are unique (creators across AutoStacc, projects within their creator,
// ignoring case); renames keep the old address redirecting and the old name held. Only the account's own creators
// answer; anyone else's look like nothing there.
import { json, readJson, str, fail } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS, quotaOf } from "../creators/policy.js";
import { creatorsOfUser, projectsOf, requireCreator, cleanSlug, createCreator, updateCreator, publicCreator, publicProject } from "../creators/creators.js";
import { requireProject, createProject, updateProject, deleteProject } from "../creators/projects.js";
import { republishCreator } from "../sites/publish.js";
import { usageOf } from "../sites/images.js";

const name = (v, field = "name") => str(v, field, { max: 60 });

async function overview(app) {
  const user = await requireUser(app);
  const creators = await creatorsOfUser(app.db, user.id);
  const out = await Promise.all(creators.filter((c) => c.source === "studio").map(async (c) => {
    const [projects, usage] = await Promise.all([projectsOf(app.db, c.id), usageOf(app.db, c.id)]);
    return { ...publicCreator(c), role: c.role, path: `/${c.slug}`, storage: { usedBytes: usage.bytes, files: usage.files, quotaBytes: quotaOf(c) },
      projects: projects.map((p) => ({ ...publicProject(p), path: `/${c.slug}/${p.slug}` })) };
  }));
  return json({ creators: out, limits: LIMITS });
}

async function newCreator(app) {
  const user = await requireUser(app);
  await limit(app, "studio-create", 10, 3600);
  const body = await readJson(app.request);
  const creator = await createCreator(app.db, user, { slug: cleanSlug(body.slug, { creator: true }), name: name(body.name) });
  return json({ creator: { ...publicCreator(creator), path: `/${creator.slug}` } }, 201);
}

async function editCreator(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-rename", 20, 3600);
  const { creator } = await requireCreator(app.db, creatorId, user, ["owner"]);
  const body = await readJson(app.request);
  const slug = body.slug !== undefined ? cleanSlug(body.slug, { creator: true }) : undefined;
  const updated = await updateCreator(app.db, creator, { slug, name: body.name !== undefined ? name(body.name) : undefined });
  // Published pages carry the creator's address and name, so they are rendered again.
  if (updated.slug !== creator.slug || updated.name !== creator.name) await republishCreator(app, creator.id);
  return json({ creator: { ...publicCreator(updated), path: `/${updated.slug}` } });
}

async function newProject(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-create", 10, 3600);
  const { creator } = await requireCreator(app.db, creatorId, user);
  const body = await readJson(app.request);
  const project = await createProject(app.db, creator, user, { slug: cleanSlug(body.slug), name: name(body.name) });
  return json({ project: { ...publicProject(project), path: `/${creator.slug}/${project.slug}` } }, 201);
}

async function editProject(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-rename", 20, 3600);
  const { project, creator } = await requireProject(app.db, projectId, user);
  const body = await readJson(app.request);
  const slug = body.slug !== undefined ? cleanSlug(body.slug) : undefined;
  const updated = await updateProject(app.db, project, { slug, name: body.name !== undefined ? name(body.name) : undefined });
  if (updated.published && (updated.slug !== project.slug || updated.name !== project.name)) await republishCreator(app, creator.id);
  return json({ project: { ...publicProject(updated), path: `/${creator.slug}/${updated.slug}` } });
}

async function removeProject(app, { projectId }) {
  const user = await requireUser(app);
  const { project } = await requireProject(app.db, projectId, user, ["owner"]);
  const body = await readJson(app.request);
  if (body.confirm !== project.slug) fail(400, "confirm", "Type the project's address name to delete it.");
  await deleteProject(app.db, project);
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/studio", overview],
  ["POST", "/api/studio/creators", newCreator],
  ["PATCH", "/api/studio/creators/:creatorId", editCreator],
  ["POST", "/api/studio/creators/:creatorId/projects", newProject],
  ["PATCH", "/api/studio/projects/:projectId", editProject],
  ["DELETE", "/api/studio/projects/:projectId", removeProject]
];

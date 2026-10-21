// Studio API, creators and projects: any account with a confirmed email can claim a creator name (free, within
// LIMITS) and make projects under it. Names are unique (creators across AutoStacc, projects within their creator,
// ignoring case); renames keep the old address redirecting and the old name held. Only the account's own creators
// answer; anyone else's look like nothing there. First-party creators (owner, 2026-10-21) are listed for their members,
// limited to products and content (their pages are hand-written: no renames, deletes, new projects, builder or
// profile site); their owner is the verified account the FIRST_PARTY_OWNERS secret names (#172).
import { json, readJson, str, fail } from "../lib/http.js";
import { isOpen } from "../settings/settings.js";
import { requireUser } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS, quotaOf } from "../creators/policy.js";
import { rolesFor, capabilitiesOf } from "../creators/roles.js";
import { creatorsOfUser, projectsOf, requireCreator, cleanSlug, createCreator, updateCreator, publicCreator, publicProject, assignFirstPartyOwner } from "../creators/creators.js";
import { requireProject, createProject, updateProject, deleteProject } from "../creators/projects.js";
import { republishCreator } from "../sites/publish.js";
import { storageUsed } from "../creators/storage.js";

const name = (v, field = "name") => str(v, field, { max: 60 });

// What a member of a first-party creator may do here: its products and its projects' content only (the server refuses
// the rest for catalog creators anyway; this keeps the browser from offering it).
const FIRST_PARTY_CAPABILITIES = ["site.edit", "site.publish", "products"];
const capabilitiesIn = (c) => capabilitiesOf(c.role).filter((cap) => c.source === "studio" || FIRST_PARTY_CAPABILITIES.includes(cap));

// The account FIRST_PARTY_OWNERS names for a first-party creator becomes its owner when it opens the Studio: only once
// its email is confirmed, never while it is being impersonated (the isAdmin rule), and each change is audited.
async function ensureFirstPartyOwner(app, user) {
  const ids = !user.impersonated && user.emailVerified && app.config.firstPartyOwners.get(String(user.email).toLowerCase());
  if (!ids) return;
  for (const id of await assignFirstPartyOwner(app.db, ids, user.id)) await audit(app, "creator.owner_assigned", { targetType: "creator", targetId: id });
}

async function overview(app) {
  const user = await requireUser(app);
  await ensureFirstPartyOwner(app, user);
  const creators = await creatorsOfUser(app.db, user.id);
  const out = await Promise.all(creators.filter((c) => c.source === "studio" || c.source === "catalog").map(async (c) => {
    const [projects, used] = await Promise.all([projectsOf(app.db, c.id), storageUsed(app.db, c.id)]);
    return { ...publicCreator(c), firstParty: c.source === "catalog", role: c.role, capabilities: capabilitiesIn(c), path: `/${c.slug}`,
      storage: { usedBytes: used, quotaBytes: quotaOf(c) }, projects: projects.map((p) => ({ ...publicProject(p), path: `/${c.slug}/${p.slug}` })) };
  }));
  return json({ creators: out, limits: LIMITS });
}

async function newCreator(app) {
  const user = await requireUser(app);
  await limit(app, "studio-create", 10, 3600);
  if (!(await isOpen(app.db, "creator_signups"))) fail(503, "creator_signups_closed", "New creator names are closed for now. Try again later.");
  const body = await readJson(app.request);
  const creator = await createCreator(app.db, user, { slug: cleanSlug(body.slug, { creator: true }), name: name(body.name) });
  return json({ creator: { ...publicCreator(creator), path: `/${creator.slug}` } }, 201);
}

async function editCreator(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-rename", 20, 3600);
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("money"));
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
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("projects"));
  const body = await readJson(app.request);
  const project = await createProject(app.db, creator, user, { slug: cleanSlug(body.slug), name: name(body.name) });
  return json({ project: { ...publicProject(project), path: `/${creator.slug}/${project.slug}` } }, 201);
}

async function editProject(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-rename", 20, 3600);
  const { project, creator } = await requireProject(app.db, projectId, user, rolesFor("projects"));
  const body = await readJson(app.request);
  const slug = body.slug !== undefined ? cleanSlug(body.slug) : undefined;
  const updated = await updateProject(app.db, project, { slug, name: body.name !== undefined ? name(body.name) : undefined });
  if (updated.published && (updated.slug !== project.slug || updated.name !== project.name)) await republishCreator(app, creator.id);
  return json({ project: { ...publicProject(updated), path: `/${creator.slug}/${updated.slug}` } });
}

async function removeProject(app, { projectId }) {
  const user = await requireUser(app);
  const { project } = await requireProject(app.db, projectId, user, rolesFor("money"));
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

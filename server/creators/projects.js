// Studio projects (D1 projects with source 'studio', and their project_sites row): create, rename, delete, publish
// state, and the access check for an account that may change one. Catalog projects (data/projects.js) are never
// renamed, deleted or built here; only routes for their products and content opt in to them ({ allowCatalog: true }).
import { stmt, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS, limitOf } from "./policy.js";
import { getProject, requireCreator } from "./creators.js";
import { projectSlugFree, holdStmt, taken, isUnique, holdsOf, MAX_HOLDS } from "./holds.js";

// A Studio project (or, with allowCatalog, a first-party one) and its creator, for an account that may change it.
export async function requireProject(db, projectId, user, roles, { allowCatalog = false } = {}) {
  const project = typeof projectId === "string" ? await getProject(db, projectId) : null;
  if (!project || !(project.source === "studio" || (allowCatalog && project.source === "catalog"))) fail(404, "not_found", "Nothing here.");
  const { creator, role } = await requireCreator(db, project.creator_id, user, roles, { allowCatalog });
  return { project, creator, role };
}

// The limit (none for a first-party creator) is checked inside the insert itself, so parallel requests can't each add one more project.
export async function createProject(db, creator, user, { slug, name }) {
  if (!(await projectSlugFree(db, creator.id, slug))) taken();
  const id = newId("prj");
  const t = now();
  let res;
  try {
    [res] = await db.batch([
      stmt(db, `INSERT INTO projects (id, name, features, published, created_at, updated_at, creator_id, slug, source, created_by)
        SELECT ?, ?, '[]', 0, ?, ?, ?, ?, 'studio', ?
        WHERE (SELECT COUNT(*) FROM projects WHERE creator_id = ? AND deleted_at IS NULL) < ?`, id, name, t, t, creator.id, slug, user.id, creator.id, limitOf(creator, "projectsPerCreator")),
      stmt(db, "INSERT INTO project_sites (project_id, draft, draft_updated_at) SELECT ?, '{}', ? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)", id, t, id)
    ]);
  } catch (e) {
    if (isUnique(e)) taken();
    throw e;
  }
  if (!res.meta.changes) fail(409, "limit_reached", `A creator can have up to ${LIMITS.projectsPerCreator} projects.`);
  return getProject(db, id);
}

export async function updateProject(db, project, { slug, name }) {
  const t = now();
  const writes = [];
  if (slug && slug !== project.slug) {
    const [free, holds] = await Promise.all([projectSlugFree(db, project.creator_id, slug, project.id), holdsOf(db, "project", project.id)]);
    if (!free) taken();
    if (holds >= MAX_HOLDS) fail(429, "rename_limit", "This project has been renamed too often lately. Try again later.");
    writes.push(...holdStmt(db, "project", project.creator_id, project.slug, slug, project.id));
  }
  writes.push(stmt(db, "UPDATE projects SET slug = ?, name = ?, updated_at = ? WHERE id = ?", slug || project.slug, name || project.name, t, project.id));
  try {
    await db.batch(writes);
  } catch (e) {
    if (isUnique(e)) taken();
    throw e;
  }
  return getProject(db, project.id);
}

// Deleted projects keep their row (orders may point at them later) but free their slug and leave the site.
export const deleteProject = (db, project) => db.batch([
  stmt(db, "UPDATE projects SET published = 0, deleted_at = ?, updated_at = ? WHERE id = ?", now(), now(), project.id),
  stmt(db, "DELETE FROM site_pages WHERE project_id = ?", project.id),
  // Its products come off sale; people who already bought them keep their files.
  stmt(db, "UPDATE products SET published = 0, updated_at = ? WHERE project_id = ? AND source = 'studio'", now(), project.id)
]);

export const setProjectPublished = (db, projectId, published) =>
  stmt(db, "UPDATE projects SET published = ?, updated_at = ? WHERE id = ?", published ? 1 : 0, now(), projectId);


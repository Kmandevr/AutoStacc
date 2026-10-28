// Projects the public can see: AutoStacc's own (synced from data/projects.js by db/catalog.sql) and published Studio
// projects of active creators (server/creators/), the latter marked unverified until AutoStacc trusts their creator.
// The directory, follows and Auto-Stacc cover both (owner decision, docs/decisions.md 2026-10-09); polls still need a
// project to opt in through its features, which only data/projects.js sets.
import { storedTags } from "../lib/tags.js";
import { all, first, parseJson } from "../lib/db.js";

const FROM = "projects p LEFT JOIN creators c ON c.id = p.creator_id";
export const VISIBLE = "p.published = 1 AND p.deleted_at IS NULL AND (p.source = 'catalog' OR (c.status = 'active' AND c.deleted_at IS NULL))";
const COLS = "p.*, c.slug AS creator_slug, c.name AS creator_name, c.trusted AS creator_trusted";

export const getVisibleProject = (db, id) => first(db, `SELECT ${COLS} FROM ${FROM} WHERE p.id = ? AND ${VISIBLE}`, id);
export const listVisibleProjects = (db) => all(db, `SELECT ${COLS} FROM ${FROM} WHERE ${VISIBLE} ORDER BY p.name`);

// Does this project use a platform feature ("polls", "relationships", ...)? Projects opt in via data/projects.js.
export const usesFeature = (project, feature) => Boolean(project) && parseJson(project.features, []).includes(feature);

// Where a project lives: /<creator>/<project> (first-party projects' slug is their id).
export const projectAddress = (p) => (p.creator_slug ? `/${p.creator_slug}/${p.slug || p.id}` : `/${p.id}`);

export const publicProject = (p) => ({
  id: p.id, name: p.name, features: parseJson(p.features, []), source: p.source || "catalog", path: projectAddress(p),
  creator: p.creator_name || null, verified: p.source !== "studio" || Boolean(p.creator_trusted), tags: storedTags(p.tags)
});

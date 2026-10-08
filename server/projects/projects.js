// Projects as the store sees them: synced from data/projects.js by db/catalog.sql. Written only by that sync.
// The directory, follows and polls cover first-party projects only; Studio projects (server/creators/) join them once
// their creators can sell.
import { all, first, parseJson } from "../lib/db.js";

const VISIBLE = "published = 1 AND deleted_at IS NULL AND source = 'catalog'";

export const getVisibleProject = (db, id) => first(db, `SELECT * FROM projects WHERE id = ? AND ${VISIBLE}`, id);
export const listVisibleProjects = (db) => all(db, `SELECT * FROM projects WHERE ${VISIBLE} ORDER BY name`);

// Does this project use a platform feature ("polls", "relationships", ...)? Projects opt in via data/projects.js.
export const usesFeature = (project, feature) => Boolean(project) && parseJson(project.features, []).includes(feature);

export const publicProject = (p) => ({ id: p.id, name: p.name, features: parseJson(p.features, []) });

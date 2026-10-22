// The Studio switch for a project's community space (owner, 2026-10-16; docs/community.md, "Spaces and channels"):
// PUT /api/community/projects/:projectId/space { on } adds or removes the "community" feature on the project and makes
// its official space (core/project-space.js) or closes it read-only; GET says where it stands. Only the creator's owner
// and admins (the "community.moderate" role set). First-party projects switch it on in data/projects.js instead and their
// space is made on the first visit. Its own switch (community.projectSpaces): off, creators can't change it.
import { json, readJson, fail, id } from "../../../lib/http.js";
import { run, first, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requireProject } from "../../../creators/projects.js";
import { rolesFor } from "../../../creators/roles.js";
import { openProjectSpace, closeProjectSpace } from "../../core/project-space.js";
import { getSpace } from "../../core/posting.js";
import { purge } from "../../core/purge.js";

const NO_STORE = { "Cache-Control": "no-store" };
const featuresOf = (project) => { try { return JSON.parse(project.features || "[]"); } catch { return []; } };

async function load(app, { projectId }, write) {
  const user = await requireUser(app);
  if (write) await limit(app, "community-project-space", 20, 3600, { by: user.id });
  return { user, ...(await requireProject(app.db, id(projectId, "projectId"), user, rolesFor("community.moderate"), { allowCatalog: true })) };
}

async function read(app, params) {
  const { project } = await load(app, params, false);
  const space = await first(app.db, "SELECT id, slug, state FROM community_spaces WHERE project_id = ?", project.id);
  return json({ on: featuresOf(project).includes("community"), space: space ? { slug: space.slug, state: space.state } : null }, 200, NO_STORE);
}

async function change(app, params) {
  const { project } = await load(app, params, true);
  const body = await readJson(app.request);
  if (typeof body.on !== "boolean") fail(400, "invalid_field", "Say whether the community is on.", { field: "on" });
  if (project.source === "catalog") fail(409, "first_party", "A first-party project's community is switched on in its data file.");
  const features = featuresOf(project).filter((f) => f !== "community");
  if (body.on) {
    // The space first: if it can't be made nothing has changed.
    if (!await openProjectSpace(app.db, project.id)) fail(409, "name_taken", "A community space couldn't be made for this project right now. Try renaming the project.");
    features.push("community");
  }
  await run(app.db, "UPDATE projects SET features = ?, updated_at = ? WHERE id = ?", JSON.stringify(features), now(), project.id);
  if (!body.on) await closeProjectSpace(app.db, project.id);
  const space = await first(app.db, "SELECT id FROM community_spaces WHERE project_id = ?", project.id);
  if (space) purge(app, { space: await getSpace(app.db, space.id) });
  return json({ on: body.on });
}

export default {
  name: "projectspaces",
  switch: "community.projectSpaces",
  routes: [["GET", "/api/community/projects/:projectId/space", read], ["PUT", "/api/community/projects/:projectId/space", change]]
};

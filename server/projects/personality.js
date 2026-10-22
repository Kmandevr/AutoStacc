// A project's personality on AutoStacc's cards (owner, 2026-10-22): the card stays in AutoStacc's glass look and the
// project adds an accent (one of AutoStacc's track colours) and a small signature animation, chosen from presets in
// the Studio by the project's team (GET/PUT /api/studio/projects/:projectId/personality). "auto" leaves it to the
// page (the project's own look and data, js/project-card.js). Presets only: nothing a creator writes reaches a page.
import { json, readJson, fail, id } from "../lib/http.js";
import { all, first, run, now } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { rolesFor } from "../creators/roles.js";
import { requireProject } from "../creators/projects.js";

export const ACCENTS = ["auto", "teal", "amber", "coral", "lime", "violet"];
export const MOTIONS = ["auto", "pulse", "glitch", "wave", "none"];

/** Every chosen personality, by project id, for the browse answers: Map(id -> { accent, motion }). */
export async function personalities(db) {
  const rows = await all(db, "SELECT project_id, accent, motion FROM project_personality");
  return new Map(rows.map((r) => [r.project_id, { accent: r.accent, motion: r.motion }]));
}

async function get(app, { projectId }) {
  const user = await requireUser(app);
  const { project } = await requireProject(app.db, id(projectId, "projectId"), user, rolesFor("projects"));
  const row = await first(app.db, "SELECT accent, motion FROM project_personality WHERE project_id = ?", project.id);
  return json({ accent: row ? row.accent : "auto", motion: row ? row.motion : "auto", accents: ACCENTS, motions: MOTIONS }, 200, { "Cache-Control": "no-store" });
}

async function put(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-personality", 30, 3600);
  const { project } = await requireProject(app.db, id(projectId, "projectId"), user, rolesFor("projects"));
  const body = await readJson(app.request);
  const accent = String(body.accent || "");
  const motion = String(body.motion || "");
  if (!ACCENTS.includes(accent)) fail(400, "invalid_field", "Pick one of the accent colours.", { field: "accent" });
  if (!MOTIONS.includes(motion)) fail(400, "invalid_field", "Pick one of the animations.", { field: "motion" });
  await run(app.db, `INSERT INTO project_personality (project_id, accent, motion, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET accent = excluded.accent, motion = excluded.motion, updated_at = excluded.updated_at`, project.id, accent, motion, now());
  return json({ accent, motion });
}

export const routes = [
  ["GET", "/api/studio/projects/:projectId/personality", get],
  ["PUT", "/api/studio/projects/:projectId/personality", put]
];

// Projects and follows: the project directory and its browser, and following a project with optional Auto-Stacc (free products of
// that project are added to the account's library automatically, now and whenever the library opens).
import { json, fail, readJson, id } from "../lib/http.js";
import { currentUser, requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { getVisibleProject, listVisibleProjects, publicProject } from "./projects.js";
import { listFollows, setFollow, removeFollow, publicFollow } from "./follows.js";
import { autoStacc } from "../entitlements/autostacc.js";
import { SELLING } from "../creators/policy.js";
import { parseProjectFilters, projectEntries, browse } from "./browse.js";

// Published projects, plus this account's follows when signed in with a verified email (null otherwise, with
// signedIn telling a signed-in but unconfirmed account apart from a visitor).
async function projects(app) {
  const [rows, user] = await Promise.all([listVisibleProjects(app.db), currentUser(app)]);
  const visible = new Set(rows.map((p) => p.id));
  const follows = user && user.emailVerified ? (await listFollows(app.db, user.id)).filter((f) => visible.has(f.project_id)).map(publicFollow) : null;
  return json({ projects: rows.map(publicProject), signedIn: Boolean(user), follows });
}

// The projects browser: filters, counts, sort and a page of projects (server/projects/browse.js). Never cached: the
// answer depends on who is asking (follow state), and a signed-out copy must not outlive logging in.
async function browsePage(app) {
  await limit(app, "browse", 120, 60);
  const params = new URL(app.request.url).searchParams;
  const f = parseProjectFilters(params, SELLING.kinds);
  const user = await currentUser(app);
  const userId = user && user.emailVerified ? user.id : null;
  const entries = await projectEntries(app.db, { userId });
  return json({ ...browse(entries, f, { signedIn: Boolean(userId) }), signedIn: Boolean(user), canFollow: Boolean(userId) }, 200,
    { "Cache-Control": "private, no-store" });
}

async function follow(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "follow", 30, 60);
  const body = await readJson(app.request);
  if (body.autoStacc !== undefined && typeof body.autoStacc !== "boolean") fail(400, "invalid_field", "autoStacc must be true or false.");
  const project = await getVisibleProject(app.db, id(projectId, "projectId"));
  if (!project) fail(404, "not_found", "No project with that id.");
  await setFollow(app.db, user.id, project.id, body.autoStacc === true);
  const staccd = body.autoStacc ? await autoStacc(app.db, user) : 0;
  return json({ ok: true, follow: { projectId: project.id, autoStacc: body.autoStacc === true }, staccd });
}

// Unfollowing keeps whatever was already added to the library.
async function unfollow(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "follow", 30, 60);
  await removeFollow(app.db, user.id, id(projectId, "projectId"));
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/projects", projects],
  ["GET", "/api/projects/browse", browsePage],
  ["PUT", "/api/follows/:projectId", follow],
  ["DELETE", "/api/follows/:projectId", unfollow]
];

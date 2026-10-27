// Communities anyone can start and run, with no creator needed (owner, 2026-10-27; docs/community.md, "Starting
// communities" and "Who runs a space"): starting one (start.js), its team of founder and moderators, handing it over and
// archiving it (team.js). Its own switch (community.spaces): off, these routes are 404 and the spaces already started
// stay as they are, run by their teams through the other features.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { currentUser, requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { all } from "../../../lib/db.js";
import { getMember } from "../../core/members.js";
import { getSpace } from "../../core/posting.js";
import { spacePath } from "../../core/render-parts.js";
import { purge } from "../../core/purge.js";
import { startSpace, startAllowance, DEFAULT_CHANNELS } from "./start.js";
import { teamOf, addModerator, removeModerator, handOver, setArchived } from "./team.js";

const NO_STORE = { "Cache-Control": "no-store" };
// Account ids (Better Auth's) have capitals, which id() doesn't take.
const userIdOf = (v, name) => str(v, name, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ });
const spaceOf = async (app, spaceId) => {
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  return space;
};

// What the start form needs: whether the visitor can start one now, and what's missing if not.
async function startInfo(app) {
  const user = await currentUser(app);
  if (!user) return json({ signedIn: false, defaults: { channels: DEFAULT_CHANNELS } }, 200, NO_STORE);
  const member = await getMember(app.db, user.id);
  return json({ signedIn: true, emailVerified: Boolean(user.emailVerified), member: Boolean(member), ...(await startAllowance(app, user)),
    defaults: { channels: DEFAULT_CHANNELS } }, 200, NO_STORE);
}

async function start(app) {
  const user = await requireUser(app);
  await limit(app, "community-start", 5, 86400, { by: user.id });
  const body = await readJson(app.request, 16 * 1024);
  const space = await startSpace(app, user, body);
  purge(app, {});
  return json({ space: { ...space, path: spacePath({ ...space, kind: "community" }), manage: `${spacePath({ ...space, kind: "community" })}/manage` } }, 201);
}

// The spaces the visitor helps run, for their home and the community's "Spaces you run".
async function mine(app) {
  const user = await requireUser(app);
  const rows = await all(app.db, `SELECT s.id, s.slug, s.name, s.kind, s.state, r.role FROM community_space_roles r JOIN community_spaces s ON s.id = r.space_id
    WHERE r.user_id = ? ORDER BY s.name COLLATE NOCASE LIMIT 100`, user.id);
  return json({ spaces: rows.map((s) => ({ id: s.id, name: s.name, role: s.role, state: s.state, path: spacePath(s), manage: `${spacePath(s)}/manage` })) }, 200, NO_STORE);
}

const team = async (app, { spaceId }) => json(await teamOf(app, await requireUser(app), await spaceOf(app, spaceId)), 200, NO_STORE);

async function writer(app) {
  const user = await requireUser(app);
  await limit(app, "community-team", 30, 600, { by: user.id });
  return user;
}

async function appoint(app, { spaceId }) {
  const user = await writer(app);
  const body = await readJson(app.request);
  const added = await addModerator(app, user, await spaceOf(app, spaceId), str(body.name, "name", { max: 60 }));
  return json({ moderator: added }, 201);
}

async function dismiss(app, { spaceId, userId }) {
  const user = await writer(app);
  await removeModerator(app, user, await spaceOf(app, spaceId), userIdOf(userId, "userId"));
  return json({ ok: true });
}

async function handTo(app, { spaceId }) {
  const user = await writer(app);
  await handOver(app, user, await spaceOf(app, spaceId), userIdOf((await readJson(app.request)).userId, "userId"));
  return json({ ok: true });
}

async function archive(app, { spaceId }) {
  const user = await writer(app);
  const body = await readJson(app.request);
  if (typeof body.archived !== "boolean") fail(400, "invalid_field", "Archive or reopen.", { field: "archived" });
  const space = await setArchived(app, user, id(spaceId, "spaceId"), body.archived);
  purge(app, { space });
  return json({ state: space.state });
}

export default {
  name: "spaces",
  switch: "community.spaces",
  routes: [
    ["GET", "/api/community/start", startInfo],
    ["POST", "/api/community/spaces", start],
    ["GET", "/api/community/my-spaces", mine],
    ["GET", "/api/community/spaces/:spaceId/team", team],
    ["POST", "/api/community/spaces/:spaceId/moderators", appoint],
    ["DELETE", "/api/community/spaces/:spaceId/moderators/:userId", dismiss],
    ["POST", "/api/community/spaces/:spaceId/hand-over", handTo],
    ["PUT", "/api/community/spaces/:spaceId/archived", archive]
  ]
};

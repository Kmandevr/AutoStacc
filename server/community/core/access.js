// Who may do what in a space (docs/community.md, "Rules" and "Who enforces what"), checked on the server for every
// write. A space's team: for AutoStacc's own space, AutoStacc's admins; for a project space, the creator's members whose
// role has community.moderate; for a community, its founder and moderators. Posting needs a confirmed email (requireUser),
// a community name with the 16+ confirmation, no community suspension, no ban from the space, and an open space.
import { first } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { isAdmin } from "../../auth/session.js";
import { roleOf } from "../../creators/creators.js";
import { can } from "../../creators/roles.js";
import { getMember } from "./members.js";

export async function isTeam(app, user, space) {
  if (!user) return false;
  if (space.kind === "platform") return isAdmin(app, user);
  if (space.kind === "project") {
    const project = await first(app.db, "SELECT creator_id FROM projects WHERE id = ?", space.project_id || space.projectId);
    const role = project && await roleOf(app.db, project.creator_id, user.id);
    return Boolean(role && can(role, "community.moderate"));
  }
  return Boolean(await first(app.db, "SELECT 1 AS n FROM community_space_roles WHERE space_id = ? AND user_id = ?", space.id, user.id));
}

// Whether this person may post an Update (an official announcement) in a space: the platform's admins, a community's
// founder and moderators, and for a project space those whose role on the creator's team has the "community.update"
// capability (publishers included).
export async function mayPublishUpdate(app, user, space) {
  if (!user) return false;
  if (space.kind === "project") {
    const project = await first(app.db, "SELECT creator_id FROM projects WHERE id = ?", space.project_id || space.projectId);
    const role = project && await roleOf(app.db, project.creator_id, user.id);
    return Boolean(role && can(role, "community.update"));
  }
  return isTeam(app, user, space);
}

const active = (until) => !until || Date.parse(until) > Date.now();

// The member, or a refusal saying what's missing. space: a community_spaces row.
export async function requirePoster(app, user, space) {
  const member = await getMember(app.db, user.id);
  if (!member) fail(403, "not_a_member", "Pick your community name and confirm you're 16 or older first.");
  const suspended = await first(app.db, "SELECT until FROM community_suspensions WHERE user_id = ?", user.id);
  if (suspended && active(suspended.until)) fail(403, "suspended", "Your account can't post in the community right now.");
  const ban = await first(app.db, "SELECT until FROM community_space_bans WHERE space_id = ? AND user_id = ?", space.id, user.id);
  if (ban && active(ban.until)) fail(403, "banned", "You can't post in this space.");
  if (space.state !== "open") fail(403, "space_read_only", "This space is read-only for now.");
  return member;
}

// A space's team member who may act for it now (moderation and reports): anyone else, or an unknown space, finds
// nothing there. A suspended account or an archived space can't act.
export async function requireTeam(app, user, space) {
  if (!space || !(await isTeam(app, user, space))) fail(404, "not_found", "Not found.");
  if (space.state === "archived") fail(403, "space_archived", "This space is archived.");
  const suspended = await first(app.db, "SELECT until FROM community_suspensions WHERE user_id = ?", user.id);
  if (suspended && active(suspended.until)) fail(403, "suspended", "Your account can't act in the community right now.");
  return space;
}

// Whether someone (by id) is on a space's team, for refusing to ban or report-hide a team member.
export async function isTeamMember(app, userId, space) {
  const user = userId && await first(app.db, 'SELECT id, email, role, emailVerified FROM "user" WHERE id = ?', userId);
  return Boolean(user && await isTeam(app, { ...user, emailVerified: Boolean(user.emailVerified) }, space));
}

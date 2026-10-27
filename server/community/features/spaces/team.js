// A space's team (owner, 2026-10-27; docs/community.md, "Who runs a space"): its founder (communities) and moderators,
// separate from AutoStacc's admins and from a creator's Studio team. Managers (core/access.js isManager: the founder,
// a project's creator owner and admins, AutoStacc's admins for its own space) appoint and remove moderators by
// username; a moderator may step down; only the founder hands a community over (to one of its moderators, who becomes
// founder while the old founder stays a moderator) or archives and reopens it. Moderators get moderation only, never
// settings, the team or anything in the Studio. Every change is logged in the space's team log.
import { fail } from "../../../lib/http.js";
import { first, all, stmt, now, guardStmt, isGuardFailure } from "../../../lib/db.js";
import { getSetting } from "../../../settings/settings.js";
import { requireTeam, requireManager, spaceRole, teamRoleOf } from "../../core/access.js";
import { nameKey, cleanName } from "../../core/names.js";
import { logStmts } from "../../core/moderate.js";
import { getSpace } from "../../core/posting.js";
import { OWNED } from "./start.js";

export const MAX_MODERATORS = 25;
const SINCE = "r.created_at AS since";

export async function teamOf(app, user, space) {
  // An archived community's founder still sees its team, to reopen it.
  if (!(space.state === "archived" && (await spaceRole(app, user.id, space)) === "founder")) await requireTeam(app, user, space);
  const rows = await all(app.db, `SELECT r.user_id AS userId, r.role, ${SINCE}, m.display_name AS name FROM community_space_roles r
    LEFT JOIN community_members m ON m.user_id = r.user_id WHERE r.space_id = ? ORDER BY CASE r.role WHEN 'founder' THEN 0 ELSE 1 END, r.created_at`, space.id);
  const role = await teamRoleOf(app, user, space);
  return {
    // Who manages it besides a founder: a project's creator team (in the Studio) or AutoStacc's admins.
    managedBy: space.kind === "community" ? "founder" : space.kind === "project" ? "creator" : "autostacc",
    you: { userId: user.id, role, founder: (await spaceRole(app, user.id, space)) === "founder" },
    team: rows.map((r) => ({ userId: r.userId, role: r.role, name: r.name || "Deleted user", since: r.since })),
    maxModerators: MAX_MODERATORS
  };
}

export async function addModerator(app, user, space, rawName) {
  await requireManager(app, user, space);
  const name = cleanName(rawName);
  const member = name && await first(app.db, "SELECT user_id AS userId, display_name AS name FROM community_members WHERE name_key = ?", nameKey(name));
  if (!member) fail(404, "no_such_member", "No one uses that username. Check the spelling.", { field: "name" });
  if (await spaceRole(app, member.userId, space)) fail(409, "already_team", `${member.name} is already on this space's team.`, { field: "name" });
  const ban = await first(app.db, "SELECT until FROM community_space_bans WHERE space_id = ? AND user_id = ?", space.id, member.userId);
  if (ban && (!ban.until || Date.parse(ban.until) > Date.now())) fail(409, "banned", "That person is banned from this space. Lift the ban first.", { field: "name" });
  const suspended = await first(app.db, "SELECT until FROM community_suspensions WHERE user_id = ?", member.userId);
  if (suspended && (!suspended.until || Date.parse(suspended.until) > Date.now())) fail(409, "suspended", "That account can't take part in the community right now.", { field: "name" });
  const at = now();
  try {
    await app.db.batch([
      guardStmt(app.db, "(SELECT COUNT(*) FROM community_space_roles WHERE space_id = ? AND role = 'moderator') < ?", space.id, MAX_MODERATORS),
      stmt(app.db, "INSERT INTO community_space_roles (space_id, user_id, role, created_at) VALUES (?, ?, 'moderator', ?)", space.id, member.userId, at),
      ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "team.add_moderator", targetType: "user", targetId: member.userId }, at)
    ]);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "too_many", `A space can have up to ${MAX_MODERATORS} moderators.`);
    if (/UNIQUE|PRIMARY/i.test(String((e && e.message) || e))) fail(409, "already_team", `${member.name} is already on this space's team.`);
    throw e;
  }
  return { userId: member.userId, name: member.name };
}

// A manager removes a moderator, or a moderator steps down. The founder is never removed here (hand it over first).
export async function removeModerator(app, user, space, userId) {
  await requireTeam(app, user, space);
  const role = await spaceRole(app, userId, space);
  if (role !== "moderator") fail(404, "not_found", "That person isn't a moderator here.");
  if (userId !== user.id) await requireManager(app, user, space);
  const at = now();
  await app.db.batch([
    stmt(app.db, "DELETE FROM community_space_roles WHERE space_id = ? AND user_id = ? AND role = 'moderator'", space.id, userId),
    ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: userId === user.id ? "team.step_down" : "team.remove_moderator", targetType: "user", targetId: userId }, at)
  ]);
}

const requireFounder = async (app, user, space) => {
  if (!space || space.kind !== "community" || (await spaceRole(app, user.id, space)) !== "founder") fail(404, "not_found", "Not found.");
  return space;
};

// The founder hands the community to one of its moderators; checked inside the write, so it happens once.
export async function handOver(app, user, space, toUserId) {
  await requireTeam(app, user, space);
  await requireFounder(app, user, space);
  if ((await spaceRole(app, toUserId, space)) !== "moderator") fail(400, "invalid_field", "Hand it to one of this space's moderators.", { field: "userId" });
  const at = now();
  try {
    await app.db.batch([
      guardStmt(app.db, "EXISTS (SELECT 1 FROM community_space_roles WHERE space_id = ? AND user_id = ? AND role = 'founder')", space.id, user.id),
      stmt(app.db, "UPDATE community_space_roles SET role = 'moderator' WHERE space_id = ? AND user_id = ?", space.id, user.id),
      stmt(app.db, "UPDATE community_space_roles SET role = 'founder' WHERE space_id = ? AND user_id = ?", space.id, toUserId),
      stmt(app.db, "UPDATE community_spaces SET founder_user_id = ? WHERE id = ?", toUserId, space.id),
      ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "team.hand_over", targetType: "user", targetId: toUserId }, at)
    ]);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "not_founder", "You're no longer this space's founder.");
    throw e;
  }
}

// Archived: readable, nothing new, no team actions; it frees a place under the cap. Reopening takes one back.
export async function setArchived(app, user, spaceId, archived) {
  const space = await requireFounder(app, user, await getSpace(app.db, spaceId));
  const at = now();
  if (archived) {
    if (space.state === "archived") return space;
    await app.db.batch([
      stmt(app.db, "UPDATE community_spaces SET state = 'archived', state_reason = 'founder' WHERE id = ?", space.id),
      ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "space.archive", targetType: "space", targetId: space.id }, at)
    ]);
  } else {
    if (space.state !== "archived" || space.state_reason !== "founder") fail(409, "not_archived", "Only a space its founder archived can be reopened here.");
    const cap = Number(await getSetting(app.db, "community_space_cap"));
    try {
      await app.db.batch([
        guardStmt(app.db, `(${OWNED}) < ?`, user.id, cap),
        stmt(app.db, "UPDATE community_spaces SET state = 'open', state_reason = NULL, last_team_activity_at = ? WHERE id = ?", at, space.id),
        ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "space.reopen", targetType: "space", targetId: space.id }, at)
      ]);
    } catch (e) {
      if (isGuardFailure(e)) fail(409, "space_cap", `You run ${cap} open communities already. Archive one first.`);
      throw e;
    }
  }
  return getSpace(app.db, space.id);
}

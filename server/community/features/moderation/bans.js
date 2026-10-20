// Banning someone from one space (docs/community.md, "Who enforces what"): for a set number of days or until lifted,
// always with a reason, never a member of the space's team or yourself. People are named by their community name,
// so the browser never sees account ids. A ban stops posting, editing, boosting and Helpful in that space only
// (core/access.js requirePoster); reading stays open. Bans are limited to 20 an hour per moderator.
import { json, readJson, fail, id, str, int } from "../../../lib/http.js";
import { first, all, stmt } from "../../../lib/db.js";
import { limit } from "../../../lib/ratelimit.js";
import { isTeamMember } from "../../core/access.js";
import { nameKey } from "../../core/names.js";
import { logStmts } from "../../core/moderate.js";
import { moderator, readReason } from "./actions.js";

const MAX_DAYS = 3650;

async function memberNamed(db, body) {
  const member = await first(db, "SELECT user_id, display_name FROM community_members WHERE name_key = ?", nameKey(str(body.name, "name", { max: 60 })));
  if (!member) fail(404, "no_member", "Nobody in the community has that name.");
  return member;
}

async function ban(app, { spaceId }) {
  const { user, space } = await moderator(app, id(spaceId, "spaceId"));
  await limit(app, "community-ban", 20, 3600, { by: user.id });
  const body = await readJson(app.request);
  const member = await memberNamed(app.db, body);
  if (member.user_id === user.id) fail(400, "own_account", "You can't ban yourself.");
  if (await isTeamMember(app, member.user_id, space)) fail(403, "is_team", "That's a member of this space's team.");
  const days = body.days === null || body.days === undefined ? null : int(body.days, "days", { min: 1, max: MAX_DAYS });
  const reason = readReason(body, true);
  const at = new Date();
  const until = days ? new Date(at.getTime() + days * 86400000).toISOString() : null;
  await app.db.batch([
    stmt(app.db, `INSERT INTO community_space_bans (space_id, user_id, until, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (space_id, user_id) DO UPDATE SET until = excluded.until, reason = excluded.reason, created_by = excluded.created_by, created_at = excluded.created_at`,
    space.id, member.user_id, until, reason, user.id, at.toISOString()),
    ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "ban", targetType: "member", targetId: member.user_id, reason: days ? `${days} days: ${reason}` : reason })
  ]);
  return json({ ok: true, until });
}

async function unban(app, { spaceId }) {
  const { user, space } = await moderator(app, id(spaceId, "spaceId"));
  const body = await readJson(app.request);
  const member = await memberNamed(app.db, body);
  const reason = readReason(body, false);
  await app.db.batch([
    stmt(app.db, "DELETE FROM community_space_bans WHERE space_id = ? AND user_id = ?", space.id, member.user_id),
    ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "unban", targetType: "member", targetId: member.user_id, reason })
  ]);
  return json({ ok: true });
}

async function list(app, { spaceId }) {
  const { space } = await moderator(app, id(spaceId, "spaceId"));
  const bans = await all(app.db, `SELECT m.display_name AS name, b.until, b.reason, b.created_at AS createdAt FROM community_space_bans b
    LEFT JOIN community_members m ON m.user_id = b.user_id WHERE b.space_id = ? AND (b.until IS NULL OR b.until > ?) ORDER BY b.created_at DESC LIMIT 200`,
  space.id, new Date().toISOString());
  return json({ bans: bans.map((b) => ({ ...b, name: b.name || null })) }, 200, { "Cache-Control": "no-store" });
}

export const banRoutes = [
  ["GET", "/api/community/spaces/:spaceId/bans", list, { auditReads: true }],
  ["PUT", "/api/community/spaces/:spaceId/bans", ban],
  ["DELETE", "/api/community/spaces/:spaceId/bans", unban]
];

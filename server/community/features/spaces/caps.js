// How many communities one account may start (owner, 2026-10-27, #214): the site-wide community_space_cap (Settings ›
// Switches) unless AutoStacc set an exception for that account (community_space_caps), up or down. The Control Center
// lists, sets and removes exceptions by community username; every change is audited.
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, now } from "../../../lib/db.js";
import { requireAdmin } from "../../../auth/session.js";
import { audit } from "../../../audit/log.js";
import { USER_ID } from "../../../impersonation/routes.js";
import { getSetting } from "../../../settings/settings.js";
import { nameKey, cleanName } from "../../core/names.js";

export async function capFor(db, userId) {
  const own = await first(db, "SELECT cap FROM community_space_caps WHERE user_id = ?", userId);
  return own ? own.cap : Number(await getSetting(db, "community_space_cap"));
}

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT c.user_id AS userId, m.display_name AS name, c.cap, c.note, c.created_at AS createdAt,
    (SELECT COUNT(*) FROM community_spaces s WHERE s.founder_user_id = c.user_id AND s.kind = 'community' AND s.state <> 'archived') AS owned
    FROM community_space_caps c LEFT JOIN community_members m ON m.user_id = c.user_id ORDER BY c.created_at DESC LIMIT 200`);
  return json({ cap: Number(await getSetting(app.db, "community_space_cap")), exceptions: rows }, 200, { "Cache-Control": "no-store" });
}

async function set(app) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request);
  const name = cleanName(body.name);
  const member = name && await first(app.db, "SELECT user_id AS userId, display_name AS name FROM community_members WHERE name_key = ?", nameKey(name));
  if (!member) fail(404, "no_such_member", "No one uses that username. Check the spelling.", { field: "name" });
  if (!Number.isInteger(body.cap) || body.cap < 0 || body.cap > 99) fail(400, "invalid_field", "A whole number from 0 to 99.", { field: "cap" });
  const note = body.note === undefined || body.note === null ? "" : str(body.note, "note", { min: 0, max: 200 }).replace(/\s+/g, " ").trim();
  await run(app.db, `INSERT INTO community_space_caps (user_id, cap, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET cap = excluded.cap, note = excluded.note, created_by = excluded.created_by, created_at = excluded.created_at`,
  member.userId, body.cap, note, admin.id, now());
  await audit(app, "community.space_cap_set", { targetType: "user", targetId: member.userId, subjectUserId: member.userId, detail: { cap: body.cap, note } });
  return json({ exception: { userId: member.userId, name: member.name, cap: body.cap, note } });
}

async function remove(app, { userId }) {
  await requireAdmin(app);
  const r = await run(app.db, "DELETE FROM community_space_caps WHERE user_id = ?", str(userId, "userId", { max: 64, pattern: USER_ID }));
  if (!r.meta.changes) fail(404, "not_found", "That account has no exception.");
  await audit(app, "community.space_cap_removed", { targetType: "user", targetId: userId, subjectUserId: userId });
  return json({ ok: true });
}

export const capRoutes = [
  ["GET", "/api/admin/community/space-caps", list],
  ["PUT", "/api/admin/community/space-caps", set],
  ["DELETE", "/api/admin/community/space-caps/:userId", remove]
];

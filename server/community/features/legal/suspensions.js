// Community suspensions in the Control Center (docs/community.md, "Who enforces what"): who AutoStacc has suspended
// from the whole community, why and until when, and lifting one. Suspending happens when a report is decided
// (queue.js). A suspension stops posting, voting, reporting and moderating everywhere (core/access.js); buying,
// downloading and the rest of the account are untouched. Audited.
import { json, fail, str } from "../../../lib/http.js";
import { all, run } from "../../../lib/db.js";
import { requireAdmin } from "../../../auth/session.js";
import { audit } from "../../../audit/log.js";
import { USER_ID } from "../../../impersonation/routes.js";

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT s.user_id AS userId, m.display_name AS name, s.reason, s.until, s.created_at AS createdAt
    FROM community_suspensions s LEFT JOIN community_members m ON m.user_id = s.user_id
    WHERE s.until IS NULL OR s.until > ? ORDER BY s.created_at DESC LIMIT 200`, new Date().toISOString());
  return json({ suspensions: rows }, 200, { "Cache-Control": "no-store" });
}

async function lift(app, { userId }) {
  await requireAdmin(app);
  const r = await run(app.db, "DELETE FROM community_suspensions WHERE user_id = ?", str(userId, "userId", { max: 64, pattern: USER_ID }));
  if (!r.meta.changes) fail(404, "not_found", "That account isn't suspended.");
  await audit(app, "community.suspension_lifted", { targetType: "user", targetId: userId, subjectUserId: userId });
  return json({ ok: true });
}

export const suspensionRoutes = [
  ["GET", "/api/admin/community/suspensions", list],
  ["DELETE", "/api/admin/community/suspensions/:userId", lift]
];

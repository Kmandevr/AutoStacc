// GET /api/admin/audit: the audit log for the owner, newest first, filtered by action prefix, customer or
// impersonation, paged by time (?before=<at>). Customers are shown by email here only, to the admin, at read time.
// There is no write route: entries come from server code (server/audit/log.js) and catalog triggers.
import { json, str } from "../lib/http.js";
import { all } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";

async function list(app) {
  await requireAdmin(app);
  const url = new URL(app.request.url);
  const opt = (name, pattern, max = 80) => (url.searchParams.get(name) ? str(url.searchParams.get(name), name, { max, pattern }) : null);
  const action = opt("action", /^[a-z_.]+$/, 40);
  const subject = opt("subject", /^[A-Za-z0-9_-]+$/, 64);
  const imp = opt("impersonation", /^imp_[a-z2-7]+$/, 40);
  const before = opt("before", /^\d{4}-\d\d-\d\dT[\d:.]+Z$/, 30);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 200);
  const rows = await all(app.db,
    `SELECT a.id, a.at, a.action, a.actor_label AS actor, a.impersonation_id AS impersonationId, a.subject_user_id AS subjectUserId,
       u.email AS subjectEmail, a.target_type AS targetType, a.target_id AS targetId, a.detail
     FROM admin_audit a LEFT JOIN "user" u ON u.id = a.subject_user_id
     WHERE (? IS NULL OR a.at < ?) AND (? IS NULL OR a.action = ? OR a.action LIKE ? || '.%')
       AND (? IS NULL OR a.subject_user_id = ?) AND (? IS NULL OR a.impersonation_id = ?)
     ORDER BY a.at DESC LIMIT ?`,
    before, before, action, action, action, subject, subject, imp, imp, limit);
  return json({ entries: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail || "{}") })), next: rows.length === limit ? rows[rows.length - 1].at : null });
}

export const routes = [["GET", "/api/admin/audit", list]];

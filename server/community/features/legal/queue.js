// AutoStacc's report queue in the Control Center (docs/community-safety.md, "Who gets which report"): the open
// reports routed to AutoStacc (illegal content, copyright, impersonation, underage accounts), one entry per take or
// post, oldest first, with the reporters' community names (AutoStacc may need to answer them). An admin decides each:
//   removed    AutoStacc removes it for a legal reason (kept as the law requires; the author is told why)
//   dismissed  nothing to act on
//   underage   the author said they're under 16: their community activity goes (posts emptied and removed, then the
//              account's community data erased as on account deletion) and they can't join again
// Removing may also suspend the author from the whole community. Every decision is in the audit log.
import { json, readJson, fail, id, str, int } from "../../../lib/http.js";
import { all, first, stmt, now, guardStmt } from "../../../lib/db.js";
import { requireAdmin } from "../../../auth/session.js";
import { audit } from "../../../audit/log.js";
import { loadTarget, legalRemove, guarded } from "../../core/moderate.js";
import { eraseCommunityStmts } from "../../core/erase.js";
import { purge } from "../../core/purge.js";

const NO_STORE = { "Cache-Control": "no-store" };
const OUTCOMES = ["removed", "dismissed", "underage"];

async function queue(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT r.target_type AS type, r.target_id AS id, r.reason, r.note, r.created_at AS createdAt, m.display_name AS reporter
    FROM community_reports r LEFT JOIN community_members m ON m.user_id = r.reporter_user_id
    WHERE r.route = 'autostacc' AND r.status = 'open' ORDER BY r.created_at LIMIT 500`);
  const byTarget = new Map();
  for (const r of rows) {
    const key = `${r.type}:${r.id}`;
    if (!byTarget.has(key)) byTarget.set(key, { type: r.type, id: r.id, since: r.createdAt, reports: [] });
    byTarget.get(key).reports.push({ reason: r.reason, note: r.note, reporter: r.reporter || "deleted user", at: r.createdAt });
  }
  const items = [];
  for (const e of byTarget.values()) {
    const t = await loadTarget(app.db, e.type, e.id);
    if (!t) continue;
    const author = t.authorId && await first(app.db, "SELECT display_name AS name FROM community_members WHERE user_id = ?", t.authorId);
    const space = await first(app.db, "SELECT name FROM community_spaces WHERE id = ?", t.spaceId);
    items.push({ ...e, state: t.state, removedReason: t.removedReason, title: t.thread.title, text: t.body.slice(0, 2000), threadId: t.thread.id,
      space: space ? space.name : "", author: author ? author.name : null, authorKnown: Boolean(t.authorId) });
  }
  return json({ reports: items.slice(0, 100) }, 200, NO_STORE);
}

const suspendStmt = (db, userId, reason, days, adminId) => stmt(db, `INSERT INTO community_suspensions (user_id, reason, until, created_by, created_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason, until = excluded.until, created_by = excluded.created_by, created_at = excluded.created_at`,
userId, reason, days ? new Date(Date.now() + days * 86400000).toISOString() : null, adminId, now());

async function resolve(app) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 4096);
  const type = str(body.targetType, "targetType", { max: 10 });
  const target = (type === "thread" || type === "post") && await loadTarget(app.db, type, id(body.targetId, "targetId"));
  if (!target) fail(404, "not_found", "Not found.");
  const outcome = str(body.outcome, "outcome", { max: 20 });
  if (!OUTCOMES.includes(outcome)) fail(400, "invalid_field", "Remove, dismiss or underage.", { field: "outcome" });
  const reason = body.reason === undefined || body.reason === null || body.reason === "" ? "" : str(body.reason, "reason", { max: 500 }).trim();
  if (outcome !== "dismissed" && reason.length < 3) fail(400, "reason_required", "Say why: it's kept in the audit log and the author is told.", { field: "reason" });
  const suspend = body.suspendDays === undefined ? false : body.suspendDays === null ? null : int(body.suspendDays, "suspendDays", { min: 1, max: 3650 });
  const db = app.db;
  const stillOpen = guardStmt(db, "EXISTS (SELECT 1 FROM community_reports WHERE target_type = ? AND target_id = ? AND route = 'autostacc' AND status = 'open')", target.type, target.id);
  // Removing or underage settles every open report on it (the space's too); dismissing only AutoStacc's.
  const close = stmt(db, `UPDATE community_reports SET status = ?, handled_by = ?, handled_at = ? WHERE target_type = ? AND target_id = ? AND status = 'open'
    AND (? OR route = 'autostacc')`, outcome === "dismissed" ? "dismissed" : "upheld", admin.id, now(), target.type, target.id, outcome === "dismissed" ? 0 : 1);
  if (outcome === "dismissed") {
    await guarded(db, [stillOpen, close]);
  } else if (outcome === "removed") {
    const extra = [close, ...(suspend !== false && target.authorId ? [suspendStmt(db, target.authorId, reason, suspend, admin.id)] : [])];
    if (target.state === "removed" && target.removedReason === "legal") await guarded(db, [stillOpen, ...extra]);
    else await legalRemove(app, target, { reason, extra: [stillOpen, ...extra] });
  } else {
    if (!target.authorId) fail(409, "no_author", "That account is already gone.");
    await underage(app, target.authorId, admin.id, [stillOpen, close]);
  }
  await audit(app, `community.report_${outcome}`, { targetType: `community_${target.type}`, targetId: target.id,
    subjectUserId: target.authorId || undefined, detail: { reason, suspendDays: suspend === false ? undefined : suspend } });
  purge(app, {});
  return json({ ok: true });
}

// An underage account's community activity goes now (owner, 2026-10-16: AutoStacc must remove it once it knows):
// their posts emptied and removed, their takes' titles too, then everything deleting the account would erase, and
// a suspension without end so they can't join again with the same account.
async function underage(app, userId, adminId, guards) {
  const db = app.db;
  const at = now();
  await guarded(db, [
    ...guards,
    stmt(db, "UPDATE community_posts SET body = '', state = 'removed', removed_reason = 'author', removed_at = ? WHERE author_user_id = ?", at, userId),
    stmt(db, "UPDATE community_threads SET title = 'Removed', slug = 'removed', state = 'removed', removed_reason = 'author', removed_at = ? WHERE author_user_id = ?", at, userId),
    stmt(db, `UPDATE community_threads SET reply_count = MAX((SELECT COUNT(*) FROM community_posts p WHERE p.thread_id = community_threads.id AND p.state = 'visible') - 1, 0)
      WHERE id IN (SELECT thread_id FROM community_posts WHERE author_user_id = ?)`, userId),
    ...eraseCommunityStmts(db, userId),
    suspendStmt(db, userId, "Under 16", null, adminId)
  ]);
}

export const queueRoutes = [
  ["GET", "/api/admin/community/reports", queue],
  ["POST", "/api/admin/community/reports/resolve", resolve]
];

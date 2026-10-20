// AutoStacc's report queue in the Control Center (docs/community-safety.md, "Who gets which report"): the open
// reports routed to AutoStacc (illegal content, copyright, impersonation, underage accounts), one entry per take or
// post, oldest first, with the reporters' community names (AutoStacc may need to answer them). An admin decides each:
//   removed    AutoStacc removes it for a legal reason (kept as the law requires; the author is told why)
//   dismissed  nothing to act on
//   underage   the author said they're under 16: their community activity goes (posts emptied and removed, then the
//              account's community data erased as on account deletion) and they can't join again
// Removing may also suspend the author from the whole community. Every decision is in the audit log.
import { json, readJson, fail, id, str, int } from "../../../lib/http.js";
import { all, stmt, now, guardStmt } from "../../../lib/db.js";
import { requireAdmin } from "../../../auth/session.js";
import { audit } from "../../../audit/log.js";
import { loadTarget, loadTargets, legalRemove, guarded } from "../../core/moderate.js";
import { eraseCommunityStmts } from "../../core/erase.js";
import { purge } from "../../core/purge.js";

const NO_STORE = { "Cache-Control": "no-store" };
const OUTCOMES = ["removed", "dismissed", "underage"];

const MAX_ITEMS = 50;

async function queue(app) {
  await requireAdmin(app);
  // The oldest items first, chosen in SQL, then everything about them in a few queries (never one per report).
  const targets = await all(app.db, `SELECT target_type AS type, target_id AS id, MIN(created_at) AS since FROM community_reports
    WHERE route = 'autostacc' AND status = 'open' GROUP BY target_type, target_id ORDER BY since LIMIT ${MAX_ITEMS}`);
  const keys = JSON.stringify(targets.map((t) => `${t.type}:${t.id}`));
  const [rows, loaded] = await Promise.all([
    all(app.db, `SELECT r.target_type AS type, r.target_id AS id, r.reason, r.note, r.created_at AS createdAt, m.display_name AS reporter
      FROM community_reports r LEFT JOIN community_members m ON m.user_id = r.reporter_user_id
      WHERE r.route = 'autostacc' AND r.status = 'open' AND r.target_type || ':' || r.target_id IN (SELECT value FROM json_each(?))
      ORDER BY r.created_at LIMIT 1000`, keys),
    loadTargets(app.db, targets)
  ]);
  const items = [];
  for (const e of targets) {
    const t = loaded.get(`${e.type}:${e.id}`);
    if (!t) continue;
    const reports = rows.filter((r) => r.type === e.type && r.id === e.id).slice(0, 20)
      .map((r) => ({ reason: r.reason, note: r.note, reporter: r.reporter || "deleted user", at: r.createdAt }));
    items.push({ type: e.type, id: e.id, since: e.since, reports, state: t.state, removedReason: t.removedReason, title: t.thread.title,
      text: t.body.slice(0, 2000), threadId: t.thread.id, space: t.spaceName, author: t.authorName, authorKnown: Boolean(t.authorId) });
  }
  return json({ reports: items }, 200, NO_STORE);
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
    const threads = await all(db, `SELECT DISTINCT t.id, t.slug FROM community_threads t WHERE t.author_user_id = ?1
      OR t.id IN (SELECT thread_id FROM community_posts WHERE author_user_id = ?1) LIMIT 200`, target.authorId);
    await underage(app, target.authorId, admin.id, [stillOpen, close]);
    for (const t of threads) purge(app, { thread: t });
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
    // What AutoStacc removed for a legal reason is kept as the law requires, so it's left as it is (security review).
    stmt(db, `UPDATE community_posts SET body = '', state = 'removed', removed_reason = 'author', removed_at = ? WHERE author_user_id = ?
      AND COALESCE(removed_reason, '') <> 'legal'`, at, userId),
    stmt(db, `UPDATE community_threads SET title = 'Removed', slug = 'removed', state = 'removed', removed_reason = 'author', removed_at = ? WHERE author_user_id = ?
      AND COALESCE(removed_reason, '') <> 'legal'`, at, userId),
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

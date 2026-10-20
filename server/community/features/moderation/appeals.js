// Telling people why, and letting them ask again (docs/community.md, "Who enforces what"; docs/community-safety.md,
// the DSA's statement of reasons): the visitor's own takes and posts a space's team (or the automatic rules) hid or
// removed in the last 12 months (AutoStacc's legal removals too), each with the reason and whether it can still be
// appealed; one appeal per take or
// post, to that space's team, which grants it (the post comes back) or refuses it, with a reason. Removals for a
// legal reason aren't appealed here (/copyright has counter-notices). The team's log is listed here too.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { first, all, stmt, now, newId, guardStmt } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { getMember } from "../../core/members.js";
import { loadTarget, setState, canChange, logStmts, guarded } from "../../core/moderate.js";
import { threadPath } from "../../core/render-parts.js";
import { moderator, readReason } from "./actions.js";

const YEAR_MS = 365 * 86400000;
const NO_STORE = { "Cache-Control": "no-store" };
const LAST_REASON = (type, col) => `(SELECT l.reason FROM community_mod_log l WHERE l.target_type = '${type}' AND l.target_id = ${col}
  AND l.action IN ('hide', 'remove', 'auto_hide', 'report_upheld', 'legal_remove') ORDER BY l.at DESC LIMIT 1)`;

async function moderated(app) {
  const user = await requireUser(app);
  const since = new Date(Date.now() - YEAR_MS).toISOString();
  const rows = await all(app.db, `SELECT 'thread' AS type, t.id, t.id AS threadId, t.slug, t.title, t.state, t.removed_reason AS why, s.name AS space, ${LAST_REASON("thread", "t.id")} AS reason,
      a.status AS appeal FROM community_threads t JOIN community_spaces s ON s.id = t.space_id
      LEFT JOIN community_appeals a ON a.target_type = 'thread' AND a.target_id = t.id
      WHERE t.author_user_id = ?1 AND (t.state = 'hidden' OR t.removed_reason IN ('space_rules', 'legal')) AND t.created_at > ?2
    UNION ALL
    SELECT 'post', p.id, t.id, t.slug, t.title, p.state, p.removed_reason, s.name, ${LAST_REASON("post", "p.id")}, a.status
      FROM community_posts p JOIN community_threads t ON t.id = p.thread_id JOIN community_spaces s ON s.id = t.space_id
      LEFT JOIN community_appeals a ON a.target_type = 'post' AND a.target_id = p.id
      WHERE p.author_user_id = ?1 AND (p.state = 'hidden' OR p.removed_reason IN ('space_rules', 'legal')) AND p.created_at > ?2
    LIMIT 50`, user.id, since);
  return json({ items: rows.map((r) => ({ type: r.type, id: r.id, state: r.state, space: r.space, title: r.title, reason: r.reason || "",
    path: r.type === "post" ? `${threadPath({ id: r.threadId, slug: r.slug })}#${r.id}` : null, appeal: r.appeal || null, legal: r.why === "legal" })) }, 200, NO_STORE);
}

async function appeal(app) {
  const user = await requireUser(app);
  await limit(app, "community-appeal", 10, 86400, { by: user.id });
  if (!(await getMember(app.db, user.id))) fail(403, "not_a_member", "Pick your community name first.");
  const body = await readJson(app.request);
  const type = str(body.targetType, "targetType", { max: 10 });
  const target = (type === "thread" || type === "post") && await loadTarget(app.db, type, id(body.targetId, "targetId"));
  // Only your own, and only what a space's team took down under its rules.
  if (!target || target.authorId !== user.id || !(target.state === "hidden" || target.removedReason === "space_rules")) fail(404, "not_found", "Nothing to appeal there.");
  const note = str(body.note, "note", { max: 1000 }).trim();
  if (note.length < 10) fail(400, "note_required", "Tell the team, in a sentence or two, why it should come back.", { field: "note" });
  const r = await app.db.prepare(`INSERT INTO community_appeals (id, space_id, target_type, target_id, user_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (target_type, target_id) DO NOTHING`).bind(newId("apl"), target.spaceId, type, target.id, user.id, note, now()).run();
  if (!r.meta.changes) fail(409, "already_appealed", "You've already appealed this one.");
  return json({ ok: true }, 201);
}

async function queue(app, { spaceId }) {
  const { space } = await moderator(app, id(spaceId, "spaceId"));
  const rows = await all(app.db, `SELECT a.id, a.target_type AS targetType, a.target_id AS targetId, a.note, a.created_at AS createdAt, m.display_name AS author
    FROM community_appeals a LEFT JOIN community_members m ON m.user_id = a.user_id
    WHERE a.space_id = ? AND a.status = 'open' ORDER BY a.created_at LIMIT 50`, space.id);
  const items = [];
  for (const r of rows) {
    const t = await loadTarget(app.db, r.targetType, r.targetId);
    items.push({ ...r, excerpt: t ? t.body.slice(0, 300) : "", title: t ? t.thread.title : "", state: t ? t.state : "gone" });
  }
  return json({ appeals: items }, 200, NO_STORE);
}

async function decide(app, { appealId }) {
  const a = await first(app.db, "SELECT * FROM community_appeals WHERE id = ?", id(appealId, "appealId"));
  if (!a) fail(404, "not_found", "Not found.");
  const { user } = await moderator(app, a.space_id);
  if (a.status !== "open") fail(409, "changed", "That appeal was already decided.");
  const body = await readJson(app.request);
  const grant = body.outcome === "granted";
  if (!grant && body.outcome !== "refused") fail(400, "invalid_field", "Grant or refuse it.", { field: "outcome" });
  const reason = readReason(body, !grant);
  const close = [guardStmt(app.db, "EXISTS (SELECT 1 FROM community_appeals WHERE id = ? AND status = 'open')", a.id),
    stmt(app.db, "UPDATE community_appeals SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?", grant ? "granted" : "refused", user.id, now(), a.id)];
  const target = await loadTarget(app.db, a.target_type, a.target_id);
  if (grant && target && canChange(target, "visible")) {
    await setState(app, target, "visible", { action: "appeal_granted", actorId: user.id, reason, extra: close });
  } else {
    await guarded(app.db, [...close, ...logStmts(app.db, { spaceId: a.space_id, actorId: user.id, action: grant ? "appeal_granted" : "appeal_refused", targetType: a.target_type, targetId: a.target_id, reason })]);
  }
  return json({ ok: true });
}

// The team's log, newest first: who did what and why (members named, never account ids).
async function log(app, { spaceId }) {
  const { space } = await moderator(app, id(spaceId, "spaceId"));
  const rows = await all(app.db, `SELECT l.at, l.action, l.target_type AS targetType, l.target_id AS targetId, l.reason, l.automatic,
      m.display_name AS actor, tm.display_name AS member
    FROM community_mod_log l LEFT JOIN community_members m ON m.user_id = l.actor_user_id
    LEFT JOIN community_members tm ON l.target_type = 'member' AND tm.user_id = l.target_id
    WHERE l.space_id = ? ORDER BY l.at DESC LIMIT 100`, space.id);
  return json({ log: rows.map((r) => ({ ...r, targetId: r.targetType === "member" ? null : r.targetId, automatic: Boolean(r.automatic) })) }, 200, NO_STORE);
}

export const appealRoutes = [
  ["GET", "/api/community/moderated", moderated],
  ["POST", "/api/community/appeals", appeal],
  ["GET", "/api/community/spaces/:spaceId/appeals", queue, { auditReads: true }],
  ["POST", "/api/community/appeals/:appealId", decide],
  ["GET", "/api/community/spaces/:spaceId/mod-log", log, { auditReads: true }]
];

// Moderation's shared core (docs/community.md, "Who enforces what"): the one place a take or post changes what the
// community shows (hidden, removed under a space's rules, visible again) and the space team's log of it, used by the
// moderation feature (team tools, appeals) and the reports feature (auto-hide, resolving reports) so neither imports
// the other. Each change is compare-and-set (a batch guard, so two moderators can't both apply one), logged in
// community_mod_log in the same batch, counts as team activity unless automatic, and clears the cached pages it
// changes. Removals by the author or for a legal reason are never changed here.
import { first, stmt, now, newId, guardStmt, isGuardFailure } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { getSpace } from "./posting.js";
import { purge } from "./purge.js";

const OPENING = (threadCol) => `(SELECT o.id FROM community_posts o WHERE o.thread_id = ${threadCol} ORDER BY o.created_at, o.id LIMIT 1)`;

const shape = (r, type) => r && {
  type, id: r.id, state: r.state, removedReason: r.removed_reason, removedAt: r.removed_at, authorId: r.author_user_id, body: r.body || "",
  spaceId: r.space_id, channelId: r.channel_id, thread: { id: r.thread_id, slug: r.slug, state: r.thread_state, title: r.title },
  opening: type === "thread" || r.opening_id === r.id
};

// A take (with its opening post's text) or a post, with what moderating it needs; null when there's no such thing.
export async function loadTarget(db, type, targetId) {
  if (type === "thread") {
    return shape(await first(db, `SELECT t.id, t.id AS thread_id, t.slug, t.title, t.state, t.state AS thread_state, t.removed_reason, t.removed_at,
      t.author_user_id, t.space_id, t.channel_id, (SELECT o.body FROM community_posts o WHERE o.id = ${OPENING("t.id")}) AS body
      FROM community_threads t WHERE t.id = ?`, targetId), type);
  }
  if (type === "post") {
    return shape(await first(db, `SELECT p.id, p.thread_id, p.state, p.removed_reason, p.removed_at, p.author_user_id, p.body, t.slug, t.title,
      t.state AS thread_state, t.space_id, t.channel_id, ${OPENING("p.thread_id")} AS opening_id
      FROM community_posts p JOIN community_threads t ON t.id = p.thread_id WHERE p.id = ?`, targetId), type);
  }
  return null;
}

// Which changes a team (or the automatic rules) may make: hide what's showing, remove what's showing or hidden,
// bring back what was hidden, or removed under the space's rules within the 12 months its text is kept.
const FROM = { hidden: ["visible"], removed: ["visible", "hidden"], visible: ["hidden", "removed"] };
export const KEEP_REMOVED_MS = 365 * 86400000;
export const canChange = (target, to, nowMs = Date.now()) => Boolean(FROM[to]) && FROM[to].includes(target.state)
  && (target.state !== "removed" || (target.removedReason === "space_rules" && !(Date.parse(target.removedAt) < nowMs - KEEP_REMOVED_MS)));

// The log entry, plus the team's activity (what keeps a space open: the 40-day rule) unless the system did it.
export const logStmts = (db, { spaceId, actorId = null, action, targetType, targetId, reason = "", automatic = false }, at = now()) => [
  stmt(db, `INSERT INTO community_mod_log (id, at, space_id, actor_user_id, action, target_type, target_id, reason, automatic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, newId("mlg"), at, spaceId, actorId, action, targetType, targetId, String(reason).slice(0, 500), automatic ? 1 : 0),
  ...(automatic ? [] : [stmt(db, "UPDATE community_spaces SET last_team_activity_at = ? WHERE id = ?", at, spaceId)])
];

// A reply's state counts toward its take's reply count only while it's visible; recounted, so it can't drift.
const recount = (db, threadId) => stmt(db, `UPDATE community_threads SET reply_count =
  MAX((SELECT COUNT(*) FROM community_posts p WHERE p.thread_id = ?1 AND p.state = 'visible') - 1, 0) WHERE id = ?1`, threadId);

// Runs a batch whose first statement guards it; a failed guard means someone changed the thing first.
export async function guarded(db, stmts) {
  try { await db.batch(stmts); } catch (e) {
    if (isGuardFailure(e)) fail(409, "changed", "That just changed. Reload and try again.");
    throw e;
  }
}

export async function purgeTarget(app, target, extraChannelIds = []) {
  const space = await getSpace(app.db, target.spaceId);
  const ids = [target.channelId, ...extraChannelIds];
  for (const cid of ids) {
    const channel = await first(app.db, "SELECT id, slug FROM community_channels WHERE id = ?", cid);
    purge(app, { thread: target.thread, space, channel });
  }
}

// Moves a take or post to `to`, logging `action` (hide, remove, restore, auto_hide, appeal_granted...). `extra`:
// more statements for the same batch (a report's or appeal's outcome).
export async function setState(app, target, to, { action, actorId = null, reason = "", automatic = false, extra = [] }) {
  if (!canChange(target, to)) fail(409, "not_changeable", "That can't be changed from here.");
  const db = app.db;
  const table = target.type === "thread" ? "community_threads" : "community_posts";
  await guarded(db, [
    guardStmt(db, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND state = ? AND COALESCE(removed_reason, '') = ? AND COALESCE(removed_at, '') = ?)`,
      target.id, target.state, target.removedReason || "", target.removedAt || ""),
    stmt(db, `UPDATE ${table} SET state = ?, removed_reason = ?, removed_at = ? WHERE id = ?`, to, to === "removed" ? "space_rules" : null, to === "removed" ? now() : null, target.id),
    ...(target.type === "post" ? [recount(db, target.thread.id)] : []),
    ...logStmts(db, { spaceId: target.spaceId, actorId, action, targetType: target.type, targetId: target.id, reason, automatic }),
    ...extra
  ]);
  await purgeTarget(app, target);
  return { ...target, state: to };
}

// AutoStacc's removal for a legal reason (an illegal-content notice, copyright, impersonation; the Control Center):
// from any state but an earlier legal removal, so even what its author deleted is kept as the law requires
// (core/retention.js never clears it). Logged in the space's log too, so its team and the author see why.
export async function legalRemove(app, target, { reason, extra = [] }) {
  if (target.state === "removed" && target.removedReason === "legal") fail(409, "not_changeable", "That's already removed for a legal reason.");
  const db = app.db;
  const table = target.type === "thread" ? "community_threads" : "community_posts";
  await guarded(db, [
    guardStmt(db, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND state = ? AND COALESCE(removed_reason, '') = ?)`, target.id, target.state, target.removedReason || ""),
    stmt(db, `UPDATE ${table} SET state = 'removed', removed_reason = 'legal', removed_at = ? WHERE id = ?`, now(), target.id),
    ...(target.type === "post" ? [recount(db, target.thread.id)] : []),
    ...logStmts(db, { spaceId: target.spaceId, action: "legal_remove", targetType: target.type, targetId: target.id, reason: `Removed by AutoStacc: ${reason}`, automatic: true }),
    ...extra
  ]);
  await purgeTarget(app, target);
}

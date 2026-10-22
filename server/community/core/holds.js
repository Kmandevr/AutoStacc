// Held posts (docs/community.md, "Links" and "Automatic moderation"): a rule feature's check may answer { hold: { rule,
// reason } } instead of refusing; the core then stores the take or reply hidden with a row in community_holds, shows
// its writer that it is waiting, and lists it to the space's team, who approve it (it appears) or reject it (removed
// under the space's rules, the writer told why). The rules themselves live in features; this is only the holding.
import { all, stmt, now } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { loadTarget, loadTargets, setState } from "./moderate.js";

export const MAX_HELD_PER_AUTHOR = 5;

// The statements that record a hold, for the same batch as the post's insert.
export const holdStmts = (db, { targetType, targetId, spaceId, authorId, hold }) => [
  stmt(db, "INSERT INTO community_holds (target_type, target_id, space_id, author_user_id, rule, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    targetType, targetId, spaceId, authorId, String(hold.rule).slice(0, 40), String(hold.reason).slice(0, 300), now())
];

// How many of this person's posts are waiting (so held posts can't pile up in a team's queue).
export const heldCount = async (db, userId) => (await all(db, "SELECT COUNT(*) AS n FROM community_holds WHERE author_user_id = ?", userId))[0].n;

// Passes a check's hold through, unless this person already has the most posts waiting. → the hold or null.
export async function requireRoom(app, user, hold) {
  if (hold && (await heldCount(app.db, user.id)) >= MAX_HELD_PER_AUTHOR) {
    fail(429, "too_many_held", "You have several posts waiting for a team's approval. Wait for those before posting more.");
  }
  return hold;
}

// A space's waiting posts, oldest first, for its team.
export async function listHolds(db, spaceId) {
  const rows = await all(db, `SELECT target_type AS type, target_id AS id, rule, reason, created_at AS at FROM community_holds
    WHERE space_id = ? ORDER BY created_at LIMIT 100`, spaceId);
  const targets = await loadTargets(db, rows);
  return rows.map((r) => ({ r, t: targets.get(`${r.type}:${r.id}`) })).filter((x) => x.t && x.t.state === "hidden").map(({ r, t }) => ({
    type: r.type, id: r.id, rule: r.rule, reason: r.reason, at: r.at, title: t.thread.title, author: t.authorName, excerpt: t.body.slice(0, 400),
    threadId: t.thread.id
  }));
}

// The visitor's own waiting posts.
export async function mineHolds(db, userId) {
  const rows = await all(db, "SELECT target_type AS type, target_id AS id, reason, created_at AS at FROM community_holds WHERE author_user_id = ? ORDER BY created_at DESC LIMIT 20", userId);
  const targets = await loadTargets(db, rows);
  return rows.map((r) => ({ r, t: targets.get(`${r.type}:${r.id}`) })).filter((x) => x.t && x.t.state === "hidden").map(({ r, t }) => ({
    type: r.type, id: r.id, reason: r.reason, at: r.at, title: t.thread.title, space: t.spaceName
  }));
}

// The team's decision. Compare-and-set through setState, which also clears the hold in the same batch.
export async function decideHold(app, type, targetId, outcome, { actorId, reason }) {
  const target = await loadTarget(app.db, type, targetId);
  const held = target && (await all(app.db, "SELECT 1 AS n FROM community_holds WHERE target_type = ? AND target_id = ?", type, targetId)).length;
  if (!held || target.state !== "hidden") fail(404, "not_found", "That isn't waiting for a decision.");
  await setState(app, target, outcome === "approve" ? "visible" : "removed", {
    action: outcome === "approve" ? "hold_approved" : "hold_rejected", actorId, reason,
    extra: [stmt(app.db, "DELETE FROM community_holds WHERE target_type = ? AND target_id = ?", type, targetId)]
  });
  return target;
}

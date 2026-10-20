// One person's vote on a take or a post (community_votes, a core table), for the features that count votes (boost,
// qa). Adding or removing a vote changes the target's stored counter only when a row was really added or removed, so
// repeating a request changes nothing. The caller checks who may vote; this only keeps the count honest.
import { run, now } from "../../lib/db.js";

const COUNTERS = { thread: { table: "community_threads", column: "score" }, post: { table: "community_posts", column: "helpful" } };

export async function setVote(db, { targetType, targetId, userId, kind, on }) {
  const changed = on
    ? await run(db, "INSERT OR IGNORE INTO community_votes (target_type, target_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)", targetType, targetId, userId, kind, now())
    : await run(db, "DELETE FROM community_votes WHERE target_type = ? AND target_id = ? AND user_id = ? AND kind = ?", targetType, targetId, userId, kind);
  const c = COUNTERS[targetType];
  if (changed.meta.changes) await run(db, `UPDATE ${c.table} SET ${c.column} = MAX(${c.column} ${on ? "+" : "-"} 1, 0) WHERE id = ?`, targetId);
  return Boolean(changed.meta.changes);
}

export const votesOf = async (db, userId, targetType, ids, kind) => {
  if (!ids.length) return new Set();
  const rows = (await db.prepare(`SELECT target_id FROM community_votes WHERE user_id = ? AND target_type = ? AND kind = ? AND target_id IN (${ids.map(() => "?").join(",")})`)
    .bind(userId, targetType, kind, ...ids).all()).results || [];
  return new Set(rows.map((r) => r.target_id));
};

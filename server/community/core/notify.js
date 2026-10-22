// Telling a person something happened in the community (docs/community.md, "Features"): the one place a feature adds
// to someone's notifications (community_notifications, migration 0055), so features never reach into each other.
// A notice is never sent to yourself, to someone who blocked the actor or whom the actor blocked, to someone who isn't
// a member, or twice for the same post. The inbox feature shows them; with it off they simply wait.
import { first, run, newId, now } from "../../lib/db.js";

export const KINDS = ["reply", "mention", "answer", "followed"];
// When two features tell one person about the same post, the more specific notice stays ("replied to you" over "posted in
// a take you follow").
const RANK = "(CASE ? WHEN 'followed' THEN 1 WHEN 'reply' THEN 2 ELSE 3 END)";

export async function notify(app, { userId, kind, threadId, postId = null, actorUserId = null }) {
  if (!userId || userId === actorUserId || !KINDS.includes(kind)) return false;
  const db = app.db;
  if (actorUserId && await first(db, "SELECT 1 AS n FROM community_blocks WHERE (user_id = ?1 AND blocked_user_id = ?2) OR (user_id = ?2 AND blocked_user_id = ?1)", userId, actorUserId)) return false;
  if (!await first(db, "SELECT 1 AS n FROM community_members WHERE user_id = ?", userId)) return false;
  const r = await run(db, `INSERT INTO community_notifications (id, user_id, kind, ref, thread_id, post_id, actor_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, ref) DO UPDATE SET kind = excluded.kind
      WHERE ${RANK.replace("?", "excluded.kind")} > ${RANK.replace("?", "community_notifications.kind")}`, newId("ntf"), userId, kind, postId || threadId, threadId, postId, actorUserId, now());
  return Boolean(r.meta.changes);
}

// The community's part of the daily sweep (server/maintenance/sweep.js; docs/community-safety.md, "Retention"):
// what was removed by its author or under a space's rules keeps its text privately for 12 months, then the text, the
// take's title and the edit history go (the placeholder stays so replies keep their place); handled reports and
// decided appeals go 12 months after they were handled. Removals for a legal reason are AutoStacc's to keep as the
// law requires, so they're left alone here. The space teams' logs stay (an append-only record). This runs whether or
// not the community is switched on, since its data outlives a switch. Bounded per run; anything left waits a day.
import { stmt } from "../../lib/db.js";
import { KEEP_REMOVED_MS } from "./moderate.js";

const BATCH = 500;
const REMOVED = "state = 'removed' AND removed_reason IN ('space_rules', 'author') AND removed_at < ?1";

export async function communityRetention(app, { nowMs = Date.now() } = {}) {
  const db = app.db;
  const cutoff = new Date(nowMs - KEEP_REMOVED_MS).toISOString();
  const results = await db.batch([
    stmt(db, `DELETE FROM community_post_edits WHERE post_id IN (SELECT p.id FROM community_posts p WHERE p.body <> '' AND (p.${REMOVED.replace(/ AND /g, " AND p.")}
      OR p.thread_id IN (SELECT id FROM community_threads WHERE ${REMOVED})) LIMIT ${BATCH})`, cutoff),
    stmt(db, `UPDATE community_posts SET body = '' WHERE id IN (SELECT p.id FROM community_posts p WHERE p.body <> '' AND (p.${REMOVED.replace(/ AND /g, " AND p.")}
      OR p.thread_id IN (SELECT id FROM community_threads WHERE ${REMOVED})) LIMIT ${BATCH})`, cutoff),
    stmt(db, `UPDATE community_threads SET title = 'Removed', slug = 'removed' WHERE id IN (SELECT id FROM community_threads WHERE ${REMOVED} AND title <> 'Removed' LIMIT ${BATCH})`, cutoff),
    stmt(db, `DELETE FROM community_reports WHERE id IN (SELECT id FROM community_reports WHERE status <> 'open' AND handled_at < ?1 LIMIT ${BATCH})`, cutoff),
    stmt(db, `DELETE FROM community_appeals WHERE id IN (SELECT id FROM community_appeals WHERE status <> 'open' AND handled_at < ?1 LIMIT ${BATCH})`, cutoff)
  ]);
  const n = (i) => (results[i] && results[i].meta ? results[i].meta.changes : 0);
  return { postsCleared: n(1), threadsCleared: n(2), reportsDeleted: n(3), appealsDeleted: n(4) };
}

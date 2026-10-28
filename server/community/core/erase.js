// The community's part of deleting an account and of the data download (server/account/delete.js, export.js;
// docs/community-safety.md, "Retention"). Deleting: posts and threads stay but no longer name anyone ("deleted user"),
// the display name, votes, blocks, space roles and edit history go (a founder's communities pass to their longest-serving moderator, or are archived); posts removed for a legal reason keep their text
// for the legal retention, but not who wrote them; reports keep their text but not who made or decided them, and
// bans of the person go, and so do the notifications they received (those they caused lose who did it). The space teams' logs stay as they are (an audit record, append-only). The export lists
// everything the person wrote and did.
import { stmt, all } from "../../lib/db.js";
import { eraseStmts, exportData } from "./hooks.js";

export const eraseCommunityStmts = (db, userId) => [
  stmt(db, "DELETE FROM community_post_edits WHERE post_id IN (SELECT id FROM community_posts WHERE author_user_id = ? AND COALESCE(removed_reason, '') <> 'legal')", userId),
  stmt(db, "UPDATE community_posts SET author_user_id = NULL WHERE author_user_id = ?", userId),
  stmt(db, "UPDATE community_threads SET author_user_id = NULL WHERE author_user_id = ?", userId),
  stmt(db, "DELETE FROM community_votes WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM community_blocks WHERE user_id = ? OR blocked_user_id = ?", userId, userId),
  // A founder leaving hands each community to its longest-serving moderator; with none, it's archived (it can be
  // handed over later).
  stmt(db, `UPDATE community_space_roles SET role = 'founder' WHERE role = 'moderator' AND (space_id, user_id) IN
    (SELECT r.space_id, (SELECT m.user_id FROM community_space_roles m WHERE m.space_id = r.space_id AND m.role = 'moderator' ORDER BY m.created_at, m.user_id LIMIT 1)
     FROM community_space_roles r WHERE r.user_id = ? AND r.role = 'founder')`, userId),
  stmt(db, `UPDATE community_spaces SET founder_user_id = (SELECT r.user_id FROM community_space_roles r WHERE r.space_id = community_spaces.id AND r.role = 'founder' AND r.user_id <> ?1)
    WHERE founder_user_id = ?1`, userId),
  stmt(db, "UPDATE community_spaces SET state = 'archived', state_reason = 'founder_left' WHERE kind = 'community' AND founder_user_id IS NULL AND state <> 'archived'"),
  stmt(db, "DELETE FROM community_space_roles WHERE user_id = ?", userId),
  stmt(db, "UPDATE community_reports SET reporter_user_id = NULL WHERE reporter_user_id = ?", userId),
  stmt(db, "UPDATE community_reports SET handled_by = NULL WHERE handled_by = ?", userId),
  stmt(db, "DELETE FROM community_space_bans WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM community_notifications WHERE user_id = ?", userId),
  stmt(db, "UPDATE community_notifications SET actor_user_id = NULL WHERE actor_user_id = ?", userId),
  // Each feature's own data (its tables), whether or not it is switched on.
  ...eraseStmts(db, userId),
  stmt(db, "DELETE FROM community_members WHERE user_id = ?", userId)
];

export async function communityExport(db, userId) {
  const [member, threads, posts, votes] = await Promise.all([
    all(db, "SELECT display_name AS displayName, age_confirmed_at AS ageConfirmedAt, created_at AS joinedAt, word_view AS wordView FROM community_members WHERE user_id = ?", userId),
    all(db, "SELECT id, title, type, state, created_at AS createdAt FROM community_threads WHERE author_user_id = ? ORDER BY created_at", userId),
    all(db, "SELECT id, thread_id AS threadId, body, state, created_at AS createdAt, edited_at AS editedAt FROM community_posts WHERE author_user_id = ? ORDER BY created_at", userId),
    all(db, "SELECT target_type AS targetType, target_id AS targetId, kind, created_at AS createdAt FROM community_votes WHERE user_id = ? ORDER BY created_at", userId)
  ]);
  return { member: member[0] || null, threads, posts, votes, features: await exportData(db, userId) };
}

// The community's part of deleting an account and of the data download (server/account/delete.js, export.js;
// docs/community-safety.md, "Retention"). Deleting: posts and threads stay but no longer name anyone ("deleted user"),
// the display name, votes, blocks, space roles and edit history go; posts removed for a legal reason keep their text
// for the legal retention, but not who wrote them. The export lists everything the person wrote and did.
import { stmt, all } from "../../lib/db.js";
import { eraseStmts, exportData } from "./hooks.js";

export const eraseCommunityStmts = (db, userId) => [
  stmt(db, "DELETE FROM community_post_edits WHERE post_id IN (SELECT id FROM community_posts WHERE author_user_id = ?)", userId),
  stmt(db, "UPDATE community_posts SET author_user_id = NULL WHERE author_user_id = ?", userId),
  stmt(db, "UPDATE community_threads SET author_user_id = NULL WHERE author_user_id = ?", userId),
  stmt(db, "DELETE FROM community_votes WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM community_blocks WHERE user_id = ? OR blocked_user_id = ?", userId, userId),
  stmt(db, "DELETE FROM community_space_roles WHERE user_id = ?", userId),
  stmt(db, "UPDATE community_reports SET reporter_user_id = NULL WHERE reporter_user_id = ?", userId),
  // Each feature's own data (its tables), whether or not it is switched on.
  ...eraseStmts(db, userId),
  stmt(db, "DELETE FROM community_members WHERE user_id = ?", userId)
];

export async function communityExport(db, userId) {
  const [member, threads, posts, votes] = await Promise.all([
    all(db, "SELECT display_name AS displayName, age_confirmed_at AS ageConfirmedAt, created_at AS joinedAt FROM community_members WHERE user_id = ?", userId),
    all(db, "SELECT id, title, type, state, created_at AS createdAt FROM community_threads WHERE author_user_id = ? ORDER BY created_at", userId),
    all(db, "SELECT id, thread_id AS threadId, body, state, created_at AS createdAt, edited_at AS editedAt FROM community_posts WHERE author_user_id = ? ORDER BY created_at", userId),
    all(db, "SELECT target_type AS targetType, target_id AS targetId, kind, created_at AS createdAt FROM community_votes WHERE user_id = ? ORDER BY created_at", userId)
  ]);
  return { member: member[0] || null, threads, posts, votes, features: await exportData(db, userId) };
}

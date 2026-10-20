// Reading threads and their posts for the public pages (docs/community.md). Only visible threads and posts are listed;
// a hidden or removed post shows as a placeholder in its thread so replies keep their place. Authors come from
// community_members; a deleted account (author NULL) or one without a name shows as "deleted user".
// Sorting: new (latest activity), top (upvotes) and hot (upvotes weighed by age), the default. Hot ranks the most
// recently active threads in code, since D1 has no power function to rank in SQL.
import { first, all } from "../../lib/db.js";

export const PAGE_SIZE = 25;
const HOT_WINDOW = 300;
export const SORTS = ["hot", "new", "top"];

const THREAD_COLS = `t.id, t.space_id AS spaceId, t.channel_id AS channelId, t.type, t.title, t.slug, t.state, t.locked, t.pinned,
  t.accepted_post_id AS acceptedPostId, t.score, t.reply_count AS replyCount, t.last_post_at AS lastPostAt, t.created_at AS createdAt,
  m.display_name AS author,
  EXISTS (SELECT 1 FROM community_posts a WHERE a.id = t.accepted_post_id AND a.state = 'visible') AS answered`;

// Hot: score over (age in hours + 2)^1.5, the usual decay; pinned threads first everywhere.
export const hotness = (t, nowMs = Date.now()) => (t.score + 1) / Math.pow((nowMs - Date.parse(t.lastPostAt)) / 3600000 + 2, 1.5);

export async function listThreads(db, { spaceId = null, channelId = null, sort = "hot", page = 1 } = {}) {
  const where = ["t.state = 'visible'"];
  const params = [];
  if (spaceId) { where.push("t.space_id = ?"); params.push(spaceId); }
  if (channelId) { where.push("t.channel_id = ?"); params.push(channelId); }
  const order = sort === "top" ? "t.pinned DESC, t.score DESC, t.last_post_at DESC" : "t.pinned DESC, t.last_post_at DESC";
  const offset = (page - 1) * PAGE_SIZE;
  if (sort !== "hot") {
    const rows = await all(db, `SELECT ${THREAD_COLS} FROM community_threads t LEFT JOIN community_members m ON m.user_id = t.author_user_id
      WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, PAGE_SIZE + 1, offset);
    return { threads: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE };
  }
  const rows = await all(db, `SELECT ${THREAD_COLS} FROM community_threads t LEFT JOIN community_members m ON m.user_id = t.author_user_id
    WHERE ${where.join(" AND ")} ORDER BY t.last_post_at DESC LIMIT ?`, ...params, HOT_WINDOW);
  const now = Date.now();
  rows.sort((a, b) => (b.pinned - a.pinned) || (hotness(b, now) - hotness(a, now)));
  return { threads: rows.slice(offset, offset + PAGE_SIZE), more: rows.length > offset + PAGE_SIZE };
}

export const getThread = (db, id) => first(db, `SELECT ${THREAD_COLS} FROM community_threads t
  LEFT JOIN community_members m ON m.user_id = t.author_user_id WHERE t.id = ?`, id);

export const listPosts = (db, threadId) => all(db, `SELECT p.id, p.parent_post_id AS parentId, p.body, p.state, p.helpful, p.created_at AS createdAt, p.edited_at AS editedAt,
  m.display_name AS author FROM community_posts p LEFT JOIN community_members m ON m.user_id = p.author_user_id
  WHERE p.thread_id = ? ORDER BY p.created_at, p.id LIMIT 500`, threadId);

// Every visible thread for the sitemap, newest activity first (the sitemap protocol allows 50,000 per file).
export const sitemapThreads = (db) => all(db, `SELECT t.id, t.slug, t.last_post_at AS lastPostAt FROM community_threads t
  WHERE t.state = 'visible' ORDER BY t.last_post_at DESC LIMIT 50000`);

// Questions nobody has answered yet, newest first, for the front page's box for newcomers.
export const unanswered = (db, limit = 5) => all(db, `SELECT ${THREAD_COLS} FROM community_threads t LEFT JOIN community_members m ON m.user_id = t.author_user_id
  WHERE t.state = 'visible' AND t.type = 'question' AND t.reply_count = 0 ORDER BY t.created_at DESC LIMIT ?`, limit);


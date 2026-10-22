// Editing and deleting your own posts (docs/community.md, "Posting limits"): edits for 24 hours after posting, each
// earlier version kept in community_post_edits; deleting marks the post removed by its author (the text stays out of
// every page; the daily sweep deletes it 12 months later, core/retention.js). Deleting a thread's opening post
// removes the thread. Someone else's post looks like nothing there.
import { first, stmt, now } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { cleanBody, getSpace } from "./posting.js";
import { requirePoster } from "./access.js";
import { check, emit } from "./hooks.js";

export const EDIT_WINDOW_MS = 24 * 3600 * 1000;

async function ownPost(db, userId, postId) {
  const post = await first(db, `SELECT p.*, t.space_id, t.channel_id, t.slug, t.state AS thread_state, t.locked AS thread_locked,
      (SELECT id FROM community_posts o WHERE o.thread_id = p.thread_id ORDER BY o.created_at, o.id LIMIT 1) AS opening_id
    FROM community_posts p JOIN community_threads t ON t.id = p.thread_id WHERE p.id = ?`, postId);
  if (!post || post.author_user_id !== userId || post.state !== "visible" || post.thread_state === "removed") fail(404, "not_found", "That post doesn't exist.");
  return post;
}

export async function editPost(app, user, postId, { body }) {
  const post = await ownPost(app.db, user.id, postId);
  if (Date.now() - Date.parse(post.created_at) > EDIT_WINDOW_MS) fail(403, "edit_window", "Posts can be edited for 24 hours after posting.");
  // Editing is posting: a ban, a suspension, a read-only space, a locked or hidden take all stop it (deleting doesn't).
  if (post.thread_state !== "visible") fail(404, "not_found", "That post doesn't exist.");
  if (post.thread_locked) fail(403, "thread_locked", "This take is locked.");
  await requirePoster(app, user, await getSpace(app.db, post.space_id));
  const text = cleanBody(body);
  if (text === post.body) return post;
  const hold = await check(app, "post", { user, space: await getSpace(app.db, post.space_id), channel: { id: post.channel_id }, thread: { id: post.thread_id }, kind: "edit", body: text, team: false });
  // An edit can't wait in a queue (the old text is showing): it is refused, saying why.
  if (hold) fail(403, "needs_approval", `This edit can't be posted: ${hold.reason}`);
  const at = now();
  await app.db.batch([
    stmt(app.db, "INSERT INTO community_post_edits (post_id, at, body) VALUES (?, ?, ?)", post.id, at, post.body),
    stmt(app.db, "UPDATE community_posts SET body = ?, edited_at = ? WHERE id = ? AND author_user_id = ?", text, at, post.id, user.id)
  ]);
  await emit(app, "postEdited", { user, post: { ...post, body: text } });
  return post;
}

export async function deletePost(app, user, postId) {
  const post = await ownPost(app.db, user.id, postId);
  const opening = post.opening_id === post.id;
  const at = now();
  await app.db.batch([
    stmt(app.db, "UPDATE community_posts SET state = 'removed', removed_reason = 'author', removed_at = ? WHERE id = ? AND author_user_id = ?", at, post.id, user.id),
    opening
      ? stmt(app.db, "UPDATE community_threads SET state = 'removed', removed_reason = 'author', removed_at = ? WHERE id = ?", at, post.thread_id)
      : stmt(app.db, "UPDATE community_threads SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?", post.thread_id)
  ]);
  await emit(app, "postRemoved", { user, post, byAuthor: true });
  return post;
}

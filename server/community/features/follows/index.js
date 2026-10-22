// Follow a take (owner, 2026-10-20; docs/community.md, "Features"): you follow your own takes and the ones you reply
// to automatically, can follow or unfollow any take yourself, and hear about new replies in your inbox (a "followed"
// notice, through core/notify.js). Its own switch (community.follows): off, nobody is added or told; follows are kept.
import { json, fail, id } from "../../../lib/http.js";
import { first, all, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requirePoster } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { notify } from "../../core/notify.js";

const MAX_FOLLOWS = 2000;

const add = (db, userId, threadId, auto) => run(db, "INSERT INTO community_thread_follows (user_id, thread_id, auto, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", userId, threadId, auto, now());

async function follow(app, { threadId }, on) {
  const user = await requireUser(app);
  await limit(app, "community-follow", 120, 600, { by: user.id });
  const t = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", id(threadId, "threadId"));
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  await requirePoster(app, user, await getSpace(app.db, t.space_id));
  if (!on) await run(app.db, "DELETE FROM community_thread_follows WHERE user_id = ? AND thread_id = ?", user.id, t.id);
  else {
    if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_thread_follows WHERE user_id = ?", user.id)).n >= MAX_FOLLOWS) fail(400, "too_many_follows", "That's the most takes you can follow.");
    await add(app.db, user.id, t.id, 0);
  }
  return json({ following: on });
}

export default {
  name: "follows",
  switch: "community.follows",
  routes: [["PUT", "/api/community/threads/:threadId/follow", (app, p) => follow(app, p, true)], ["DELETE", "/api/community/threads/:threadId/follow", (app, p) => follow(app, p, false)]],
  state: { thread: async (app, user, t) => ({ following: Boolean(await first(app.db, "SELECT 1 AS n FROM community_thread_follows WHERE user_id = ? AND thread_id = ?", user.id, t.id)) }) },
  on: {
    threadStarted: async (app, { user, thread }) => { await add(app.db, user.id, thread.id, 1); },
    replyPosted: async (app, { user, thread, post }) => {
      await add(app.db, user.id, thread.id, 1);
      const followers = await all(app.db, "SELECT user_id FROM community_thread_follows WHERE thread_id = ? AND user_id <> ? LIMIT 500", thread.id, user.id);
      for (const f of followers) await notify(app, { userId: f.user_id, kind: "followed", threadId: thread.id, postId: post.id, actorUserId: user.id });
    }
  },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_thread_follows WHERE user_id = ?", userId)],
  exportData: async (db, userId) => ({ following: await all(db, "SELECT thread_id AS threadId, auto, created_at AS createdAt FROM community_thread_follows WHERE user_id = ? ORDER BY created_at", userId) })
};

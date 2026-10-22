// The on-site inbox (owner, 2026-10-20; docs/community.md, "Features"): a bell with replies to your takes and posts,
// mentions, best-answer picks and replies in takes you follow. This feature turns replies and picked answers into
// notices (through core/notify.js; mentions and follows add their own) and lists them: GET /api/community/inbox, and
// POST /api/community/inbox/read marks them seen. Only your own, only for takes that are still showing; read notices
// older than 90 days and any older than a year go in the daily sweep. Its own switch (community.inbox): off, no bell;
// notices keep gathering.
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { notify } from "../../core/notify.js";
import { threadPath } from "../../core/render-parts.js";

const NO_STORE = { "Cache-Control": "no-store" };
const DAY = 86400000;

async function list(app) {
  const user = await requireUser(app);
  const rows = await all(app.db, `SELECT n.id, n.kind, n.post_id AS postId, n.created_at AS at, n.read_at AS readAt, t.id AS threadId, t.slug, t.title, m.display_name AS actor
    FROM community_notifications n JOIN community_threads t ON t.id = n.thread_id LEFT JOIN community_members m ON m.user_id = n.actor_user_id
    WHERE n.user_id = ? AND t.state = 'visible' ORDER BY n.created_at DESC LIMIT 50`, user.id);
  const unread = (await first(app.db, `SELECT COUNT(*) AS n FROM community_notifications n JOIN community_threads t ON t.id = n.thread_id
    WHERE n.user_id = ? AND n.read_at IS NULL AND t.state = 'visible'`, user.id)).n;
  return json({ unread, items: rows.map((r) => ({ id: r.id, kind: r.kind, read: Boolean(r.readAt), at: r.at, actor: r.actor || null, title: r.title,
    path: `${threadPath({ id: r.threadId, slug: r.slug })}${r.postId ? `#${r.postId}` : ""}` })) }, 200, NO_STORE);
}

async function markRead(app) {
  const user = await requireUser(app);
  await limit(app, "community-inbox-read", 120, 600, { by: user.id });
  const b = await readJson(app.request);
  if (b.all === true) await run(app.db, "UPDATE community_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now(), user.id);
  else await run(app.db, "UPDATE community_notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL", now(), user.id, str(b.id, "id", { max: 80 }));
  return json({ ok: true });
}

export default {
  name: "inbox",
  switch: "community.inbox",
  routes: [["GET", "/api/community/inbox", list], ["POST", "/api/community/inbox/read", markRead]],
  on: {
    replyPosted: async (app, { user, thread, parent, post }) => {
      await notify(app, { userId: thread.author_user_id, kind: "reply", threadId: thread.id, postId: post.id, actorUserId: user.id });
      if (parent) {
        const p = await first(app.db, "SELECT author_user_id FROM community_posts WHERE id = ?", parent.id);
        if (p) await notify(app, { userId: p.author_user_id, kind: "reply", threadId: thread.id, postId: post.id, actorUserId: user.id });
      }
    },
    answerPicked: async (app, { user, thread, post }) => {
      const p = await first(app.db, "SELECT author_user_id FROM community_posts WHERE id = ?", post.id);
      if (p) await notify(app, { userId: p.author_user_id, kind: "answer", threadId: thread.id, postId: post.id, actorUserId: user.id });
    }
  },
  sweep: async (app, { nowMs = Date.now() } = {}) => {
    const read = await run(app.db, "DELETE FROM community_notifications WHERE read_at IS NOT NULL AND read_at < ?", new Date(nowMs - 90 * DAY).toISOString());
    const old = await run(app.db, "DELETE FROM community_notifications WHERE created_at < ?", new Date(nowMs - 365 * DAY).toISOString());
    return { cleared: read.meta.changes + old.meta.changes };
  },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_notifications WHERE user_id = ?", userId)]
};

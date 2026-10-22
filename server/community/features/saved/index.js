// Save for later (owner, 2026-10-20; docs/community.md, "Features"): a private Saved list of takes, only ever shown
// to its owner. Takes that were hidden or removed drop out of the list when it's read. Its own switch
// (community.saved): off, no Save buttons or list; saved takes are kept.
import { json, fail, id } from "../../../lib/http.js";
import { first, all, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { threadPath } from "../../core/render-parts.js";
import { SHOWN } from "../../core/spaces.js";

const MAX_SAVED = 500;
const NO_STORE = { "Cache-Control": "no-store" };

async function save(app, { threadId }, on) {
  const user = await requireUser(app);
  await limit(app, "community-save", 120, 600, { by: user.id });
  const t = await first(app.db, "SELECT id FROM community_threads WHERE id = ? AND state = 'visible'", id(threadId, "threadId"));
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  if (!on) await run(app.db, "DELETE FROM community_saved WHERE user_id = ? AND thread_id = ?", user.id, t.id);
  else {
    if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_saved WHERE user_id = ?", user.id)).n >= MAX_SAVED) fail(400, "too_many_saved", "Your Saved list is full. Remove some first.");
    await run(app.db, "INSERT INTO community_saved (user_id, thread_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", user.id, t.id, now());
  }
  return json({ saved: on });
}

async function list(app) {
  const user = await requireUser(app);
  const rows = await all(app.db, `SELECT t.id, t.slug, t.title, s.name AS space FROM community_saved v JOIN community_threads t ON t.id = v.thread_id
    JOIN community_spaces s ON s.id = t.space_id WHERE v.user_id = ? AND t.state = 'visible' AND ${SHOWN("t.space_id")} ORDER BY v.created_at DESC LIMIT 100`, user.id);
  return json({ saved: rows.map((r) => ({ id: r.id, title: r.title, space: r.space, path: threadPath(r) })) }, 200, NO_STORE);
}

export default {
  name: "saved",
  switch: "community.saved",
  routes: [
    ["GET", "/api/community/saved", list],
    ["PUT", "/api/community/threads/:threadId/save", (app, p) => save(app, p, true)],
    ["DELETE", "/api/community/threads/:threadId/save", (app, p) => save(app, p, false)]
  ],
  state: { thread: async (app, user, t) => ({ saved: Boolean(await first(app.db, "SELECT 1 AS n FROM community_saved WHERE user_id = ? AND thread_id = ?", user.id, t.id)) }) },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_saved WHERE user_id = ?", userId)],
  exportData: async (db, userId) => ({ saved: await all(db, "SELECT thread_id AS threadId, created_at AS createdAt FROM community_saved WHERE user_id = ? ORDER BY created_at", userId) })
};

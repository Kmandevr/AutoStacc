// Blocking someone (docs/community.md, "Who enforces what"; issue #137): by community name, never yourself. The person
// you block can't reply under your takes or anywhere below your posts (checked before every reply, up the whole
// branch), and their posts fold away for you on every page (js/community-blocks.js; pages are shared and cached, so
// the folding happens in your browser). They aren't notified, though a refused reply shows them they can't reply
// there. A space's team is never stopped from replying in its own space. Later features that connect people (friends, the feed, collab requests) check community_blocks too.
// Its own switch (community.blocks): off, replies aren't checked and nothing folds; blocks already made are kept.
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { getMember } from "../../core/members.js";
import { nameKey } from "../../core/names.js";

const MAX_BLOCKS = 1000;
const NO_STORE = { "Cache-Control": "no-store" };

async function named(app) {
  const user = await requireUser(app);
  await limit(app, "community-block", 60, 3600, { by: user.id });
  const body = await readJson(app.request);
  const other = await first(app.db, "SELECT user_id, display_name FROM community_members WHERE name_key = ?", nameKey(str(body.name, "name", { max: 60 })));
  if (!other) fail(404, "no_member", "Nobody in the community has that name.");
  if (other.user_id === user.id) fail(400, "own_account", "You can't block yourself.");
  return { user, other };
}

async function block(app) {
  const { user, other } = await named(app);
  if (!(await getMember(app.db, user.id))) fail(403, "not_a_member", "Pick your username first.");
  const count = await first(app.db, "SELECT COUNT(*) AS n FROM community_blocks WHERE user_id = ?", user.id);
  if (count.n >= MAX_BLOCKS) fail(400, "too_many_blocks", "That's the most people you can block.");
  await run(app.db, "INSERT INTO community_blocks (user_id, blocked_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", user.id, other.user_id, now());
  return json({ ok: true });
}

async function unblock(app) {
  const { user, other } = await named(app);
  await run(app.db, "DELETE FROM community_blocks WHERE user_id = ? AND blocked_user_id = ?", user.id, other.user_id);
  return json({ ok: true });
}

// Who you've blocked, by name (people whose accounts are gone drop out).
async function list(app) {
  const user = await requireUser(app);
  const rows = await all(app.db, `SELECT m.display_name AS name FROM community_blocks b JOIN community_members m ON m.user_id = b.blocked_user_id
    WHERE b.user_id = ? ORDER BY b.created_at DESC`, user.id);
  return json({ names: rows.map((r) => r.name) }, 200, NO_STORE);
}

// Before a reply: nobody above it (the take's author and every post up the branch) has blocked you.
async function postCheck(app, { user, kind, thread, parent, team }) {
  if (kind !== "reply" || team) return;
  const hit = await first(app.db, `WITH RECURSIVE up(id, author, depth) AS (
      SELECT id, author_user_id, 0 FROM community_posts WHERE id = ?1
      UNION ALL SELECT p.parent_post_id, (SELECT author_user_id FROM community_posts WHERE id = p.parent_post_id), up.depth + 1
        FROM up JOIN community_posts p ON p.id = up.id WHERE p.parent_post_id IS NOT NULL AND up.depth < 60)
    SELECT 1 AS n FROM community_blocks WHERE blocked_user_id = ?2
      AND user_id IN (SELECT author FROM up WHERE author IS NOT NULL UNION SELECT ?3) LIMIT 1`,
  parent ? parent.id : "", user.id, (thread && thread.author_user_id) || "");
  if (hit) fail(403, "blocked", "You can't reply here.");
}

export default {
  name: "blocks",
  switch: "community.blocks",
  routes: [
    ["GET", "/api/community/blocks", list],
    ["PUT", "/api/community/blocks", block],
    ["DELETE", "/api/community/blocks", unblock]
  ],
  checks: { post: postCheck },
  // The core erases blocks with the account (both ways); the download lists who you blocked.
  exportData: async (db, userId) => ({
    blocked: (await all(db, `SELECT m.display_name AS name, b.created_at AS createdAt FROM community_blocks b
      LEFT JOIN community_members m ON m.user_id = b.blocked_user_id WHERE b.user_id = ? ORDER BY b.created_at`, userId)).map((r) => ({ ...r, name: r.name || "deleted user" }))
  })
};

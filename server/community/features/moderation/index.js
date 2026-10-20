// Space teams' moderation (docs/community.md, "Who enforces what"; issue #137): pin, lock, move, hide, remove and
// restore takes and posts (actions.js), ban people from the space (bans.js), and appeals, the author's notices and
// the team's log (appeals.js). State changes go through the core's moderate.js, which the reports feature shares.
// Its own switch (community.moderation): off, these routes are 404 and nothing already decided changes.
import { all, stmt } from "../../../lib/db.js";
import { actionRoutes } from "./actions.js";
import { banRoutes } from "./bans.js";
import { appealRoutes } from "./appeals.js";

export default {
  name: "moderation",
  switch: "community.moderation",
  routes: [...actionRoutes, ...banRoutes, ...appealRoutes],
  // For the take page's team tools (shown only to the team; nothing here is private).
  state: { thread: async (app, user, t) => ({ pinned: Boolean(t.pinned), locked: Boolean(t.locked), spaceId: t.space_id }) },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_appeals WHERE user_id = ?", userId),
    stmt(db, "UPDATE community_appeals SET handled_by = NULL WHERE handled_by = ?", userId)],
  exportData: async (db, userId) => ({
    appeals: await all(db, "SELECT target_type AS targetType, target_id AS targetId, note, status, created_at AS createdAt FROM community_appeals WHERE user_id = ? ORDER BY created_at", userId)
  })
};

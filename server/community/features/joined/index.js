// Join a space (owner, 2026-10-20; docs/community.md, "Features"): a person's joined spaces come first on their front
// page. Pages are shared and cached, so the ordering happens in the browser (js/community-joined.js) from this list.
// Joining needs no permission beyond being a member; a banned or suspended person can still join (it only changes what
// they see first). Its own switch (community.joined): off, no Join buttons and no reordering; joins are kept.
import { json, fail, id } from "../../../lib/http.js";
import { first, all, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { getMember } from "../../core/members.js";
import { getSpace } from "../../core/posting.js";

const MAX_JOINED = 200;
const NO_STORE = { "Cache-Control": "no-store" };

async function join(app, { spaceId }, on) {
  const user = await requireUser(app);
  await limit(app, "community-join-space", 120, 600, { by: user.id });
  if (!(await getMember(app.db, user.id))) fail(403, "not_a_member", "Pick your username first.");
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space || space.state === "archived") fail(404, "not_found", "That space doesn't exist.");
  if (!on) await run(app.db, "DELETE FROM community_space_joins WHERE user_id = ? AND space_id = ?", user.id, space.id);
  else {
    if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_space_joins WHERE user_id = ?", user.id)).n >= MAX_JOINED) fail(400, "too_many_joined", "That's the most spaces you can join.");
    await run(app.db, "INSERT INTO community_space_joins (user_id, space_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", user.id, space.id, now());
  }
  return json({ joined: on });
}

async function mine(app) {
  const user = await requireUser(app);
  return json({ spaceIds: (await all(app.db, "SELECT space_id FROM community_space_joins WHERE user_id = ?", user.id)).map((r) => r.space_id) }, 200, NO_STORE);
}

export default {
  name: "joined",
  switch: "community.joined",
  routes: [
    ["GET", "/api/community/joined", mine],
    ["PUT", "/api/community/spaces/:spaceId/join", (app, p) => join(app, p, true)],
    ["DELETE", "/api/community/spaces/:spaceId/join", (app, p) => join(app, p, false)]
  ],
  // A place for the Join button on the space's page; js/community-joined.js fills it.
  slots: { spaceHeader: ({ space }) => `<div class="cm-join" data-cm-join="${String(space.id).replace(/[^A-Za-z0-9_-]/g, "")}"></div>` },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_space_joins WHERE user_id = ?", userId)],
  exportData: async (db, userId) => ({ spaces: (await all(db, "SELECT space_id AS spaceId, created_at AS createdAt FROM community_space_joins WHERE user_id = ? ORDER BY created_at", userId)) })
};

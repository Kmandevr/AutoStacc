// A welcome message (owner, 2026-10-20; docs/community.md, "Features"): a space's team writes a short message that a
// signed-in member sees once, on their first visit to the space or when they first post there (whichever comes first),
// and dismisses. Plain text, up to 500 characters. Its own switch (community.welcome): off, nothing shows; messages
// and who has seen them are kept.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { first, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { getMember } from "../../core/members.js";
import { getSpace } from "../../core/posting.js";
import { teamSpace } from "../../core/team-space.js";

const NO_STORE = { "Cache-Control": "no-store" };
const seen = (db, userId, spaceId) => run(db, "INSERT INTO community_welcome_seen (user_id, space_id) VALUES (?, ?) ON CONFLICT DO NOTHING", userId, spaceId);

async function show(app, { spaceId }) {
  const user = await requireUser(app);
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space || !(await getMember(app.db, user.id))) return json({ message: null }, 200, NO_STORE);
  const w = await first(app.db, `SELECT message FROM community_welcome w WHERE space_id = ?1 AND NOT EXISTS
    (SELECT 1 FROM community_welcome_seen s WHERE s.space_id = ?1 AND s.user_id = ?2)`, space.id, user.id);
  return json({ message: w ? w.message : null }, 200, NO_STORE);
}

async function dismiss(app, { spaceId }) {
  const user = await requireUser(app);
  await limit(app, "community-welcome-seen", 60, 600, { by: user.id });
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  await seen(app.db, user.id, space.id);
  return json({ ok: true });
}

async function write(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-welcome" });
  const message = str((await readJson(app.request)).message ?? "", "message", { min: 0, max: 500 }).trim();
  if (!message) await run(app.db, "DELETE FROM community_welcome WHERE space_id = ?", space.id);
  else await run(app.db, `INSERT INTO community_welcome (space_id, message, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(space_id) DO UPDATE SET message = excluded.message, updated_at = excluded.updated_at`, space.id, message, now());
  // A new message is new to everyone.
  await run(app.db, "DELETE FROM community_welcome_seen WHERE space_id = ?", space.id);
  return json({ ok: true });
}

const current = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  const w = await first(app.db, "SELECT message FROM community_welcome WHERE space_id = ?", space.id);
  return json({ message: w ? w.message : "" }, 200, NO_STORE);
};

export default {
  name: "welcome",
  switch: "community.welcome",
  routes: [
    ["GET", "/api/community/spaces/:spaceId/welcome", show],
    ["POST", "/api/community/spaces/:spaceId/welcome/seen", dismiss],
    ["GET", "/api/community/spaces/:spaceId/welcome/message", current],
    ["PUT", "/api/community/spaces/:spaceId/welcome/message", write]
  ],
  // Posting there counts as having been welcomed.
  on: {
    threadStarted: (app, { user, space }) => seen(app.db, user.id, space.id),
    replyPosted: (app, { user, space }) => seen(app.db, user.id, space.id)
  },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_welcome_seen WHERE user_id = ?", userId)]
};

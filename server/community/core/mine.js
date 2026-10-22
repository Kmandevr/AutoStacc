// What a visitor has done and may do in a take, for its page's buttons (GET /api/community/threads/:id/mine): their
// own visible posts (with the text as written, for editing), whether they started it, whether they're the space's
// team (with its name, for "Post as"), and whether it takes replies. Features add their own parts (hooks.js state). Never another person's text.
import { first, all } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { isTeam } from "./access.js";
import { getSpace } from "./posting.js";

export async function mine(app, user, threadId) {
  const t = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", threadId);
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  if (!user) return { signedIn: false, thread: t };
  const space = await getSpace(app.db, t.space_id);
  const team = await isTeam(app, user, space);
  const own = await all(app.db, "SELECT id, body, created_at AS createdAt FROM community_posts WHERE thread_id = ? AND author_user_id = ? AND state = 'visible'", t.id, user.id);
  return {
    signedIn: true,
    thread: t,
    ownPosts: own,
    asker: t.author_user_id === user.id,
    team,
    teamName: team ? space.name : null,
    canReply: space.state === "open" && !t.locked
  };
}

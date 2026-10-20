// A space team's tools on takes and posts (docs/community.md, "Who enforces what"): pin, lock, move between the
// space's channels, hide, remove under the space's rules, and restore (which also undoes another moderator's or the
// automatic rules' hide). Every action is logged with the reason (the author is told why: the DSA's statement of
// reasons), counts as team activity, and is limited per moderator so a stolen account can't empty a space.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { first, stmt, guardStmt } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requireTeam } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { loadTarget, setState, logStmts, guarded, purgeTarget } from "../../core/moderate.js";

const STATE_OF = { hide: "hidden", remove: "removed", restore: "visible" };
const FLAGS = { pin: ["pinned", 1], unpin: ["pinned", 0], lock: ["locked", 1], unlock: ["locked", 0] };
const NEEDS_REASON = new Set(["hide", "remove"]);

// The acting team member, after the per-moderator limit (60 actions in 10 minutes).
export async function moderator(app, spaceId) {
  const user = await requireUser(app);
  await limit(app, "community-mod", 60, 600, { by: user.id });
  return { user, space: await requireTeam(app, user, await getSpace(app.db, spaceId)) };
}

export function readReason(body, required) {
  const reason = body.reason === undefined || body.reason === null ? "" : str(body.reason, "reason", { max: 500 }).trim();
  if (required && reason.length < 3) fail(400, "reason_required", "Say why, in a few words: the author is told.", { field: "reason" });
  return reason;
}

async function move(app, target, user, channelId, reason) {
  const to = await first(app.db, "SELECT * FROM community_channels WHERE id = ? AND space_id = ? AND archived_at IS NULL", channelId, target.spaceId);
  if (!to) fail(404, "not_found", "That channel isn't in this space.");
  const type = (await first(app.db, "SELECT type FROM community_threads WHERE id = ?", target.id)).type;
  if (!to.post_types.split(",").includes(type)) fail(400, "invalid_field", "That channel doesn't take this kind of post.", { field: "channelId" });
  await guarded(app.db, [
    guardStmt(app.db, "EXISTS (SELECT 1 FROM community_threads WHERE id = ? AND state <> 'removed')", target.id),
    stmt(app.db, "UPDATE community_threads SET channel_id = ? WHERE id = ?", to.id, target.id),
    ...logStmts(app.db, { spaceId: target.spaceId, actorId: user.id, action: "move", targetType: "thread", targetId: target.id, reason: reason || `to ${to.name}` })
  ]);
  await purgeTarget(app, target, [to.id]);
}

async function threadAction(app, { threadId }) {
  const target = await loadTarget(app.db, "thread", id(threadId, "threadId"));
  if (!target) fail(404, "not_found", "That take doesn't exist.");
  const { user } = await moderator(app, target.spaceId);
  const body = await readJson(app.request);
  const action = str(body.action, "action", { max: 20 });
  const reason = readReason(body, NEEDS_REASON.has(action));
  if (STATE_OF[action]) {
    await setState(app, target, STATE_OF[action], { action, actorId: user.id, reason });
  } else if (FLAGS[action]) {
    const [col, value] = FLAGS[action];
    await guarded(app.db, [
      guardStmt(app.db, "EXISTS (SELECT 1 FROM community_threads WHERE id = ? AND state <> 'removed')", target.id),
      stmt(app.db, `UPDATE community_threads SET ${col} = ? WHERE id = ?`, value, target.id),
      ...logStmts(app.db, { spaceId: target.spaceId, actorId: user.id, action, targetType: "thread", targetId: target.id, reason })
    ]);
    await purgeTarget(app, target);
  } else if (action === "move") {
    await move(app, target, user, id(body.channelId, "channelId"), reason);
  } else {
    fail(400, "invalid_field", "Unknown action.", { field: "action" });
  }
  return json({ ok: true });
}

async function postAction(app, { postId }) {
  const target = await loadTarget(app.db, "post", id(postId, "postId"));
  if (!target || target.thread.state === "removed") fail(404, "not_found", "That post doesn't exist.");
  const { user } = await moderator(app, target.spaceId);
  const body = await readJson(app.request);
  const action = str(body.action, "action", { max: 20 });
  if (!STATE_OF[action]) fail(400, "invalid_field", "Unknown action.", { field: "action" });
  // The opening post is the take itself: hiding it hides the take.
  if (target.opening) fail(400, "use_thread", "That's the take's opening post: moderate the take instead.");
  await setState(app, target, STATE_OF[action], { action, actorId: user.id, reason: readReason(body, NEEDS_REASON.has(action)) });
  return json({ ok: true });
}

export const actionRoutes = [
  ["POST", "/api/community/mod/threads/:threadId", threadAction],
  ["POST", "/api/community/mod/posts/:postId", postAction]
];

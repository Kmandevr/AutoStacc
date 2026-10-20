// The community core's API (docs/community.md), 404 while the community.forum switch is off; features add their own
// routes through hooks.js (featureRoutes). Reads for the page's buttons are per visitor and never cached; every write
// needs a signed-in account with a confirmed email (requireUser), is refused during a support impersonation (the policy
// refuses writes that don't opt in), counts against a per-client request limit, passes the features' checks (posting
// pace, link rules...) and clears the cached pages it changes.
import { json, readJson, id, str, fail } from "../../lib/http.js";
import { requireFeature } from "../../lib/features.js";
import { currentUser, requireUser } from "../../auth/session.js";
import { limit } from "../../lib/ratelimit.js";
import { getMember, join } from "./members.js";
import { startThread, reply, getSpace } from "./posting.js";
import { isTeam } from "./access.js";
import { editPost, deletePost } from "./edits.js";
import { mine } from "./mine.js";
import { purge } from "./purge.js";
import { threadPath } from "./render-parts.js";
import { featureRoutes, state, featuresOn } from "./hooks.js";

const NO_STORE = { "Cache-Control": "no-store" };

async function writer(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  await limit(app, "community-write", 60, 600);
  return user;
}

async function me(app) {
  requireFeature(app, "community.forum");
  const user = await currentUser(app);
  const features = featuresOn(app);
  if (!user) return json({ signedIn: false, features }, 200, NO_STORE);
  const member = await getMember(app.db, user.id);
  return json({ signedIn: true, emailVerified: Boolean(user.emailVerified), member: member && { displayName: member.displayName }, features }, 200, NO_STORE);
}

async function setMe(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  await limit(app, "community-join", 10, 3600);
  const body = await readJson(app.request);
  const member = await join(app.db, user.id, { displayName: str(body.displayName, "displayName", { max: 60 }), ageConfirmed: body.ageConfirmed });
  return json({ member: { displayName: member.displayName } }, 201);
}

async function newThread(app) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const r = await startThread(app, user, { channelId: id(body.channelId, "channelId"), type: str(body.type, "type", { max: 20 }),
    title: str(body.title, "title", { max: 400 }), body: str(body.body, "body", { max: 20000 }) });
  purge(app, r);
  return json({ thread: { id: r.thread.id, path: threadPath(r.thread) } }, 201);
}

async function newReply(app, { threadId }) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const parentId = body.parentId === undefined || body.parentId === null ? null : id(body.parentId, "parentId");
  const r = await reply(app, user, id(threadId, "threadId"), { body: str(body.body, "body", { max: 20000 }), parentId });
  purge(app, r);
  return json({ post: { id: r.id, path: `${threadPath(r.thread)}#${r.id}` } }, 201);
}

async function edit(app, { postId }) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const post = await editPost(app, user, id(postId, "postId"), { body: str(body.body, "body", { max: 20000 }) });
  purge(app, { thread: { id: post.thread_id, slug: post.slug } });
  return json({ ok: true });
}

async function remove(app, { postId }) {
  const user = await writer(app);
  const post = await deletePost(app, user, id(postId, "postId"));
  purge(app, { thread: { id: post.thread_id, slug: post.slug } });
  return json({ ok: true });
}

// The visitor's own posts, team role and whether they may reply, plus each switched-on feature's state for this take.
async function threadMine(app, { threadId }) {
  requireFeature(app, "community.forum");
  const user = await currentUser(app);
  const core = await mine(app, user, id(threadId, "threadId"));
  return json({ ...core, features: user ? await state(app, user, core.thread) : {}, thread: undefined }, 200, NO_STORE);
}

// Whether the visitor is on a space's team, for its page's team desk (features add the desk's parts).
async function spaceMine(app, { spaceId }) {
  requireFeature(app, "community.forum");
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  const user = await currentUser(app);
  return json({ signedIn: Boolean(user), team: user ? await isTeam(app, user, space) : false, state: space.state, stateReason: space.state_reason || null }, 200, NO_STORE);
}

export const routes = [
  ["GET", "/api/community/me", me],
  ["PUT", "/api/community/me", setMe],
  ["POST", "/api/community/threads", newThread],
  ["POST", "/api/community/threads/:threadId/posts", newReply],
  ["GET", "/api/community/threads/:threadId/mine", threadMine],
  ["GET", "/api/community/spaces/:spaceId/mine", spaceMine],
  ["PATCH", "/api/community/posts/:postId", edit],
  ["DELETE", "/api/community/posts/:postId", remove],
  ...featureRoutes()
];

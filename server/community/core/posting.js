// Starting takes (threads) and replying (docs/community.md, "Post types"): Discussions and Questions for now (Updates,
// Polls and Challenges come with their own steps). A reply may answer another reply in the same take (nested, any
// depth). Before writing, every switched-on feature's "post" check may refuse (slow mode, link rules, self-promotion);
// after, the core emits threadStarted or replyPosted for features to react to (follows, mentions, the inbox). The channel decides which types it takes and whether only the space's
// team may start threads. A locked thread or a space that isn't open takes no replies. Thread addresses are made here
// from the title: lowercase letters, digits and hyphens only, which is all /community/t/<id>-<slug> accepts.
import { first, stmt, newId, now } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { MAX_BODY } from "./format.js";
import { isTeam, requirePoster } from "./access.js";
import { check, emit } from "./hooks.js";
import { holdStmts, requireRoom } from "./holds.js";

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
export const TITLE = { min: 5, max: 150 };
export const STARTABLE = ["discussion", "question"];

export const slugify = (title) => String(title).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "thread";

export function cleanTitle(raw) {
  const t = String(raw || "").replace(BIDI, "").replace(/\s+/g, " ").trim();
  if (t.length < TITLE.min || t.length > TITLE.max) fail(400, "invalid_field", `A title is ${TITLE.min} to ${TITLE.max} characters.`, { field: "title" });
  return t;
}

export function cleanBody(raw) {
  const b = String(raw || "").replace(BIDI, "").replace(/\r\n?/g, "\n").trim();
  if (!b) fail(400, "invalid_field", "Write something first.", { field: "body" });
  if (b.length > MAX_BODY) fail(400, "invalid_field", `Keep it under ${MAX_BODY.toLocaleString("en-US")} characters.`, { field: "body" });
  return b;
}

export const getSpace = (db, id) => first(db, "SELECT * FROM community_spaces WHERE id = ?", id);
const touchTeam = (db, space, at) => stmt(db, "UPDATE community_spaces SET last_team_activity_at = ? WHERE id = ?", at, space.id);

export async function startThread(app, user, { channelId, type, title, body }) {
  const channel = await first(app.db, "SELECT * FROM community_channels WHERE id = ? AND archived_at IS NULL", channelId);
  if (!channel) fail(404, "not_found", "That channel doesn't exist.");
  const space = await getSpace(app.db, channel.space_id);
  await requirePoster(app, user, space);
  const team = await isTeam(app, user, space);
  if (channel.who_may_start === "team" && !team) fail(403, "team_only", "Only this space's team starts threads here.");
  if (!STARTABLE.includes(type) || !channel.post_types.split(",").includes(type)) fail(400, "invalid_field", "This channel doesn't take that kind of post.", { field: "type" });
  const t = cleanTitle(title);
  const text = cleanBody(body);
  const hold = await requireRoom(app, user, await check(app, "post", { user, space, channel, thread: null, kind: "thread", type, title: t, body: text, team }));
  const at = now();
  const thread = { id: newId("thr"), slug: slugify(t), spaceId: space.id };
  await app.db.batch([
    stmt(app.db, `INSERT INTO community_threads (id, space_id, channel_id, type, title, slug, author_user_id, state, last_post_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, thread.id, space.id, channel.id, type, t, thread.slug, user.id, hold ? "hidden" : "visible", at, at),
    stmt(app.db, "INSERT INTO community_posts (id, thread_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", newId("pst"), thread.id, user.id, text, at),
    ...(hold ? holdStmts(app.db, { targetType: "thread", targetId: thread.id, spaceId: space.id, authorId: user.id, hold }) : []),
    ...(team ? [touchTeam(app.db, space, at)] : [])
  ]);
  if (hold) return { thread, space, channel, held: true };
  await emit(app, "threadStarted", { user, space, channel, thread: { ...thread, type, title: t }, body: text });
  return { thread, space, channel };
}

export async function reply(app, user, threadId, { body, parentId = null }) {
  const thread = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", threadId);
  if (!thread) fail(404, "not_found", "That thread doesn't exist.");
  const space = await getSpace(app.db, thread.space_id);
  await requirePoster(app, user, space);
  if (thread.locked) fail(403, "thread_locked", "This take is locked.");
  const text = cleanBody(body);
  // A reply to a reply: the parent must be a visible post of this same take.
  const parent = parentId ? await first(app.db, "SELECT id, author_user_id FROM community_posts WHERE id = ? AND thread_id = ? AND state = 'visible'", parentId, thread.id) : null;
  if (parentId && !parent) fail(404, "not_found", "The post you're replying to isn't there any more.");
  const channel = await first(app.db, "SELECT * FROM community_channels WHERE id = ?", thread.channel_id);
  if (!channel || channel.archived_at) fail(403, "channel_archived", "This channel is archived: its takes are read-only.");
  const team = await isTeam(app, user, space);
  const hold = await requireRoom(app, user, await check(app, "post", { user, space, channel, thread, kind: "reply", type: thread.type, parent, body: text, team }));
  const at = now();
  const id = newId("pst");
  await app.db.batch([
    stmt(app.db, "INSERT INTO community_posts (id, thread_id, parent_post_id, author_user_id, state, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, thread.id, parent ? parent.id : null, user.id, hold ? "hidden" : "visible", text, at),
    ...(hold ? holdStmts(app.db, { targetType: "post", targetId: id, spaceId: space.id, authorId: user.id, hold }) : [stmt(app.db, "UPDATE community_threads SET reply_count = reply_count + 1, last_post_at = ? WHERE id = ?", at, thread.id)]),
    ...(team ? [touchTeam(app.db, space, at)] : [])
  ]);
  if (hold) return { id, thread: { id: thread.id, slug: thread.slug }, space, channel, held: true };
  await emit(app, "replyPosted", { user, space, channel, thread, parent, post: { id, body: text } });
  return { id, thread: { id: thread.id, slug: thread.slug }, space, channel };
}

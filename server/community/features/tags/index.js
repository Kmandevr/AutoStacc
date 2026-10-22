// Tags (owner, 2026-10-20; docs/community.md, "Features"): AutoStacc's starter list (the store's own genre, style, DAW,
// plugin, content and level words) plus up to 20 each space's team adds; people pick from those, never type their own.
// A take has up to 3 tags, set by its author within 24 hours of posting or by the space's team. Tags show beside takes
// (js/community-tags.js reads them for the takes on the page) and a tag lists its takes. Hidden and removed takes never
// appear. Its own switch (community.tags): off, no tags show or can be set; they are kept.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { all, first, run, stmt, now } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { isTeam, requirePoster, requireTeam } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { threadPath } from "../../core/render-parts.js";
import { teamSpace } from "../../core/team-space.js";
import { EDIT_WINDOW_MS } from "../../core/edits.js";
import { STARTER, STARTER_KEYS, key } from "./starter.js";

const MAX_PER_THREAD = 3;
const MAX_PER_SPACE = 20;
const NO_STORE = { "Cache-Control": "no-store" };

const spaceTags = (db, spaceId) => all(db, "SELECT key, label FROM community_space_tags WHERE space_id = ? ORDER BY label", spaceId);

async function allowed(db, spaceId) {
  return new Map([...STARTER.map((t) => [t.key, t.label]), ...(await spaceTags(db, spaceId)).map((t) => [t.key, t.label])]);
}

async function list(app) {
  const space = new URL(app.request.url).searchParams.get("space");
  return json({ starter: STARTER, space: space ? await spaceTags(app.db, id(space, "space")) : [] }, 200, { "Cache-Control": "public, max-age=300" });
}

// The tags of up to 25 takes at once, for the page's list (only takes that are showing have any).
async function forThreads(app) {
  await limit(app, "community-tags-read", 240, 600);
  const ids = (new URL(app.request.url).searchParams.get("threads") || "").split(",").filter(Boolean).slice(0, 25).map((x) => id(x, "threads"));
  if (!ids.length) return json({ tags: {} }, 200, NO_STORE);
  const rows = await all(app.db, `SELECT g.thread_id, g.tag, sp.label AS label FROM community_thread_tags g
    JOIN community_threads t ON t.id = g.thread_id AND t.state = 'visible' JOIN community_spaces s ON s.id = t.space_id AND s.state <> 'archived'
    LEFT JOIN community_space_tags sp ON sp.space_id = t.space_id AND sp.key = g.tag
    WHERE g.thread_id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids));
  const labels = new Map(STARTER.map((t) => [t.key, t.label]));
  const out = {};
  // A tag whose space-added label is gone (removed while being set) shows nothing.
  for (const r of rows) if (labels.has(r.tag) || r.label) (out[r.thread_id] = out[r.thread_id] || []).push({ key: r.tag, label: labels.get(r.tag) || r.label });
  return json({ tags: out }, 200, NO_STORE);
}

async function setTags(app, { threadId }) {
  const user = await requireUser(app);
  await limit(app, "community-tags-set", 60, 600, { by: user.id });
  const t = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", id(threadId, "threadId"));
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  const space = await getSpace(app.db, t.space_id);
  const team = await isTeam(app, user, space);
  const mine = t.author_user_id === user.id && Date.now() - Date.parse(t.created_at) <= EDIT_WINDOW_MS;
  if (!team && !mine) fail(403, "not_allowed", "Only the author (for 24 hours) or the space's team sets tags.");
  // The same standing as posting: a ban, a suspension or a space that isn't open stops it (a team member's own standing is checked as theirs).
  if (team) await requireTeam(app, user, space); else await requirePoster(app, user, space);
  const body = await readJson(app.request);
  if (!Array.isArray(body.tags) || body.tags.length > MAX_PER_THREAD) fail(400, "invalid_field", `Pick up to ${MAX_PER_THREAD} tags.`, { field: "tags" });
  const ok = await allowed(app.db, t.space_id);
  const tags = [...new Set(body.tags.map((x) => (typeof x === "string" ? x : "")))];
  if (tags.some((x) => !ok.has(x))) fail(400, "invalid_field", "Pick tags from the list.", { field: "tags" });
  await app.db.batch([stmt(app.db, "DELETE FROM community_thread_tags WHERE thread_id = ?", t.id), ...tags.map((x) => stmt(app.db, "INSERT INTO community_thread_tags (thread_id, tag) VALUES (?, ?)", t.id, x))]);
  return json({ tags });
}

async function tagged(app) {
  await limit(app, "community-tagged", 60, 600);
  const url = new URL(app.request.url);
  const tag = String(url.searchParams.get("tag") || "").slice(0, 40);
  if (!/^[a-z0-9-]{1,40}$/.test(tag)) fail(400, "invalid_field", "Unknown tag.", { field: "tag" });
  const space = url.searchParams.get("space");
  // A space's own tag means something only inside that space; AutoStacc's starter tags work everywhere.
  if (!STARTER_KEYS.has(tag) && !space) fail(400, "invalid_field", "Say which space that tag belongs to.", { field: "space" });
  const rows = await all(app.db, `SELECT t.id, t.slug, t.title, t.type, t.reply_count AS replies, s.name AS space FROM community_thread_tags g
    JOIN community_threads t ON t.id = g.thread_id JOIN community_spaces s ON s.id = t.space_id
    WHERE g.tag = ? AND t.state = 'visible' AND s.state <> 'archived' ${space ? "AND t.space_id = ?" : ""} ORDER BY t.last_post_at DESC LIMIT 30`, tag, ...(space ? [id(space, "space")] : []));
  return json({ results: rows.map((r) => ({ id: r.id, title: r.title, type: r.type, replies: r.replies, space: r.space, path: threadPath(r) })) }, 200, NO_STORE);
}

async function addSpaceTag(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-space-tags" });
  const label = str((await readJson(app.request)).label, "label", { max: 30 }).trim();
  const k = key(label);
  if (label.length < 2 || k.length < 2) fail(400, "invalid_field", "A short name for the tag.", { field: "label" });
  if (STARTER_KEYS.has(k)) fail(409, "already_there", "AutoStacc's list already has that tag.");
  if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_space_tags WHERE space_id = ?", space.id)).n >= MAX_PER_SPACE) fail(409, "too_many", `A space can add up to ${MAX_PER_SPACE} tags.`);
  await run(app.db, "INSERT INTO community_space_tags (space_id, key, label, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", space.id, k, label, now());
  return json({ ok: true, key: k }, 201);
}

async function removeSpaceTag(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-space-tags" });
  const k = str((await readJson(app.request)).key, "key", { max: 40 });
  const r = await run(app.db, "DELETE FROM community_space_tags WHERE space_id = ? AND key = ?", space.id, k);
  if (!r.meta.changes) fail(404, "not_found", "That isn't one of this space's tags.");
  await run(app.db, "DELETE FROM community_thread_tags WHERE tag = ? AND thread_id IN (SELECT id FROM community_threads WHERE space_id = ?)", k, space.id);
  return json({ ok: true });
}

export default {
  name: "tags",
  switch: "community.tags",
  state: { thread: async (app, user, t) => ({ spaceId: t.space_id }) },
  routes: [
    ["GET", "/api/community/tags", list],
    ["GET", "/api/community/tags/for", forThreads],
    ["GET", "/api/community/tagged", tagged],
    ["PUT", "/api/community/threads/:threadId/tags", setTags],
    ["POST", "/api/community/spaces/:spaceId/tags", addSpaceTag],
    ["DELETE", "/api/community/spaces/:spaceId/tags", removeSpaceTag]
  ]
};

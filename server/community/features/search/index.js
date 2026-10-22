// Community search (owner, 2026-10-20; docs/community.md, "Features"): takes whose title or any showing reply has all
// the words typed, newest activity first, optionally inside one space, channel or kind. Only takes that are visible,
// and only replies that are visible, count: a hidden or removed take, or a word that appears only in a removed post,
// finds nothing. Open to everyone who can read the community, limited per client. Its own switch (community.search).
import { json, fail, id } from "../../../lib/http.js";
import { all } from "../../../lib/db.js";
import { limit } from "../../../lib/ratelimit.js";
import { terms, likeTerm } from "../../core/terms.js";
import { threadPath } from "../../core/render-parts.js";
import { SHOWN } from "../../core/spaces.js";

const PAGE = 20;
const TYPES = ["discussion", "question", "update", "poll", "challenge"];

async function search(app) {
  await limit(app, "community-search", 60, 600);
  const url = new URL(app.request.url);
  // Words of three letters or more: a two-letter term would scan every post for little value.
  const words = terms(url.searchParams.get("q"), 3);
  if (!words.length) fail(400, "invalid_field", "Type a word or two to look for.", { field: "q" });
  const where = ["t.state = 'visible'", "s.state <> 'archived'", SHOWN("t.space_id")];
  const args = [];
  for (const w of words) {
    where.push(`(t.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM community_posts p WHERE p.thread_id = t.id AND p.state = 'visible' AND p.body LIKE ? ESCAPE '\\'))`);
    args.push(likeTerm(w), likeTerm(w));
  }
  const pick = (name, col) => { const v = url.searchParams.get(name); if (v) { where.push(`${col} = ?`); args.push(id(v, name)); } };
  pick("space", "t.space_id");
  pick("channel", "t.channel_id");
  const type = url.searchParams.get("type");
  if (type) { if (!TYPES.includes(type)) fail(400, "invalid_field", "Unknown kind.", { field: "type" }); where.push("t.type = ?"); args.push(type); }
  const page = Math.min(10, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const rows = await all(app.db, `SELECT t.id, t.slug, t.title, t.type, t.reply_count AS replies, t.last_post_at AS at, s.name AS space, c.name AS channel
    FROM community_threads t JOIN community_spaces s ON s.id = t.space_id JOIN community_channels c ON c.id = t.channel_id
    WHERE ${where.join(" AND ")} ORDER BY t.last_post_at DESC LIMIT ? OFFSET ?`, ...args, PAGE + 1, (page - 1) * PAGE);
  return json({ results: rows.slice(0, PAGE).map((r) => ({ id: r.id, title: r.title, type: r.type, replies: r.replies, space: r.space, channel: r.channel, at: r.at, path: threadPath(r) })), more: rows.length > PAGE }, 200, { "Cache-Control": "no-store" });
}

export default { name: "search", switch: "community.search", routes: [["GET", "/api/community/search", search]] };

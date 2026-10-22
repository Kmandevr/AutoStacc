// Similar takes (owner, 2026-10-20; docs/community.md, "Features"): while someone types a new question's title, the
// questions that already share its words, best match first, so they can read an answer before asking again. Only
// visible questions; a match needs at least half of the words (at least one). Its own switch (community.similar).
import { json, fail, id } from "../../../lib/http.js";
import { all } from "../../../lib/db.js";
import { limit } from "../../../lib/ratelimit.js";
import { terms, likeTerm } from "../../core/terms.js";
import { threadPath } from "../../core/render-parts.js";

async function similar(app) {
  await limit(app, "community-similar", 120, 600);
  const url = new URL(app.request.url);
  const words = terms(url.searchParams.get("title"));
  if (!words.length) return json({ similar: [] }, 200, { "Cache-Control": "no-store" });
  const score = words.map(() => "(t.title LIKE ? ESCAPE '\\')").join(" + ");
  const args = words.map(likeTerm);
  const space = url.searchParams.get("space");
  const rows = await all(app.db, `SELECT t.id, t.slug, t.title, t.reply_count AS replies, (${score}) AS score,
      EXISTS (SELECT 1 FROM community_posts a WHERE a.id = t.accepted_post_id AND a.state = 'visible') AS answered
    FROM community_threads t JOIN community_spaces s ON s.id = t.space_id
    WHERE t.state = 'visible' AND t.type = 'question' AND s.state <> 'archived' ${space ? "AND t.space_id = ?" : ""} AND (${score}) >= ?
    ORDER BY score DESC, answered DESC, t.last_post_at DESC LIMIT 5`, ...args, ...(space ? [id(space, "space")] : []), ...args, Math.max(1, Math.ceil(words.length / 2)));
  if (!Array.isArray(rows)) fail(500, "error", "Try again.");
  return json({ similar: rows.map((r) => ({ id: r.id, title: r.title, replies: r.replies, answered: Boolean(r.answered), path: threadPath(r) })) }, 200, { "Cache-Control": "no-store" });
}

export default { name: "similar", switch: "community.similar", routes: [["GET", "/api/community/similar", similar]] };

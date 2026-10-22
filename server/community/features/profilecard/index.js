// The mini profile card (owner, 2026-10-20; docs/community.md, "Features"): tapping a name shows who they are: the
// name, when they joined (month and year), how many best answers they have and the community spaces they help run.
// Nothing private: no account, email, votes, blocks or activity beyond these. Block is the blocks feature's own button;
// reporting a person is done from one of their posts. Its own switch (community.profileCard).
import { json, fail, str } from "../../../lib/http.js";
import { first, all } from "../../../lib/db.js";
import { limit } from "../../../lib/ratelimit.js";
import { nameKey } from "../../core/names.js";

async function card(app) {
  await limit(app, "community-profile-card", 120, 600);
  const key = nameKey(str(new URL(app.request.url).searchParams.get("name") || "", "name", { max: 60 }));
  const m = key.length >= 3 && await first(app.db, "SELECT user_id, display_name, created_at FROM community_members WHERE name_key = ?", key);
  if (!m) fail(404, "not_found", "Nobody in the community has that name.");
  const best = await first(app.db, `SELECT COUNT(*) AS n FROM community_threads t JOIN community_posts p ON p.id = t.accepted_post_id
    WHERE p.author_user_id = ? AND p.state = 'visible' AND t.state = 'visible' AND t.type = 'question'`, m.user_id);
  const teams = await all(app.db, `SELECT s.name, r.role FROM community_space_roles r JOIN community_spaces s ON s.id = r.space_id
    WHERE r.user_id = ? AND s.state <> 'archived' ORDER BY s.name LIMIT 5`, m.user_id);
  return json({ name: m.display_name, since: m.created_at.slice(0, 7), bestAnswers: best.n, teams: teams.map((t) => ({ space: t.name, role: t.role })) }, 200, { "Cache-Control": "public, max-age=60" });
}

export default { name: "profilecard", switch: "community.profileCard", routes: [["GET", "/api/community/members/card", card]] };

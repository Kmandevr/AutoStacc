// New-account rules (owner, 2026-10-20; docs/community.md, "Automatic moderation"). A space's team can treat people as
// new while their account is younger than a set number of days, or while they have fewer than a set number of posts in
// that space, and then either hold their posts for the team or refuse posts with links. Team members are never
// "new". Its own switch (community.newAccount): off, the rules stop (they stay stored).
import { json, readJson, fail } from "../../../lib/http.js";
import { first, run, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { hasLink } from "../../core/format.js";

const DAY = 86400000;

async function postCheck(app, { user, space, body, team }) {
  if (team || user.id === undefined) return null;
  const rule = await first(app.db, "SELECT account_days, space_posts, mode FROM community_newaccount_rules WHERE space_id = ?", space.id);
  if (!rule || (!rule.account_days && !rule.space_posts)) return null;
  let isNew = false;
  if (rule.account_days) {
    const row = await first(app.db, 'SELECT createdAt FROM "user" WHERE id = ?', user.id);
    isNew = !row || Date.now() - new Date(row.createdAt).getTime() < rule.account_days * DAY;
  }
  if (!isNew && rule.space_posts) {
    const n = (await first(app.db, `SELECT COUNT(*) AS n FROM community_posts p JOIN community_threads t ON t.id = p.thread_id
      WHERE t.space_id = ? AND p.author_user_id = ? AND p.state = 'visible'`, space.id, user.id)).n;
    isNew = n < rule.space_posts;
  }
  if (!isNew) return null;
  if (rule.mode === "nolinks") {
    if (hasLink(body || "")) fail(403, "new_account_links", "New members of this space can't post links yet. Take part for a while first.");
    return null;
  }
  return { hold: { rule: "new_account", reason: "This space's team looks at a new member's first posts before they appear." } };
}

const read = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  const rule = await first(app.db, "SELECT account_days AS accountDays, space_posts AS spacePosts, mode FROM community_newaccount_rules WHERE space_id = ?", space.id);
  return json({ rule: rule || { accountDays: 0, spacePosts: 0, mode: "hold" } }, 200, { "Cache-Control": "no-store" });
};

async function save(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-newaccount" });
  const b = await readJson(app.request);
  const num = (v, field, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : fail(400, "invalid_field", `A whole number from 0 to ${max}.`, { field }));
  const accountDays = num(b.accountDays, "accountDays", 90);
  const spacePosts = num(b.spacePosts, "spacePosts", 20);
  if (b.mode !== "hold" && b.mode !== "nolinks") fail(400, "invalid_field", "Hold their posts, or refuse links.", { field: "mode" });
  await run(app.db, `INSERT INTO community_newaccount_rules (space_id, account_days, space_posts, mode, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(space_id) DO UPDATE SET account_days = excluded.account_days, space_posts = excluded.space_posts, mode = excluded.mode, updated_at = excluded.updated_at`,
  space.id, accountDays, spacePosts, b.mode, now());
  return json({ ok: true });
}

export default {
  name: "newaccount",
  switch: "community.newAccount",
  checks: { post: postCheck },
  routes: [["GET", "/api/community/spaces/:spaceId/new-account-rule", read], ["PUT", "/api/community/spaces/:spaceId/new-account-rule", save]]
};

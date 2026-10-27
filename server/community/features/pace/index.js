// Posting pace (owner, 2026-10-20; docs/community.md, "Features"): checked before every take and reply.
//   - slow mode: each space's team sets a wait between one person's posts in that space (off, 30 s, 2 min, 10 min);
//     the team itself isn't slowed
//   - site-wide: at most 3 posts a minute per person, like Reddit's rate limit
//   - the same text twice in a row (within 10 minutes) is refused
//   - a high daily safety net (new accounts lower), so a stolen account can't flood
// The per-minute and slow-mode limits are atomic counters, so parallel posts can't race past them; the duplicate and
// daily checks read the posts themselves, and the per-minute counter bounds how far a burst could get past those.
// Its own switch (community.pace): off, only the core's per-client request limit applies.
import { json, readJson, fail, id, int } from "../../../lib/http.js";
import { first, run, newId } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { isTeam, requireManager } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { purge } from "../../core/purge.js";
import { esc } from "../../core/render-parts.js";

export const SLOW_MODES = [0, 30, 120, 600];
const PER_MINUTE = 3;
const DUPLICATE_MS = 10 * 60 * 1000;
const NEW_ACCOUNT_DAYS = 7;
export const DAILY = { new: { thread: 20, reply: 200 }, established: { thread: 50, reply: 1000 } };
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const isNew = (user) => Date.now() - new Date(user.createdAt || 0).getTime() < NEW_ACCOUNT_DAYS * 86400000;
const label = (s) => (s >= 60 ? `${s / 60} minute${s === 60 ? "" : "s"}` : `${s} seconds`);

// One atomic step (an upsert that returns the new count, in the rateLimit table the site's limiter uses), so posts
// sent at the same moment are counted one by one and can't all pass (security review, 2026-10-20). Counts attempts
// that reach this check; the window starts with the first one.
async function take(db, key, windowSeconds) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ?3 - lastRequest > ?4 THEN 1 ELSE count + 1 END,
       lastRequest = CASE WHEN ?3 - lastRequest > ?4 THEN ?3 ELSE lastRequest END
     RETURNING count, lastRequest`).bind(newId("rl"), `gs:${key}`, now, windowSeconds * 1000).first();
  return { count: row.count, wait: Math.max(1, Math.ceil((row.lastRequest + windowSeconds * 1000 - now) / 1000)) };
}

async function postCheck(app, { user, space, kind, body, team }) {
  if (kind === "edit") return;
  const db = app.db;
  const minute = await take(db, `community-pace:${user.id}`, 60);
  if (minute.count > PER_MINUTE) fail(429, "posting_too_fast", "You're posting very fast. Take a breath and try again in a minute.", { retryAfter: minute.wait });
  const last = await first(db, "SELECT body, created_at FROM community_posts WHERE author_user_id = ? ORDER BY created_at DESC LIMIT 1", user.id);
  if (last && last.body === body && Date.now() - Date.parse(last.created_at) < DUPLICATE_MS) fail(409, "duplicate_post", "You just posted exactly that. Say something new, or edit your post.");
  const slow = space.slow_mode_seconds || 0;
  if (slow && !team) {
    const gate = await take(db, `community-slow:${space.id}:${user.id}`, slow);
    if (gate.count > 1) fail(429, "slow_mode", `This space has slow mode on: one post every ${label(slow)}. Try again in ${gate.wait} s.`, { retryAfter: gate.wait });
  }
  const cap = DAILY[isNew(user) ? "new" : "established"][kind === "thread" ? "thread" : "reply"];
  const today = kind === "thread"
    ? await first(db, "SELECT COUNT(*) AS n FROM community_threads WHERE author_user_id = ? AND created_at > ?", user.id, ago(86400000))
    : await first(db, "SELECT COUNT(*) AS n FROM community_posts WHERE author_user_id = ? AND created_at > ?", user.id, ago(86400000));
  if (today.n >= cap) fail(429, "daily_limit", "That's the most you can post today. It resets within a day.");
}

// The current setting, for the Team desk (team only, like the switch).
async function getSlowMode(app, { spaceId }) {
  const user = await requireUser(app);
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space || !(await isTeam(app, user, space))) fail(404, "not_found", "Not found.");
  return json({ seconds: space.slow_mode_seconds || 0, choices: SLOW_MODES }, 200, { "Cache-Control": "no-store" });
}

async function setSlowMode(app, { spaceId }) {
  const user = await requireUser(app);
  const space = await requireManager(app, user, await getSpace(app.db, id(spaceId, "spaceId")));
  const seconds = int((await readJson(app.request)).seconds, "seconds", { min: 0, max: 600 });
  if (!SLOW_MODES.includes(seconds)) fail(400, "invalid_field", "Choose off, 30 seconds, 2 minutes or 10 minutes.", { field: "seconds" });
  await run(app.db, "UPDATE community_spaces SET slow_mode_seconds = ? WHERE id = ?", seconds, space.id);
  purge(app, { space });
  return json({ seconds });
}

export default {
  name: "pace",
  switch: "community.pace",
  routes: [["GET", "/api/community/spaces/:spaceId/slow-mode", getSlowMode], ["PUT", "/api/community/spaces/:spaceId/slow-mode", setSlowMode]],
  checks: { post: postCheck },
  slots: { spaceHeader: ({ space }) => (space.slow_mode_seconds ? `<p class="cm-note cm-slow" role="note">Slow mode: one post every ${esc(label(space.slow_mode_seconds))}.</p>` : "") }
};

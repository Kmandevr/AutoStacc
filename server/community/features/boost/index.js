// Boost (owner, 2026-10-20: the community's upvote, drawn as a small level meter; docs/community.md). One boost per
// person per take, never your own; boosts feed the Hot and Top sorts through the take's stored score. Its own switch
// (community.boost): off, the meter and the routes go, scores stay as they were.
import { json, fail, id } from "../../../lib/http.js";
import { first } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requirePoster } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { purge } from "../../core/purge.js";
import { esc } from "../../core/render-parts.js";
import { setVote, votesOf } from "../../core/votes-store.js";

const LEVELS = 6;
const level = (n) => Math.min(LEVELS, n <= 0 ? 0 : Math.ceil(Math.log2(n + 1)));
const meter = (n, cls) => `<span class="${cls}" aria-hidden="true">${Array.from({ length: LEVELS }, (_, i) => `<i${i < level(n) ? ' class="on"' : ""}></i>`).join("")}</span>`;

const boost = (on) => async (app, { threadId }) => {
  const user = await requireUser(app);
  await limit(app, "community-boost", 120, 600);
  const t = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", id(threadId, "threadId"));
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  if (t.author_user_id === user.id) fail(403, "own_post", "You can't boost your own take.");
  const space = await getSpace(app.db, t.space_id);
  await requirePoster(app, user, space);
  await setVote(app.db, { targetType: "thread", targetId: t.id, userId: user.id, kind: "up", on });
  purge(app, { thread: t, space });
  const now = await first(app.db, "SELECT score FROM community_threads WHERE id = ?", t.id);
  return json({ boosted: on, count: now.score });
};

export default {
  name: "boost",
  switch: "community.boost",
  routes: [
    ["PUT", "/api/community/threads/:threadId/boost", boost(true)],
    ["DELETE", "/api/community/threads/:threadId/boost", boost(false)]
  ],
  state: { thread: async (app, user, t) => ({ boosted: (await votesOf(app.db, user.id, "thread", [t.id], "up")).has(t.id), own: t.author_user_id === user.id }) },
  slots: {
    listMeters: ({ thread }) => `<span class="cm-mini-boost" title="${thread.score} boost${thread.score === 1 ? "" : "s"}">${meter(thread.score, "cm-mini-meter")}<span class="cm-count">${thread.score}</span></span>`,
    threadTools: ({ thread }) => `<div class="cm-boost" data-cm-boost="${esc(thread.id)}" data-count="${thread.score}">${meter(thread.score, "cm-meter")}<span class="cm-count">${thread.score}</span> <span class="cm-small">${thread.score === 1 ? "boost" : "boosts"}</span></div>`
  },
  schema: { thread: ({ thread }, entity) => { entity.interactionStatistic = { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: thread.score }; } }
};

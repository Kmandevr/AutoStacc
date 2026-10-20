// Questions and answers (docs/community.md, "Post types"): Helpful votes on answers (one per person, never your own,
// only in question takes) and the Best answer, picked by the person who asked or the space's team. The best answer
// comes first, then answers by Helpful votes. Its own switch (community.qa): off, questions read like discussions in
// time order, and the votes and pick stay stored for when it's back.
import { json, readJson, fail, id } from "../../../lib/http.js";
import { first, run } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requirePoster, isTeam } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { purge } from "../../core/purge.js";
import { plain } from "../../core/format.js";
import { setVote, votesOf } from "../../core/votes-store.js";

const OPENING = "(SELECT id FROM community_posts o WHERE o.thread_id = t.id ORDER BY o.created_at, o.id LIMIT 1)";

const helpful = (on) => async (app, { postId }) => {
  const user = await requireUser(app);
  await limit(app, "community-helpful", 120, 600);
  const p = await first(app.db, `SELECT p.*, t.space_id, t.type, t.state AS thread_state, t.slug, ${OPENING} AS opening_id
    FROM community_posts p JOIN community_threads t ON t.id = p.thread_id WHERE p.id = ?`, id(postId, "postId"));
  if (!p || p.state !== "visible" || p.thread_state !== "visible") fail(404, "not_found", "That post doesn't exist.");
  if (p.type !== "question" || p.opening_id === p.id) fail(400, "not_an_answer", "Only answers to questions can be marked helpful.");
  if (p.author_user_id === user.id) fail(403, "own_post", "You can't mark your own answer helpful.");
  const space = await getSpace(app.db, p.space_id);
  await requirePoster(app, user, space);
  await setVote(app.db, { targetType: "post", targetId: p.id, userId: user.id, kind: "helpful", on });
  purge(app, { thread: { id: p.thread_id, slug: p.slug }, space });
  return json({ ok: true });
};

async function pick(app, { threadId }) {
  const user = await requireUser(app);
  await limit(app, "community-pick", 60, 600);
  const t = await first(app.db, "SELECT * FROM community_threads WHERE id = ? AND state = 'visible'", id(threadId, "threadId"));
  if (!t) fail(404, "not_found", "That take doesn't exist.");
  if (t.type !== "question") fail(400, "not_a_question", "Only questions have a best answer.");
  const space = await getSpace(app.db, t.space_id);
  if (t.author_user_id !== user.id && !(await isTeam(app, user, space))) fail(403, "not_asker", "Only the person who asked, or the space's team, picks the best answer.");
  if (space.state !== "open") fail(403, "space_read_only", "This space is read-only for now.");
  const body = await readJson(app.request);
  const postId = body.postId === null ? null : id(body.postId, "postId");
  if (postId && !(await first(app.db, `SELECT id FROM community_posts p WHERE id = ? AND thread_id = ? AND state = 'visible'
      AND id <> (SELECT id FROM community_posts o WHERE o.thread_id = ? ORDER BY o.created_at, o.id LIMIT 1)`, postId, t.id, t.id))) {
    fail(404, "not_found", "That answer isn't in this take.");
  }
  await run(app.db, "UPDATE community_threads SET accepted_post_id = ? WHERE id = ?", postId, t.id);
  purge(app, { thread: t, space });
  return json({ ok: true });
}

const isBest = (thread, post) => thread.type === "question" && post.id === thread.acceptedPostId && post.state === "visible";

export default {
  name: "qa",
  switch: "community.qa",
  routes: [
    ["PUT", "/api/community/posts/:postId/helpful", helpful(true)],
    ["DELETE", "/api/community/posts/:postId/helpful", helpful(false)],
    ["PUT", "/api/community/threads/:threadId/accepted", pick]
  ],
  state: {
    thread: async (app, user, t) => {
      if (t.type !== "question") return { question: false };
      const ids = ((await app.db.prepare("SELECT id FROM community_posts WHERE thread_id = ?").bind(t.id).all()).results || []).map((r) => r.id);
      const space = await getSpace(app.db, t.space_id);
      return { question: true, helpful: [...(await votesOf(app.db, user.id, "post", ids, "helpful"))], canPick: t.author_user_id === user.id || await isTeam(app, user, space) };
    }
  },
  arrange: {
    replies: (thread, replies) => {
      if (thread.type !== "question") return replies;
      const best = replies.find((p) => isBest(thread, p));
      const rest = replies.filter((p) => p !== best).sort((a, b) => (b.helpful - a.helpful) || a.createdAt.localeCompare(b.createdAt));
      return best ? [best, ...rest] : rest;
    }
  },
  slots: {
    listBadges: ({ thread }) => (thread.type === "question" && thread.answered ? '<span class="cm-badge cm-answered">Answered</span> ' : ""),
    postBadges: ({ thread, post }) => (isBest(thread, post) ? '<span class="cm-badge cm-answered">Best answer</span> ' : ""),
    postClass: ({ thread, post }) => (isBest(thread, post) ? " cm-best" : ""),
    postFooter: ({ thread, post, opening }) => (thread.type === "question" && !opening && post.helpful
      ? `<p class="cm-small cm-helpful-count">${post.helpful} found this helpful</p>` : "")
  },
  schema: {
    thread: ({ thread, posts, url, clip }, entity) => {
      const best = thread.type === "question" && posts.slice(1).find((p) => isBest(thread, p));
      if (best) entity.acceptedAnswer = { "@type": "Answer", text: clip(plain(best.body), 500), url: `${url}#${best.id}`, upvoteCount: best.helpful };
    }
  }
};

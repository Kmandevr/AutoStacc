// Word and phrase filters (owner, 2026-10-20; docs/community.md, "Automatic moderation"). AutoStacc's word levels are
// the core's (server/lib/words.js, always on); a space's team adds its own words, each either holding the post for the team or
// refusing it. Case and accents are folded and a word matches whole words only ("ass" doesn't catch "class"). A team
// member's own posts skip the team's words. A team can also make its space a clean one, where strong words are refused
// in posts too (spaces may only be stricter than AutoStacc, never looser). Its own switch (community.wordFilter): off,
// the team's words and the clean setting stop.
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, newId, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { fold } from "../../core/wording.js";
import { hasStrong } from "../../../lib/words.js";

const MAX_WORDS = 200;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, phrase) => new RegExp(`(?:^|[^a-z0-9])${esc(phrase)}(?:[^a-z0-9]|$)`).test(text);

async function postCheck(app, { space, title, body, team }) {
  // AutoStacc's own slur list is checked by the core for every post and title (server/lib/words.js), whatever this switch.
  const text = fold(`${title || ""}\n${body || ""}`);
  if (space.clean_words && hasStrong(body)) fail(403, "filtered", "This space keeps posts clean: no strong swear words.");
  if (team) return null;
  const words = await all(app.db, "SELECT phrase, action FROM community_filter_words WHERE space_id = ?", space.id);
  const hit = words.find((w) => has(text, w.phrase));
  if (!hit) return null;
  if (hit.action === "refuse") fail(403, "filtered", "That post uses words this space doesn't allow.");
  return { hold: { rule: "words", reason: "It uses a word this space's team wants to look at first." } };
}

const list = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  return json({ clean: Boolean(space.clean_words), words: await all(app.db, "SELECT id, phrase, action FROM community_filter_words WHERE space_id = ? ORDER BY phrase", space.id) }, 200, { "Cache-Control": "no-store" });
};

// A clean space refuses strong words in posts too (never looser than AutoStacc: the core's word levels always apply).
async function setClean(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-filter-words" });
  const clean = (await readJson(app.request)).clean;
  if (typeof clean !== "boolean") fail(400, "invalid_field", "On or off.", { field: "clean" });
  await run(app.db, "UPDATE community_spaces SET clean_words = ? WHERE id = ?", clean ? 1 : 0, space.id);
  return json({ clean });
}

async function add(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-filter-words" });
  const body = await readJson(app.request);
  const phrase = fold(str(body.phrase, "phrase", { max: 60 })).replace(/\s+/g, " ").trim();
  if (phrase.length < 2) fail(400, "invalid_field", "A word or phrase of at least two letters.", { field: "phrase" });
  if (body.action !== "hold" && body.action !== "refuse") fail(400, "invalid_field", "Hold the post for the team, or refuse it.", { field: "action" });
  if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_filter_words WHERE space_id = ?", space.id)).n >= MAX_WORDS) fail(409, "too_many", `A space can have up to ${MAX_WORDS} filtered words.`);
  await run(app.db, `INSERT INTO community_filter_words (id, space_id, phrase, action, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(space_id, phrase) DO UPDATE SET action = excluded.action`, newId("cfw"), space.id, phrase, body.action, now());
  return json({ ok: true });
}

async function remove(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-filter-words" });
  const wordId = str((await readJson(app.request)).id, "id", { max: 80 });
  const r = await run(app.db, "DELETE FROM community_filter_words WHERE space_id = ? AND id = ?", space.id, wordId);
  if (!r.meta.changes) fail(404, "not_found", "That word isn't on the list.");
  return json({ ok: true });
}

export default {
  name: "wordfilter",
  switch: "community.wordFilter",
  checks: { post: postCheck },
  routes: [
    ["GET", "/api/community/spaces/:spaceId/filter-words", list],
    ["PUT", "/api/community/spaces/:spaceId/filter-words", add],
    ["DELETE", "/api/community/spaces/:spaceId/filter-words", remove],
    ["PUT", "/api/community/spaces/:spaceId/clean-words", setClean]
  ]
};

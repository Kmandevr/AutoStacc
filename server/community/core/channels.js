// A space team's own changes to its space (docs/community.md, "Features", team tools): its description and rules text,
// and its channels (add, rename, who may start takes, which kinds they take, archive and bring back). The one place
// those core tables are written for the team tools feature. The caller has already checked the person is on the team.
import { first, all, run, now, newId } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { checkName } from "../../lib/words.js";
import { cleanTags } from "../../lib/tags.js";
import { slugify } from "./posting.js";

export const MAX_CHANNELS = 15;
const KINDS = ["discussion", "question", "update"];

export async function setSpaceText(db, space, { description, rules, tags }) {
  if (typeof description !== "string" || description.length > 500) fail(400, "invalid_field", "A description of up to 500 characters.", { field: "description" });
  if (typeof rules !== "string" || rules.length > 4000) fail(400, "invalid_field", "Rules of up to 4,000 characters.", { field: "rules" });
  // Tags (owner, 2026-10-27, #230): the one tag rule; left as they are when not sent.
  const list = tags === undefined ? null : JSON.stringify(cleanTags(tags));
  await run(db, "UPDATE community_spaces SET description = ?, rules = ?, tags = COALESCE(?, tags) WHERE id = ?", description.trim(), rules.trim(), list, space.id);
}

const types = (v) => {
  const list = Array.isArray(v) ? [...new Set(v)] : [];
  if (!list.length || list.some((t) => !KINDS.includes(t))) fail(400, "invalid_field", "Pick from discussions, questions and updates.", { field: "postTypes" });
  return list.join(",");
};
const who = (v) => (v === "everyone" || v === "team" ? v : fail(400, "invalid_field", "Everyone or the team.", { field: "whoMayStart" }));
const nameOf = (v) => {
  const n = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return n.length >= 2 && n.length <= 40 ? checkName(n, "name", "Channel names") : fail(400, "invalid_field", "A channel name of 2 to 40 characters.", { field: "name" });
};

export async function addChannel(db, space, { name, whoMayStart, postTypes }) {
  const n = nameOf(name);
  const live = await all(db, "SELECT position FROM community_channels WHERE space_id = ? AND archived_at IS NULL", space.id);
  if (live.length >= MAX_CHANNELS) fail(409, "too_many", `A space can have up to ${MAX_CHANNELS} channels.`);
  const slug = slugify(n);
  // /<space>/manage is the space's management page.
  if (slug === "manage") fail(400, "invalid_field", "A channel can't be called that. Pick another name.", { field: "name" });
  if (await first(db, "SELECT 1 AS n FROM community_channels WHERE space_id = ? AND slug = ?", space.id, slug)) fail(409, "channel_exists", "A channel with that name is already here (or archived).");
  const at = now();
  await run(db, "INSERT INTO community_channels (id, space_id, slug, name, position, post_types, who_may_start, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    newId("chn"), space.id, slug, n, Math.max(0, ...live.map((c) => c.position)) + 1, types(postTypes), who(whoMayStart), at);
}

export async function updateChannel(db, space, channelId, patch) {
  const c = await first(db, "SELECT * FROM community_channels WHERE id = ? AND space_id = ?", channelId, space.id);
  if (!c) fail(404, "not_found", "That channel isn't in this space.");
  if (patch.archived !== undefined && typeof patch.archived !== "boolean") fail(400, "invalid_field", "Archive or bring back.", { field: "archived" });
  await run(db, "UPDATE community_channels SET name = ?, post_types = ?, who_may_start = ? WHERE id = ?",
    patch.name === undefined ? c.name : nameOf(patch.name), patch.postTypes === undefined ? c.post_types : types(patch.postTypes),
    patch.whoMayStart === undefined ? c.who_may_start : who(patch.whoMayStart), c.id);
  if (patch.archived === true && !c.archived_at) {
    // The last live channel stays: the check is part of the write, so two archives at once can't empty the space.
    const r = await run(db, `UPDATE community_channels SET archived_at = ? WHERE id = ? AND EXISTS
      (SELECT 1 FROM community_channels o WHERE o.space_id = ? AND o.archived_at IS NULL AND o.id <> ?)`, now(), c.id, space.id, c.id);
    if (!r.meta.changes) fail(409, "last_channel", "A space keeps at least one channel.");
  } else if (patch.archived === false && c.archived_at) {
    const live = (await first(db, "SELECT COUNT(*) AS n FROM community_channels WHERE space_id = ? AND archived_at IS NULL", space.id)).n;
    if (live >= MAX_CHANNELS) fail(409, "too_many", `A space can have up to ${MAX_CHANNELS} channels.`);
    await run(db, "UPDATE community_channels SET archived_at = NULL WHERE id = ?", c.id);
  }
}

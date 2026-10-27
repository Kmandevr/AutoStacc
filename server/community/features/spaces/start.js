// Starting a community (owner, 2026-10-27; docs/community.md, "Starting communities"): any account with a confirmed
// email, a username and the 16+ confirmation, no creator needed. The founder names it and may give a description,
// rules and channel names; each has a default, so the minimum is a name, and the rest is edited later on the space's
// management page. At most community_space_cap (default 3), or the account's own exception (caps.js), open or read-only communities per account, checked inside
// the write so two at once can't pass it. Names follow the username rules (reserved words, creators' and projects'
// names unless they're your own team's) and are unique among spaces; the address is made from the name and permanent.
import { fail } from "../../../lib/http.js";
import { first, stmt, now, newId, guardStmt, isGuardFailure } from "../../../lib/db.js";
import { RESERVED } from "../../../lib/slugs.js";
import { capFor } from "./caps.js";
import { getMember } from "../../core/members.js";
import { spaceNameProblem, nameKey, cleanName } from "../../core/names.js";
import { slugify } from "../../core/posting.js";
import { logStmts } from "../../core/moderate.js";

// Words the community's own addresses use (/community/t/..., /community/<space>/manage) or may need.
const TAKEN = new Set([...RESERVED, "t", "new", "start", "manage", "questions", "challenges", "rules", "saved", "inbox", "search", "tags", "sitemap-xml"]);
export const DEFAULT_CHANNELS = ["General", "Help & questions", "Off-topic"];
const MAX_START_CHANNELS = 8;

const text = (v, field, max, label) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > max) fail(400, "invalid_field", `${label} of up to ${max.toLocaleString("en-US")} characters.`, { field });
  return v.replace(/\r\n?/g, "\n").trim();
};

function channelNames(v) {
  if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return DEFAULT_CHANNELS;
  if (!Array.isArray(v) || v.length > MAX_START_CHANNELS) fail(400, "invalid_field", `Up to ${MAX_START_CHANNELS} channels to start with.`, { field: "channels" });
  const names = v.map((n) => (typeof n === "string" ? n.replace(/\s+/g, " ").trim() : ""));
  if (names.some((n) => n.length < 2 || n.length > 40)) fail(400, "invalid_field", "Each channel name is 2 to 40 characters.", { field: "channels" });
  const slugs = names.map(slugify);
  if (new Set(slugs).size !== slugs.length) fail(400, "invalid_field", "Two channels have the same name.", { field: "channels" });
  if (slugs.some((s) => TAKEN.has(s))) fail(400, "invalid_field", "A channel can't be called that. Pick another name.", { field: "channels" });
  return names;
}

// Who may start one now: the member, or a refusal saying what's missing.
async function founderReady(app, user) {
  const member = await getMember(app.db, user.id);
  if (!member) fail(403, "not_a_member", "Pick a username and confirm you're 16 or older first.");
  const suspended = await first(app.db, "SELECT until FROM community_suspensions WHERE user_id = ?", user.id);
  if (suspended && (!suspended.until || Date.parse(suspended.until) > Date.now())) fail(403, "suspended", "Your account can't start communities right now.");
  return member;
}

export const OWNED = "SELECT COUNT(*) FROM community_spaces WHERE founder_user_id = ? AND kind = 'community' AND state <> 'archived'";

// How many more communities this account may start, for the start form.
export async function startAllowance(app, user) {
  const cap = await capFor(app.db, user.id);
  const owned = (await first(app.db, `${OWNED.replace("COUNT(*)", "COUNT(*) AS n")}`, user.id)).n;
  return { cap, owned, left: Math.max(0, cap - owned) };
}

export async function startSpace(app, user, body) {
  await founderReady(app, user);
  const name = cleanName(body.name);
  const problem = await spaceNameProblem(app.db, name, user.id);
  if (problem) fail(problem.code === "name_taken" ? 409 : 400, problem.code, problem.message, { field: "name" });
  const slug = slugify(name);
  if (TAKEN.has(slug) || slug === "thread") fail(400, "name_reserved", "That name is kept for AutoStacc. Pick another.", { field: "name" });
  if (await first(app.db, "SELECT 1 AS n FROM community_spaces WHERE slug = ?", slug)) fail(409, "name_taken", "A community already has that address. Pick another name.", { field: "name" });
  const description = text(body.description, "description", 500, "A description");
  const rules = text(body.rules, "rules", 4000, "Rules");
  const channels = channelNames(body.channels);
  const cap = await capFor(app.db, user.id);
  const at = now();
  const spaceId = newId("spc");
  try {
    await app.db.batch([
      guardStmt(app.db, `(${OWNED}) < ?`, user.id, cap),
      stmt(app.db, `INSERT INTO community_spaces (id, slug, name, name_key, kind, founder_user_id, official, description, rules, state, last_team_activity_at, created_at)
        VALUES (?, ?, ?, ?, 'community', ?, 0, ?, ?, 'open', ?, ?)`, spaceId, slug, name, nameKey(name), user.id, description, rules, at, at),
      stmt(app.db, "INSERT INTO community_space_roles (space_id, user_id, role, created_at) VALUES (?, ?, 'founder', ?)", spaceId, user.id, at),
      ...channels.map((c, i) => stmt(app.db, `INSERT INTO community_channels (id, space_id, slug, name, position, post_types, who_may_start, created_at)
        VALUES (?, ?, ?, ?, ?, 'discussion,question', 'everyone', ?)`, newId("chn"), spaceId, slugify(c), c, i, at)),
      ...logStmts(app.db, { spaceId, actorId: user.id, action: "space.start", targetType: "space", targetId: spaceId }, at)
    ]);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "space_cap", cap ? `You can start up to ${cap} communities. Archive one to start another.` : "New communities can't be started right now.");
    if (/UNIQUE/i.test(String((e && e.message) || e))) fail(409, "name_taken", "A community already has that name. Pick another.", { field: "name" });
    throw e;
  }
  return { id: spaceId, slug, name };
}

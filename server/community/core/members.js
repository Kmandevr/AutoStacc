// Community members (community_members): a display name and the 16+ confirmation, set together, once (docs/community.md).
// GET /api/community/me tells the page whether the visitor can post and what's missing; PUT sets them.
import { first, run, now } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { nameProblem, nameKey, cleanName } from "./names.js";

export const getMember = (db, userId) => first(db, "SELECT user_id AS userId, display_name AS displayName, age_confirmed_at AS ageConfirmedAt FROM community_members WHERE user_id = ?", userId);

export async function join(db, userId, { displayName, ageConfirmed }) {
  if (ageConfirmed !== true) fail(400, "age_required", "Confirm you're 16 or older to take part.", { field: "ageConfirmed" });
  if (await getMember(db, userId)) fail(409, "already_member", "You've already chosen your name.");
  const name = cleanName(displayName);
  const problem = await nameProblem(db, name, userId);
  if (problem) fail(400, problem.code, problem.message, { field: "displayName" });
  const at = now();
  try {
    await run(db, "INSERT INTO community_members (user_id, display_name, name_key, age_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?)", userId, name, nameKey(name), at, at);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) fail(409, "name_taken", "Someone already uses that name. Pick another.", { field: "displayName" });
    throw e;
  }
  return getMember(db, userId);
}

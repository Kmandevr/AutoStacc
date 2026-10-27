// Community members (community_members): a username (display_name) and the 16+ confirmation, set together when joining
// (docs/community.md). GET /api/community/me tells the page whether the visitor can post and what's missing; PUT joins;
// PATCH changes the username (owner, 2026-10-27), under the same name rules. Posts show the current name.
import { first, run, now } from "../../lib/db.js";
import { fail } from "../../lib/http.js";
import { nameProblem, nameKey, cleanName } from "./names.js";

export const getMember = (db, userId) => first(db, "SELECT user_id AS userId, display_name AS displayName, age_confirmed_at AS ageConfirmedAt FROM community_members WHERE user_id = ?", userId);

async function usable(db, userId, displayName) {
  const name = cleanName(displayName);
  const problem = await nameProblem(db, name, userId);
  if (problem) fail(400, problem.code, problem.message, { field: "displayName" });
  return name;
}
const taken = (e) => {
  if (/UNIQUE/i.test(String(e && e.message))) fail(409, "name_taken", "Someone already uses that name. Pick another.", { field: "displayName" });
  throw e;
};

export async function join(db, userId, { displayName, ageConfirmed }) {
  if (ageConfirmed !== true) fail(400, "age_required", "Confirm you're 16 or older to take part.", { field: "ageConfirmed" });
  if (await getMember(db, userId)) fail(409, "already_member", "You've already chosen your name.");
  const name = await usable(db, userId, displayName);
  const at = now();
  await run(db, "INSERT INTO community_members (user_id, display_name, name_key, age_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?)", userId, name, nameKey(name), at, at).catch(taken);
  return getMember(db, userId);
}

export async function rename(db, userId, displayName) {
  if (!(await getMember(db, userId))) fail(404, "not_member", "Choose a username first.");
  const name = await usable(db, userId, displayName);
  await run(db, "UPDATE community_members SET display_name = ?, name_key = ? WHERE user_id = ?", name, nameKey(name), userId).catch(taken);
  return getMember(db, userId);
}

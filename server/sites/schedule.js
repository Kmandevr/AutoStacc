// Scheduled publishing (docs/builder.md): a copy of the saved draft goes live at a set time, without what is edited
// afterwards. Due sites publish on the first visit after that time (sites/public.js) or at the daily sweep
// (maintenance/sweep.js), whichever comes first; the copy is taken off the row before publishing (compare-and-set), so
// two visits at once publish it once.
import { all, first, run, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { cleanDocument } from "./document.js";
import { publishSite } from "./publish.js";
import { projectSite, profileSite } from "./targets.js";
import { getCreator, getProject } from "../creators/creators.js";
import { accountLevel } from "../copyright/standing.js";

const YEAR = 366 * 24 * 3600 * 1000;

export async function scheduleSite(db, target, at, user) {
  const when = typeof at === "string" ? Date.parse(at) : NaN;
  if (!Number.isFinite(when) || when <= Date.now() + 30 * 1000 || when > Date.now() + YEAR) fail(400, "invalid_time", "Pick a time in the future, within a year.", { field: "at" });
  const site = await first(db, `SELECT draft FROM ${target.table} WHERE ${target.key} = ?`, target.id);
  const raw = parseJson(site && site.draft, null);
  if (!raw || !raw.pages) fail(409, "nothing_to_publish", "Save the site before scheduling it.");
  const { doc } = cleanDocument(raw);
  const iso = new Date(when).toISOString();
  await run(db, `UPDATE ${target.table} SET scheduled_at = ?, scheduled_draft = ?, scheduled_by = ? WHERE ${target.key} = ?`, iso, JSON.stringify(doc), user.id, target.id);
  return { scheduledAt: iso };
}

export const cancelSchedule = (db, target) =>
  run(db, `UPDATE ${target.table} SET scheduled_at = NULL, scheduled_draft = NULL, scheduled_by = NULL WHERE ${target.key} = ?`, target.id);

// Publishes this site's scheduled copy if it is due. Returns true when it did.
export async function runIfDue(app, target) {
  const row = await first(app.db, `SELECT scheduled_at, scheduled_draft, scheduled_by FROM ${target.table} WHERE ${target.key} = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?`, target.id, now());
  if (!row) return false;
  // Scheduled by an account that has since reached three copyright strikes: it's dropped, not published (security review).
  if (row.scheduled_by && (await accountLevel(app.db, row.scheduled_by)).level >= 3) {
    await run(app.db, `UPDATE ${target.table} SET scheduled_at = NULL, scheduled_draft = NULL, scheduled_by = NULL WHERE ${target.key} = ? AND scheduled_at = ?`, target.id, row.scheduled_at);
    return false;
  }
  const taken = await run(app.db, `UPDATE ${target.table} SET scheduled_at = NULL, scheduled_draft = NULL, scheduled_by = NULL WHERE ${target.key} = ? AND scheduled_at = ?`, target.id, row.scheduled_at);
  if (!taken.meta.changes) return false;
  try {
    await publishSite(app, target, { doc: parseJson(row.scheduled_draft, null) });
  } catch (e) {
    console.error("scheduled publish", target.kind, target.id, e && e.message);
    return false;
  }
  return true;
}

// Every due site of active creators (the daily sweep).
export async function runDue(app) {
  const t = now();
  const projects = await all(app.db, `SELECT s.project_id AS id FROM project_sites s JOIN projects p ON p.id = s.project_id JOIN creators c ON c.id = p.creator_id
    WHERE s.scheduled_at IS NOT NULL AND s.scheduled_at <= ? AND p.deleted_at IS NULL AND c.status = 'active' AND c.deleted_at IS NULL`, t);
  const profiles = await all(app.db, `SELECT s.creator_id AS id FROM creator_sites s JOIN creators c ON c.id = s.creator_id
    WHERE s.scheduled_at IS NOT NULL AND s.scheduled_at <= ? AND c.status = 'active' AND c.deleted_at IS NULL`, t);
  let published = 0;
  for (const { id } of projects) {
    const project = await getProject(app.db, id);
    const creator = project && await getCreator(app.db, project.creator_id);
    if (creator && await runIfDue(app, projectSite(creator, project))) published++;
  }
  for (const { id } of profiles) {
    const creator = await getCreator(app.db, id);
    if (creator && await runIfDue(app, profileSite(creator))) published++;
  }
  return { scheduledPublished: published };
}

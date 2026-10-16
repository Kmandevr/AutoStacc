// Which optional emails an account wants (email_preferences). Receipts and security mail (verification, password
// reset) are always sent and have no switch here. Every switch is off until the person turns it on, and no row means
// all off, so a sender for an optional kind checks wants() first. Only the Control Center sends them (server/admin/news.js; docs/store.md#email).
import { first, run, stmt, now } from "../lib/db.js";

// Optional kinds: the API name and its column.
export const KINDS = { newReleases: "new_releases", platformNews: "platform_news" };

const view = (row) => Object.fromEntries(Object.entries(KINDS).map(([name, col]) => [name, Boolean(row && row[col])]));

export const getPreferences = async (db, userId) =>
  view(await first(db, "SELECT * FROM email_preferences WHERE user_id = ?", userId));

// Sets the given switches and leaves the others as they were.
export async function setPreferences(db, userId, changes) {
  const next = { ...(await getPreferences(db, userId)), ...changes };
  await run(db,
    `INSERT INTO email_preferences (user_id, new_releases, platform_news, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET new_releases = excluded.new_releases, platform_news = excluded.platform_news, updated_at = excluded.updated_at`,
    userId, next.newReleases ? 1 : 0, next.platformNews ? 1 : 0, now());
  return next;
}

export const wants = async (db, userId, kind) => Boolean((await getPreferences(db, userId))[kind]);

// Account deletion.
export const erasePreferencesStmt = (db, userId) => stmt(db, "DELETE FROM email_preferences WHERE user_id = ?", userId);

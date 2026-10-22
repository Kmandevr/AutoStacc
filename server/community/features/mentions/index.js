// @mentions (owner, 2026-10-20; docs/community.md, "Features"): writing @ and a community name in a take or reply
// tells that person (an inbox notice, through core/notify.js). Up to 5 people per post; a name can have spaces, so the
// longest run of words that is a real name wins. People who blocked you, or whom you blocked, aren't told (notify
// checks), and anyone can switch mention alerts off. Posts are shown as written: this only sends the notice. Its own
// switch (community.mentions): off, nobody is told.
import { json, readJson, fail } from "../../../lib/http.js";
import { first, all, run, stmt } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { nameKey } from "../../core/names.js";
import { notify } from "../../core/notify.js";

const MAX_MENTIONS = 5;
const AT = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9][A-Za-z0-9._-]*(?: [A-Za-z0-9][A-Za-z0-9._-]*){0,3})/g;
const NO_STORE = { "Cache-Control": "no-store" };

// The name keys a text might mention: every prefix of each @-run, longest first.
export function candidates(raw) {
  // Code (fenced or inline) and quoted lines don't mention anyone.
  const text = String(raw).replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").split("\n").filter((l) => !/^\s*>/.test(l)).join("\n");
  const out = [];
  for (const m of text.matchAll(AT)) {
    const words = m[1].split(" ");
    const keys = [];
    for (let n = words.length; n >= 1; n--) {
      const k = nameKey(words.slice(0, n).join(" "));
      if (k.length >= 3) keys.push(k);
    }
    if (keys.length) out.push(keys);
  }
  return out.slice(0, MAX_MENTIONS * 2);
}

async function mentioned(app, text) {
  const runs = candidates(text);
  if (!runs.length) return [];
  const all_ = [...new Set(runs.flat())];
  const rows = await all(app.db, "SELECT user_id, name_key FROM community_members WHERE name_key IN (SELECT value FROM json_each(?))", JSON.stringify(all_));
  const byKey = new Map(rows.map((r) => [r.name_key, r.user_id]));
  const ids = [];
  for (const keys of runs) {
    const hit = keys.find((k) => byKey.has(k));
    if (hit && !ids.includes(byKey.get(hit))) ids.push(byKey.get(hit));
  }
  return ids.slice(0, MAX_MENTIONS);
}

async function tell(app, { user, thread, post, body }) {
  for (const userId of await mentioned(app, body)) {
    if (await first(app.db, "SELECT 1 AS n FROM community_mention_prefs WHERE user_id = ? AND alerts = 0", userId)) continue;
    await notify(app, { userId, kind: "mention", threadId: thread.id, postId: post ? post.id : null, actorUserId: user.id });
  }
}

async function prefs(app) {
  const user = await requireUser(app);
  return json({ alerts: !(await first(app.db, "SELECT 1 AS n FROM community_mention_prefs WHERE user_id = ? AND alerts = 0", user.id)) }, 200, NO_STORE);
}

async function setPrefs(app) {
  const user = await requireUser(app);
  await limit(app, "community-mention-prefs", 60, 600, { by: user.id });
  const b = await readJson(app.request);
  if (typeof b.alerts !== "boolean") fail(400, "invalid_field", "Say whether alerts are on.", { field: "alerts" });
  await run(app.db, "INSERT INTO community_mention_prefs (user_id, alerts) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET alerts = excluded.alerts", user.id, b.alerts ? 1 : 0);
  return json({ alerts: b.alerts });
}

export default {
  name: "mentions",
  switch: "community.mentions",
  routes: [["GET", "/api/community/mentions/prefs", prefs], ["PUT", "/api/community/mentions/prefs", setPrefs]],
  on: {
    threadStarted: (app, { user, thread, body }) => tell(app, { user, thread, post: null, body }),
    replyPosted: (app, { user, thread, post }) => tell(app, { user, thread, post, body: post.body })
  },
  erase: (db, userId) => [stmt(db, "DELETE FROM community_mention_prefs WHERE user_id = ?", userId)],
  exportData: async (db, userId) => ({ alerts: !(await first(db, "SELECT 1 AS n FROM community_mention_prefs WHERE user_id = ? AND alerts = 0", userId)) })
};

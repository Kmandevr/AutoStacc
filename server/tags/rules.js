// AutoStacc's admins' site-wide tag rules (tag_rules; server/tags/routes.js sets them): a hidden tag isn't shown,
// suggested or searched anywhere; a renamed one shows and is found under its new name. Read by every place that shows
// tags (the community's takes, server/tags/tags.js), so it imports nothing but the database helpers.
import { all } from "../lib/db.js";

export const rules = async (db) => new Map((await all(db, "SELECT tag, action, rename_to AS renameTo FROM tag_rules")).map((r) => [r.tag, r]));

// A tag as it shows after the rules: null when hidden, its new name when renamed.
export const ruled = (map, tag) => {
  const r = map.get(tag);
  return !r ? tag : r.action === "hide" ? null : r.renameTo;
};

// Store-wide switches (D1 store_settings): a few keys the owner flips in the Control Center without a deploy. Only the
// keys listed here exist; each has a default used while its row is missing. Other modules read and write through these.
import { first, run, now } from "../lib/db.js";

export const SETTINGS = {
  // Whether creators' products can be bought: "open" or "paused" (the owner's switch; docs/creators.md).
  creator_sales: { values: ["open", "paused"], default: "open" }
};

export async function getSetting(db, key) {
  if (!SETTINGS[key]) throw new Error(`unknown setting: ${key}`);
  const row = await first(db, "SELECT value FROM store_settings WHERE key = ?", key);
  return row && SETTINGS[key].values.includes(row.value) ? row.value : SETTINGS[key].default;
}

export async function setSetting(db, key, value, by) {
  if (!SETTINGS[key] || !SETTINGS[key].values.includes(value)) throw new Error(`bad setting: ${key}=${value}`);
  await run(db, `INSERT INTO store_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, key, value, by, now());
}

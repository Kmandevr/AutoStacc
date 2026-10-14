// Store-wide switches (D1 store_settings): a few keys the owner flips in the Control Center without a deploy. Only the
// keys listed here exist, each with its allowed values (a list, or a check) and a default used while its row is
// missing. Other modules read and write through these.
import { first, run, now } from "../lib/db.js";

export const SETTINGS = {
  // Whether creators' products can be bought: "open" or "paused" (the owner's switch; docs/creators.md).
  creator_sales: { values: ["open", "paused"], default: "open" },
  // The budget guard (server/usage/): the month ("YYYY-MM") the owner allowed spending past the free allowance in, or
  // "none"; and the storage creators' uploads may fill, in GB, before they're refused (the free allowance is 10 GB).
  usage_override: { valid: (v) => v === "none" || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), default: "none" },
  storage_cap_gb: { valid: (v) => /^[1-9]\d{0,3}$/.test(v), default: "9" }
};

const ok = (key, value) => typeof value === "string" && (SETTINGS[key].values ? SETTINGS[key].values.includes(value) : SETTINGS[key].valid(value));

export async function getSetting(db, key) {
  if (!SETTINGS[key]) throw new Error(`unknown setting: ${key}`);
  const row = await first(db, "SELECT value FROM store_settings WHERE key = ?", key);
  return row && ok(key, row.value) ? row.value : SETTINGS[key].default;
}

export async function setSetting(db, key, value, by) {
  if (!SETTINGS[key] || !ok(key, value)) throw new Error(`bad setting: ${key}=${value}`);
  await run(db, `INSERT INTO store_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, key, value, by, now());
}

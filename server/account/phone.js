// An account's optional phone number (account_phone; Settings › Profile). Private to the person: in their data export,
// erased with the account, never shown or shared. Not verified and not used for sign-in or texts. Stored as 7 to 15 digits
// (with a leading + if given); the person may type spaces, dashes, dots and brackets. An empty value removes it.
import { json, fail, readJson, str } from "../lib/http.js";
import { requireUser, impersonationIdOf } from "../auth/session.js";
import { first, run, stmt, now } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";

export const phoneOf = async (db, userId) => (await first(db, "SELECT phone FROM account_phone WHERE user_id = ?", userId))?.phone || null;
export const erasePhoneStmt = (db, userId) => stmt(db, "DELETE FROM account_phone WHERE user_id = ?", userId);

export function cleanPhone(raw) {
  const s = String(raw).trim();
  if (!s) return "";
  const digits = s.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(digits)) fail(400, "invalid_field", "Enter a phone number of 7 to 15 digits, starting with + and the country code if you like.", { field: "phone" });
  return digits;
}

async function getPhone(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  return json({ phone: await phoneOf(app.db, user.id) }, 200, { "Cache-Control": "no-store" });
}

async function setPhone(app) {
  const user = await requireUser(app);
  await limit(app, "account-phone", 20, 3600, { by: user.id });
  const body = await readJson(app.request);
  const phone = cleanPhone(str(body.phone, "phone", { min: 0, max: 40 }));
  if (phone) await run(app.db, `INSERT INTO account_phone (user_id, phone, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET phone = excluded.phone, updated_at = excluded.updated_at`, user.id, phone, now());
  else await erasePhoneStmt(app.db, user.id).run();
  return json({ phone: phone || null });
}

export const routes = [
  ["GET", "/api/account/phone", getPhone],
  ["PUT", "/api/account/phone", setPhone]
];

// Changing an account's email. POST /api/account/email { email, password } (the password is re-checked) mails a signed
// 1-hour link to the new address and a heads-up to the old one. The link opens Settings › Profile, where the same
// signed-in account presses Confirm (POST /api/account/email/confirm), so the new address is proven by someone who also
// holds the account. Everything tied to the account moves with it in one batch: the login, entitlements
// (Your Stacc), guest orders and grants still under the old address, and guest purchases made with the new one. Past orders keep the address their receipt
// went to. If the new address belongs to another account, nothing says so here: that address gets the usual "you
// already have an account" mail instead of a link, and an ADMIN_EMAILS address gets nothing. The old address is told
// again when the change is done.
import { json, fail, readJson, email as emailOf, str } from "../lib/http.js";
import { first } from "../lib/db.js";
import { requireUser, impersonationIdOf, realSession } from "../auth/session.js";
import { passwordMatches } from "../auth/password.js";
import { signToken, readToken } from "../lib/signed.js";
import { limit } from "../lib/ratelimit.js";
import { sendEmail } from "../email/index.js";
import { getPreferences } from "../email/preferences.js";
import { syncNewsList } from "../email/contacts.js";
import { claimGuestPurchases } from "../entitlements/claim.js";

const TTL_SECONDS = 3600;
const taken = (db, email) => first(db, 'SELECT id FROM "user" WHERE email = ?', email);

async function request(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  await limit(app, "email-change", 5, 600);
  await limit(app, `email-change:${user.id}`, 5, 3600);
  const body = await readJson(app.request);
  const next = emailOf(body.email);
  const current = String(user.email).toLowerCase();
  if (next === current) fail(400, "same_email", "That's already your email.");
  if (!(await passwordMatches(app, str(body.password, "password", { max: 128 })))) fail(403, "invalid_password", "That password isn't right.");
  const { siteUrl } = app.config;
  // An address that belongs to another account gets the usual mail; an admin address (ADMIN_EMAILS grants admin by
  // address) never gets a link. Both answer exactly like a real request.
  if (await taken(app.db, next)) {
    await sendEmail(app, "account-exists", next, { loginUrl: `${siteUrl}/login`, resetUrl: `${siteUrl}/login#forgot` });
  } else if (!app.config.adminEmails.has(next)) {
    const row = await first(app.db, 'SELECT updatedAt FROM "user" WHERE id = ?', user.id);
    const t = await signToken(app.config.authSecret, "ec1", { u: user.id, o: current, n: next, v: String(row.updatedAt), x: Math.floor(Date.now() / 1000) + TTL_SECONDS });
    await sendEmail(app, "email-change-confirm", next, { url: `${siteUrl}/settings/profile?confirm=${encodeURIComponent(t)}` });
  }
  await sendEmail(app, "email-change-notice", current, { stage: "asked", newEmail: next, contactUrl: `${siteUrl}/contact` });
  return json({ ok: true });
}

// POST { t }: only the signed-in account the link was made for can use it, by pressing the button on Settings › Profile
// (a mail scanner fetching the link, or anyone else clicking it, changes nothing). One batch: the email, its entitlements,
// guest orders and grants under the old address; then other sessions are signed out and pending reset links dropped, so
// nothing sent to the old address can take the account back. A link stops working once the account changes in any way.
async function confirm(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  const body = await readJson(app.request, 4096);
  const read = await readToken(app.config.authSecret, "ec1", body.t);
  if (!read) fail(400, "invalid", "That link didn't work. Ask for a new one.");
  if (read.expired) fail(410, "expired", "That link expired. Ask for a new one.");
  const { u: userId, o: oldEmail, n: newEmail, v: version } = read;
  if (![userId, oldEmail, newEmail, version].every((v) => typeof v === "string")) fail(400, "invalid", "That link didn't work. Ask for a new one.");
  if (userId !== user.id) fail(403, "wrong_account", "That link is for another account. Log in with the account that asked for it.");
  const row = await first(app.db, 'SELECT email, updatedAt FROM "user" WHERE id = ?', userId);
  if (!row || String(row.email).toLowerCase() !== oldEmail || String(row.updatedAt) !== version) fail(400, "invalid", "That link was already used or is out of date. Ask for a new one.");
  if (await taken(app.db, newEmail) || app.config.adminEmails.has(newEmail)) fail(409, "taken", "That email can't be used for this account.");
  const db = app.db;
  const moved = `EXISTS (SELECT 1 FROM "user" WHERE id = ? AND email = ?)`;
  const { session } = await realSession(app);
  let results;
  try {
    results = await db.batch([
      db.prepare('UPDATE "user" SET email = ?, emailVerified = 1, updatedAt = ? WHERE id = ? AND email = ? AND updatedAt = ?').bind(newEmail, new Date().toISOString(), userId, row.email, row.updatedAt),
      db.prepare(`UPDATE entitlements SET email = ? WHERE user_id = ? AND ${moved}`).bind(newEmail, userId, userId, newEmail),
      db.prepare(`UPDATE entitlements SET user_id = ?, email = ? WHERE email = ? AND user_id IS NULL AND ${moved}`).bind(userId, newEmail, oldEmail, userId, newEmail),
      db.prepare(`UPDATE orders SET user_id = ? WHERE email = ? AND user_id IS NULL AND ${moved}`).bind(userId, oldEmail, userId, newEmail),
      db.prepare(`DELETE FROM "session" WHERE "userId" = ? AND id <> ? AND ${moved}`).bind(userId, session.id, userId, newEmail),
      // Password-reset tokens store the user id as their value (server/auth/erase.js).
      db.prepare(`DELETE FROM "verification" WHERE "value" = ? AND ${moved}`).bind(userId, userId, newEmail)
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) fail(409, "taken", "That email can't be used for this account.");
    throw e;
  }
  if (!results[0].meta.changes) fail(400, "invalid", "That link was already used or is out of date. Ask for a new one.");
  // Guest purchases already made with the new address join too: it has just been proven.
  await claimGuestPurchases(app, { id: userId, email: newEmail, emailVerified: true });
  if ((await getPreferences(db, userId)).platformNews) {
    await syncNewsList(app, oldEmail, false);
    await syncNewsList(app, newEmail, true);
  }
  await sendEmail(app, "email-change-notice", oldEmail, { stage: "done", newEmail, contactUrl: `${app.config.siteUrl}/contact` });
  return json({ ok: true, email: newEmail });
}

export const routes = [
  ["POST", "/api/account/email", request],
  ["POST", "/api/account/email/confirm", confirm]
];

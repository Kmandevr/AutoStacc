// Changing an account's email. POST /api/account/email { email, password } (the password is re-checked) mails a signed
// 1-hour link to the new address and a heads-up to the old one; GET /api/account/email/confirm?t=... makes the change
// once the new address is proven. Everything tied to the account moves with it in one batch: the login, entitlements
// (Your Stacc), guest orders and grants still under the old address, and guest purchases made with the new one. Past orders keep the address their receipt
// went to. If the new address belongs to another account, nothing says so here: that address gets the usual "you
// already have an account" mail instead of a link. The old address is told again when the change is done.
import { json, fail, readJson, email as emailOf, str } from "../lib/http.js";
import { first } from "../lib/db.js";
import { requireUser, impersonationIdOf } from "../auth/session.js";
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
  if (await taken(app.db, next)) {
    await sendEmail(app, "account-exists", next, { loginUrl: `${siteUrl}/login`, resetUrl: `${siteUrl}/login#forgot` });
  } else {
    const t = await signToken(app.config.authSecret, "ec1", { u: user.id, o: current, n: next, x: Math.floor(Date.now() / 1000) + TTL_SECONDS });
    await sendEmail(app, "email-change-confirm", next, { url: `${siteUrl}/api/account/email/confirm?t=${encodeURIComponent(t)}` });
  }
  await sendEmail(app, "email-change-notice", current, { stage: "asked", newEmail: next, contactUrl: `${siteUrl}/contact` });
  return json({ ok: true });
}

async function confirm(app) {
  const back = (result) => new Response(null, { status: 303, headers: { Location: `/settings/profile?email=${result}`, "Cache-Control": "no-store" } });
  const read = await readToken(app.config.authSecret, "ec1", new URL(app.request.url).searchParams.get("t"));
  if (!read) return back("invalid");
  if (read.expired) return back("expired");
  const { u: userId, o: oldEmail, n: newEmail } = read;
  if (![userId, oldEmail, newEmail].every((v) => typeof v === "string")) return back("invalid");
  // Still the same account at the same address (a link can't be used twice, or after another change).
  const user = await first(app.db, 'SELECT id, email FROM "user" WHERE id = ?', userId);
  if (!user || String(user.email).toLowerCase() !== oldEmail) return back("invalid");
  if (await taken(app.db, newEmail)) return back("taken");
  const t = new Date().toISOString();
  const db = app.db;
  try {
    await db.batch([
      db.prepare('UPDATE "user" SET email = ?, emailVerified = 1, updatedAt = ? WHERE id = ? AND email = ?').bind(newEmail, t, userId, user.email),
      db.prepare("UPDATE entitlements SET email = ? WHERE user_id = ?").bind(newEmail, userId),
      db.prepare("UPDATE entitlements SET user_id = ?, email = ? WHERE email = ? AND user_id IS NULL").bind(userId, newEmail, oldEmail),
      db.prepare("UPDATE orders SET user_id = ? WHERE email = ? AND user_id IS NULL").bind(userId, oldEmail)
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return back("taken");
    throw e;
  }
  // Guest purchases already made with the new address join too: it has just been proven.
  await claimGuestPurchases(app, { id: userId, email: newEmail, emailVerified: true });
  if ((await getPreferences(db, userId)).platformNews) {
    await syncNewsList(app, oldEmail, false);
    await syncNewsList(app, newEmail, true);
  }
  await sendEmail(app, "email-change-notice", oldEmail, { stage: "done", newEmail, contactUrl: `${app.config.siteUrl}/contact` });
  return back("changed");
}

export const routes = [
  ["POST", "/api/account/email", request],
  ["GET", "/api/account/email/confirm", confirm]
];

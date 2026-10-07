// When someone proves an email (verification link or password reset), guest purchases made with it become that
// account's: existing entitlements and orders get the account id. Nothing is copied, so there are never duplicate
// ownership records. The address then gets a notice with a reset link: if someone else pre-registered the account
// and the owner confirmed it by mistake, a reset takes it back (it logs every other session out).
import { sendEmail } from "../email/index.js";

export async function claimGuestPurchases(app, user) {
  if (!user || !user.emailVerified) return 0;
  const email = String(user.email).toLowerCase();
  const [ents] = await app.db.batch([
    app.db.prepare("UPDATE entitlements SET user_id = ? WHERE email = ? AND user_id IS NULL").bind(user.id, email),
    app.db.prepare("UPDATE orders SET user_id = ? WHERE email = ? AND user_id IS NULL").bind(user.id, email)
  ]);
  const linked = ents.meta.changes;
  if (linked) {
    await sendEmail(app, "purchases-linked", email,
      { count: linked, libraryUrl: `${app.config.siteUrl}/library`, resetUrl: `${app.config.siteUrl}/login#forgot` });
  }
  return linked;
}

// A password reset proves control of the inbox just like the verification link, so it also verifies the email
// (and adopts guest purchases). This way the real owner can always take over an account someone else pre-registered.
export async function verifyByReset(app, user) {
  if (!user) return;
  if (!user.emailVerified) await app.db.prepare('UPDATE "user" SET emailVerified = 1, updatedAt = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run();
  await claimGuestPurchases(app, { ...user, emailVerified: true });
}

// Grants made while no verified account had the email are linked at verification above; grants made after point at
// the account directly. This finds that account.
export async function verifiedUserIdForEmail(db, email) {
  const row = await db.prepare('SELECT id FROM "user" WHERE email = ? AND emailVerified = 1').bind(String(email).toLowerCase()).first();
  return row ? row.id : null;
}

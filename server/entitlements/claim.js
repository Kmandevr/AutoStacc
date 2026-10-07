// When someone verifies an email, guest purchases made with it become theirs: existing entitlements and orders get
// the account's id. Nothing is copied, so there are never duplicate ownership records.
export async function claimGuestPurchases(app, user) {
  if (!user || !user.emailVerified) return;
  const email = String(user.email).toLowerCase();
  await app.db.batch([
    app.db.prepare("UPDATE entitlements SET user_id = ? WHERE email = ? AND user_id IS NULL").bind(user.id, email),
    app.db.prepare("UPDATE orders SET user_id = ? WHERE email = ? AND user_id IS NULL").bind(user.id, email)
  ]);
}

// Grants made while no verified account had the email are linked at verification above; grants made after point at
// the account directly. This finds that account.
export async function verifiedUserIdForEmail(db, email) {
  const row = await db.prepare('SELECT id FROM "user" WHERE email = ? AND emailVerified = 1').bind(String(email).toLowerCase()).first();
  return row ? row.id : null;
}

// What the store keeps about an account's two-step sign-in (Better Auth's "twoFactorEnabled" column and "twoFactor"
// table, db/migrations/0024_two_factor.sql), for Settings, the data export and account deletion. Never the secret or
// the backup codes: those stay encrypted in the table and only Better Auth reads them.
import { first, stmt } from "../lib/db.js";

export async function twoFactorEnabled(db, userId) {
  const row = await first(db, `SELECT "twoFactorEnabled" AS enabled FROM "user" WHERE "id" = ?`, userId);
  return Boolean(row && row.enabled);
}

// Deleting an account removes its authenticator secret and backup codes with it (one statement, for the deletion's batch).
export const eraseTwoFactorStmt = (db, userId) => stmt(db, `DELETE FROM "twoFactor" WHERE "userId" = ?`, userId);

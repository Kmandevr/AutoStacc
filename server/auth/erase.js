// Account deletion's share of Better Auth's tables: sessions, the password login, pending reset tokens, two-step
// sign-in's secret and backup codes, and the user row itself. As statements, so the whole deletion (server/account/delete.js) is one transaction.
import { stmt } from "../lib/db.js";
import { eraseTwoFactorStmt } from "./two-factor-state.js";

export const eraseUserStmts = (db, userId) => [
  stmt(db, `DELETE FROM "session" WHERE "userId" = ?`, userId),
  stmt(db, `DELETE FROM "account" WHERE "userId" = ?`, userId),
  // Password-reset tokens store the user id as their value.
  stmt(db, `DELETE FROM "verification" WHERE "value" = ?`, userId),
  eraseTwoFactorStmt(db, userId),
  stmt(db, `DELETE FROM "user" WHERE "id" = ?`, userId)
];

// Better Auth's cookies for this site (prefix "gs"; "__Secure-" when served over HTTPS), expired on the response.
export const expiredAuthCookies = (secure) => ["session_token", "session_data", "dont_remember"]
  .map((name) => `${secure ? "__Secure-" : ""}gs.${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);

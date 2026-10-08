// Deleting your account. The person types their email and password. The account, its sign-ins, follows, votes,
// email preferences and creator memberships go; orders stay as anonymous sales records (tax, refunds, disputes) and
// everything it owned stops downloading. One transaction, so a failure leaves the account exactly as it was.
// Refused while it still owns a Studio creator (its pages and sales need an owner: AutoStacc sorts that out), while a
// checkout of theirs could still be paid, and for admin accounts. A POST, so an impersonating admin can never reach it
// (server/impersonation/policy.js).
import { json, fail, readJson, str } from "../lib/http.js";
import { requireUser, isAdmin, impersonationIdOf } from "../auth/session.js";
import { createAuth } from "../auth/index.js";
import { eraseUserStmts, expiredAuthCookies } from "../auth/erase.js";
import { anonymiseOrdersStmt, hasOpenCheckout } from "../orders/orders.js";
import { eraseEntitlementsStmt } from "../entitlements/grants.js";
import { anonymiseEmailLogStmt } from "../email/index.js";
import { erasePreferencesStmt } from "../email/preferences.js";
import { removeAllFollowsStmt } from "../projects/follows.js";
import { removeVotesStmt } from "../polls/polls.js";
import { creatorsOfUser, leaveAllCreatorsStmt } from "../creators/creators.js";
import { randomToken } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";

// Stands in for the email on what is kept. The reserved .invalid domain can never receive mail.
const anonymousEmail = () => `deleted-${randomToken(10)}@deleted.invalid`;

async function passwordMatches(app, password) {
  try {
    await createAuth(app).api.verifyPassword({ body: { password }, headers: app.request.headers });
    return true;
  } catch (e) {
    if (e && (e.status === "BAD_REQUEST" || e.statusCode === 400)) return false;
    throw e;
  }
}

async function deleteAccount(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  // Per client and per account, so a stolen session can't guess the password from many addresses.
  await limit(app, "account-delete", 5, 300);
  await limit(app, `account-delete:${user.id}`, 10, 3600);
  const body = await readJson(app.request);
  const email = String(user.email).toLowerCase();
  if (str(body.confirm, "confirm", { max: 254 }).trim().toLowerCase() !== email) fail(400, "confirm", "Type your email address exactly to confirm.");
  const password = str(body.password, "password", { max: 128 });
  if (!(await passwordMatches(app, password))) fail(403, "invalid_password", "That password isn't right.");
  if (isAdmin(app, user)) fail(409, "admin_account", "Admin accounts can't be deleted from Settings.");
  const owned = (await creatorsOfUser(app.db, user.id)).filter((c) => c.role === "owner");
  if (owned.length) fail(409, "owns_creator", "You still own a creator space. Contact AutoStacc to close it or hand it over first.", { creators: owned.map((c) => c.slug) });
  if (await hasOpenCheckout(app.db, user.id, email)) fail(409, "checkout_open", "You have a checkout in progress. Finish or leave it, then try again in half an hour.");

  const db = app.db;
  const anon = anonymousEmail();
  await db.batch([
    anonymiseOrdersStmt(db, user.id, email, anon),
    eraseEntitlementsStmt(db, user.id, email, anon),
    anonymiseEmailLogStmt(db, email, anon),
    erasePreferencesStmt(db, user.id),
    removeAllFollowsStmt(db, user.id),
    removeVotesStmt(db, user.id),
    leaveAllCreatorsStmt(db, user.id),
    ...eraseUserStmts(db, user.id)
  ]);
  const res = json({ ok: true });
  for (const cookie of expiredAuthCookies(app.config.secure)) res.headers.append("Set-Cookie", cookie);
  return res;
}

export const routes = [["POST", "/api/account/delete", deleteAccount]];

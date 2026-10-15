// Two-step sign-in for admin accounts (feature switch auth.adminTwoFactor, off by default; docs/store.md): Better
// Auth's twoFactor plugin with authenticator-app codes (TOTP) and one-time backup codes, never email or SMS codes.
// Only an admin (server/auth/roles.js) can switch it on for their account, in Settings › Security; nobody is made to.
// Turning it off needs the password and a current code (or a backup code). Switching on and off is audit-logged; the
// secret and the codes are never logged. Better Auth keeps the secret and backup codes encrypted, limits wrong codes
// per sign-in (5) and per account (10, then a 15-minute lock), and the rate limits below cap requests per client.
// With the switch off, createAuth (server/auth/index.js) loads none of this: no plugin, no routes, password only.
import { twoFactor } from "better-auth/plugins/two-factor";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { isOn } from "../lib/features.js";
import { isAdmin } from "./roles.js";
import { auditAs } from "../audit/log.js";
import { twoFactorEnabled } from "./two-factor-state.js";

export const twoFactorOn = (app) => isOn(app, "auth.adminTwoFactor");

// Endpoints the plugin brings that this site leaves out: email/SMS codes, and showing the secret or making new backup
// codes again after setup (the secret and codes are shown once; lost them? turn it off and set it up again).
export const TWO_FACTOR_UNUSED_PATHS = ["/two-factor/send-otp", "/two-factor/verify-otp", "/two-factor/get-totp-uri", "/two-factor/generate-backup-codes"];

// Per client, on top of Better Auth's per-sign-in and per-account limits on wrong codes.
export const TWO_FACTOR_RATE_LIMITS = {
  "/two-factor/verify-totp": { window: 60, max: 6 },
  "/two-factor/verify-backup-code": { window: 60, max: 6 },
  "/two-factor/enable": { window: 300, max: 10 },
  "/two-factor/disable": { window: 300, max: 10 }
};

const GUARDED = new Set(["/two-factor/enable", "/two-factor/disable", "/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
const fail = (status, code, message) => { throw new APIError(status, { code, message }); };

// Turning it off: the password (Better Auth checks it) and a code from the app or a backup code (checked here).
async function requireCode(ctx, auth) {
  const code = typeof (ctx.body && ctx.body.code) === "string" ? ctx.body.code.replace(/\s+/g, "") : "";
  if (!code || code.length > 40) fail("BAD_REQUEST", "INVALID_CODE", "Enter a code from your authenticator app, or a backup code.");
  const ask = { headers: ctx.headers };
  const ok = await (/^\d{6}$/.test(code)
    ? auth().api.verifyTOTP({ ...ask, body: { code } })
    : auth().api.verifyBackupCode({ ...ask, body: { code, disableSession: true } })).then(() => true, () => false);
  if (!ok) fail("BAD_REQUEST", "INVALID_CODE", "That code isn't right.");
}

// Admin-only setup, the code check on turning off, and the audit entries. app._twoFactor holds, for one request, the
// signed-in account and whether it had two-step sign-in on before, so the after hook can log a change once.
function guard(app, auth) {
  return {
    id: "autostacc-two-factor-guard",
    hooks: {
      before: [{
        matcher: (c) => GUARDED.has(c.path),
        handler: createAuthMiddleware(async (ctx) => {
          const s = await getSessionFromCtx(ctx);
          if (!s) return; // signing in (the code step) or not signed in: Better Auth's own checks answer
          // Not an admin: setup doesn't exist for them. Turning it off stays open (an admin who lost the role).
          if (ctx.path === "/two-factor/enable" && !isAdmin(app, s.user)) fail("NOT_FOUND", "NOT_FOUND", "Not found.");
          if (ctx.path === "/two-factor/disable") await requireCode(ctx, auth);
          app._twoFactor = { userId: s.user.id, label: s.user.email, was: await twoFactorEnabled(app.env.DB, s.user.id) };
        })
      }],
      after: [{
        matcher: (c) => GUARDED.has(c.path),
        handler: createAuthMiddleware(async () => {
          const before = app._twoFactor;
          if (!before) return;
          app._twoFactor = null;
          const on = await twoFactorEnabled(app.env.DB, before.userId);
          if (on === before.was) return;
          await auditAs(app.env.DB, { userId: before.userId, label: before.label }, on ? "auth.two_factor_enabled" : "auth.two_factor_disabled",
            { targetType: "user", targetId: before.userId, subjectUserId: null });
        })
      }]
    }
  };
}

/** The plugins createAuth adds: none while the switch is off. `auth` returns the Better Auth instance (for the code check). */
export function twoFactorPlugins(app, auth) {
  if (!twoFactorOn(app)) return [];
  return [
    twoFactor({
      issuer: "AutoStacc",
      totpOptions: { digits: 6, period: 30 },
      backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" }
    }),
    guard(app, auth)
  ];
}

// A session that isn't a sign-in for the audit log: the password step of a two-step sign-in (Better Auth deletes it
// at once and asks for the code), or a session Better Auth swaps in while two-step sign-in is switched on or off.
export async function notASignIn(app, session, context) {
  if (!twoFactorOn(app)) return false;
  if (app._twoFactor) return true;
  return Boolean(context && context.path === "/sign-in/email" && (await twoFactorEnabled(app.env.DB, session.userId)));
}

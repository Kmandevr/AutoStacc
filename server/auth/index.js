// Accounts through Better Auth (email + password on D1). Better Auth owns password hashing, sessions, cookies, email
// verification, password reset and rate limiting; this file only configures it and wires its emails and hooks.
// Its HTTP endpoints live under /api/auth/* (see the Better Auth docs for the list).
import { betterAuth } from "better-auth";
import { sendEmail } from "../email/index.js";
import { claimGuestPurchases, verifyByReset } from "../entitlements/claim.js";
import { isAdmin } from "./roles.js";
import { userById } from "../impersonation/sessions.js";
import { auditAs } from "../audit/log.js";

// Every new session of an admin account is an "admin signed in" entry in the audit log (customers' sign-ins aren't).
async function recordAdminSignIn(app, session) {
  const user = await userById(app.env.DB, session.userId);
  if (isAdmin(app, user)) await auditAs(app.env.DB, { userId: user.id, label: user.email }, "admin.signed_in", { targetType: "user", targetId: user.id, subjectUserId: null });
}

export function createAuth(app) {
  const { config, env, ctx } = app;
  const later = (promise) => (ctx && ctx.waitUntil ? ctx.waitUntil(promise) : promise);
  return betterAuth({
    appName: "AutoStacc",
    baseURL: config.siteUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    database: env.DB,
    trustedOrigins: [config.siteUrl],
    // On-demand confirmation mails would let whoever pre-registered an address mail its owner repeatedly; the one
    // mail at sign-up and password reset (which also verifies) cover every real need.
    disabledPaths: ["/send-verification-email"],
    emailAndPassword: {
      enabled: true,
      // Purchases attach to an account by email, so the email must be proven before anything is linked.
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: ({ user }) => verifyByReset(app, user),
      sendResetPassword: ({ user, url }) => sendEmail(app, "reset-password", user.email, { url }),
      // Signing up with a taken email answers exactly like a new sign-up and mails the owner instead (no enumeration).
      onExistingUserSignUp: ({ user }) =>
        sendEmail(app, "account-exists", user.email, { loginUrl: `${config.siteUrl}/login`, resetUrl: `${config.siteUrl}/login#forgot` })
    },
    emailVerification: {
      sendOnSignUp: true,
      // Not on sign-in: whoever knows a pre-registered account's password must not be able to send its owner
      // confirmation mails on demand. Lost the mail? Reset the password (it verifies too).
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: ({ user, url }) => sendEmail(app, "verify-email", user.email, { url }),
      // Guest purchases made with this email become this account's (once, without duplicating anything).
      afterEmailVerification: (user) => claimGuestPurchases(app, user)
    },
    user: {
      // Email changes are off: purchases are tied to the verified address. Role is server-only (input: false).
      changeEmail: { enabled: false },
      additionalFields: { role: { type: "string", required: false, defaultValue: "customer", input: false } }
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    databaseHooks: {
      session: { create: { after: (session) => recordAdminSignIn(app, session).catch((e) => console.error("audit: admin sign-in", e && e.message)) } }
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 5 },
        "/send-verification-email": { window: 300, max: 5 },
        "/reset-password": { window: 300, max: 10 },
        "/change-password": { window: 300, max: 10 }
      }
    },
    advanced: {
      cookiePrefix: "gs",
      useSecureCookies: config.secure,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      backgroundTasks: { handler: later }
    }
  });
}

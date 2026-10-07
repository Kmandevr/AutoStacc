// Accounts through Better Auth (email + password on D1). Better Auth owns password hashing, sessions, cookies, email
// verification, password reset and rate limiting; this file only configures it and wires its emails and hooks.
// Its HTTP endpoints live under /api/auth/* (see the Better Auth docs for the list).
import { betterAuth } from "better-auth";
import { sendEmail } from "../email/index.js";
import { claimGuestPurchases } from "../entitlements/claim.js";

export function createAuth(app) {
  const { config, env, ctx } = app;
  const later = (promise) => (ctx && ctx.waitUntil ? ctx.waitUntil(promise) : promise);
  return betterAuth({
    appName: "Glitches & Stitches",
    baseURL: config.siteUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    database: env.DB,
    trustedOrigins: [config.siteUrl],
    emailAndPassword: {
      enabled: true,
      // Purchases attach to an account by email, so the email must be proven before anything is linked.
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendEmail(app, "reset-password", user.email, { url }),
      // Signing up with a taken email answers exactly like a new sign-up and mails the owner instead (no enumeration).
      onExistingUserSignUp: ({ user }) =>
        sendEmail(app, "account-exists", user.email, { loginUrl: `${config.siteUrl}/login`, resetUrl: `${config.siteUrl}/login#forgot` })
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
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

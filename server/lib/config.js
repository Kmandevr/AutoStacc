// Reads and validates the environment once per request. Production refuses test-mode payments, mock providers and
// missing secrets, so a misconfigured deploy shows "store offline" instead of selling (or granting) anything wrongly.

export class ConfigError extends Error {
  constructor(problems) {
    super("Store is not configured: " + problems.join("; "));
    this.problems = problems;
  }
}

const cache = new WeakMap();

export function loadConfig(env) {
  if (cache.has(env)) return cache.get(env);
  const problems = [];
  const appEnv = env.APP_ENV || "development";
  if (!["development", "test", "preview", "production"].includes(appEnv)) problems.push(`APP_ENV "${appEnv}" is unknown`);
  const production = appEnv === "production";
  const devLike = appEnv === "development" || appEnv === "test";

  const siteUrl = String(env.SITE_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(siteUrl)) problems.push("SITE_URL is missing");
  if (production && !siteUrl.startsWith("https://")) problems.push("SITE_URL must be https in production");

  if (!env.DB) problems.push("D1 binding DB is missing");
  if (!env.FILES) problems.push("R2 binding FILES is missing");

  const authSecret = env.BETTER_AUTH_SECRET || "";
  if (authSecret.length < 32) problems.push("BETTER_AUTH_SECRET must be at least 32 characters");
  const downloadSecret = env.DOWNLOAD_SIGNING_SECRET || "";
  if (downloadSecret.length < 32) problems.push("DOWNLOAD_SIGNING_SECRET must be at least 32 characters");
  if (authSecret && authSecret === downloadSecret) problems.push("DOWNLOAD_SIGNING_SECRET must differ from BETTER_AUTH_SECRET");

  const paymentProvider = env.PAYMENT_PROVIDER || (devLike ? "mock" : "stripe");
  if (!["stripe", "mock"].includes(paymentProvider)) problems.push(`PAYMENT_PROVIDER "${paymentProvider}" is unknown`);
  if (paymentProvider === "mock" && !devLike) problems.push("the mock payment provider only runs in development or test");
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
  if (paymentProvider === "stripe") {
    if (!/^(sk|rk)_(test|live)_/.test(stripeKey)) problems.push("STRIPE_SECRET_KEY is missing");
    if (!stripeWebhookSecret.startsWith("whsec_")) problems.push("STRIPE_WEBHOOK_SECRET is missing");
  }
  const stripeLive = /^(sk|rk)_live_/.test(stripeKey);
  if (production && paymentProvider === "stripe" && !stripeLive) problems.push("production needs a live Stripe key");
  if (!production && stripeLive) problems.push("live Stripe keys are only allowed in production");
  // Only for local tests against a fake Stripe server; ignored outside development and test.
  const stripeApiBase = devLike && env.STRIPE_API_BASE ? env.STRIPE_API_BASE : "";

  const emailProvider = env.EMAIL_PROVIDER || (devLike ? "log" : "brevo");
  if (!["brevo", "log"].includes(emailProvider)) problems.push(`EMAIL_PROVIDER "${emailProvider}" is unknown`);
  if (production && emailProvider !== "brevo") problems.push("production sends email through Brevo");
  if (emailProvider === "brevo" && !env.BREVO_API_KEY) problems.push("BREVO_API_KEY is missing");
  const emailFrom = parseFrom(env.EMAIL_FROM || "");
  if (!emailFrom) problems.push("EMAIL_FROM must look like: Name <address@domain>");

  if (problems.length) throw new ConfigError(problems);

  const config = Object.freeze({
    appEnv,
    production,
    devLike,
    siteUrl,
    secure: siteUrl.startsWith("https://"),
    authSecret,
    downloadSecret,
    paymentProvider,
    stripeKey,
    stripeWebhookSecret,
    stripeLive,
    stripeApiBase,
    emailProvider,
    brevoKey: env.BREVO_API_KEY || "",
    emailFrom,
    // Comma-separated emails that are admins once verified. Roles can also be set in the user table.
    adminEmails: new Set(String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),
    downloadTtlSeconds: 300,
    guestAccessDays: 30,
    checkoutTtlMinutes: 30
  });
  cache.set(env, config);
  return config;
}

function parseFrom(s) {
  const m = s.match(/^\s*(.+?)\s*<([^<>\s@]+@[^<>\s@]+)>\s*$/);
  return m ? { name: m[1], email: m[2] } : null;
}

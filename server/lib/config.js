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
  // Optional: lets the engine Worker's daily cron run the retention sweep (POST /api/internal/sweep); off without it.
  const sweepToken = env.SWEEP_TOKEN || "";
  if (sweepToken && sweepToken.length < 32) problems.push("SWEEP_TOKEN must be at least 32 characters");

  const paymentProvider = env.PAYMENT_PROVIDER || (devLike ? "mock" : "stripe");
  if (!["stripe", "mock"].includes(paymentProvider)) problems.push(`PAYMENT_PROVIDER "${paymentProvider}" is unknown`);
  if (paymentProvider === "mock" && !devLike) problems.push("the mock payment provider only runs in development or test");
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
  if (paymentProvider === "stripe") {
    if (!/^(sk|rk)_(test|live)_/.test(stripeKey)) problems.push("STRIPE_SECRET_KEY must be a Stripe secret key (sk_live_... or rk_live_...; sk_test_ outside production)");
    if (!stripeWebhookSecret.startsWith("whsec_")) problems.push("STRIPE_WEBHOOK_SECRET must be a webhook signing secret (whsec_...)");
  }
  const stripeLive = /^(sk|rk)_live_/.test(stripeKey);
  if (production && paymentProvider === "stripe" && !stripeLive) problems.push("production needs a live Stripe key (sk_live_ or rk_live_), not a test key");
  if (!production && stripeLive) problems.push("live Stripe keys are only allowed in production");
  // The marketplace Stripe account (creator sales, Connect payouts). Optional: without it creator products can't be bought
  // with real payments and payouts stay manual. Same rules as the main key: live in production only, test elsewhere.
  const marketplaceKey = env.STRIPE_MARKETPLACE_KEY || "";
  const marketplaceWebhookSecret = env.STRIPE_MARKETPLACE_WEBHOOK_SECRET || "";
  if (marketplaceKey) {
    if (!/^(sk|rk)_(test|live)_/.test(marketplaceKey)) problems.push("STRIPE_MARKETPLACE_KEY must be a Stripe secret key (sk_live_... or rk_live_...)");
    if (!marketplaceWebhookSecret.startsWith("whsec_")) problems.push("STRIPE_MARKETPLACE_WEBHOOK_SECRET must be set (whsec_...) with STRIPE_MARKETPLACE_KEY");
    if (marketplaceKey === stripeKey) problems.push("STRIPE_MARKETPLACE_KEY must be a different Stripe account's key from STRIPE_SECRET_KEY");
  }
  const marketplaceLive = /^(sk|rk)_live_/.test(marketplaceKey);
  if (marketplaceKey && production && !marketplaceLive) problems.push("production needs a live marketplace Stripe key");
  if (marketplaceKey && !production && marketplaceLive) problems.push("live Stripe keys are only allowed in production");
  // Where the platform is based: creators elsewhere are paid as cross-border recipients. Stripe Tax on creator checkouts
  // is on unless STRIPE_MARKETPLACE_TAX=off (the account must have Stripe Tax set up).
  const platformCountry = /^[A-Z]{2}$/.test(env.PLATFORM_COUNTRY || "") ? env.PLATFORM_COUNTRY : "US";
  const marketplaceTax = env.STRIPE_MARKETPLACE_TAX !== "off";
  // Only for local tests against a fake Stripe server; ignored outside development and test.
  const stripeApiBase = devLike && env.STRIPE_API_BASE ? env.STRIPE_API_BASE : "";

  const emailProvider = env.EMAIL_PROVIDER || (devLike ? "log" : "brevo");
  if (!["brevo", "log"].includes(emailProvider)) problems.push(`EMAIL_PROVIDER "${emailProvider}" is unknown`);
  if (production && emailProvider !== "brevo") problems.push("production sends email through Brevo");
  const brevoKey = env.BREVO_API_KEY || "";
  if (emailProvider === "brevo") {
    if (!brevoKey) problems.push("BREVO_API_KEY is missing");
    else if (brevoKey.startsWith("xsmtpsib-")) problems.push("BREVO_API_KEY is an SMTP key; it must be an API key (xkeysib-...)");
    else if (!brevoKey.startsWith("xkeysib-")) problems.push("BREVO_API_KEY must be a Brevo API key (xkeysib-...)");
  }
  // Newsletter lists in Brevo, per project: "glitches-and-stitches:3,other:7". A project without one has no sign-up yet.
  // Entries that don't parse are left out (the sign-up says "coming soon") rather than taking the store offline.
  const newsletterLists = new Map(String(env.BREVO_NEWSLETTER_LISTS || "").split(",").map((s) => s.trim().match(/^([a-z0-9-]{1,80}):(\d{1,9})$/))
    .filter(Boolean).map((m) => [m[1], Number(m[2])]));
  // The Brevo list that accounts with "AutoStacc news" switched on are kept in, so news can also be sent from Brevo.
  const newsListId = /^\d{1,9}$/.test(env.BREVO_NEWS_LIST || "") ? Number(env.BREVO_NEWS_LIST) : null;
  // Two senders: EMAIL_FROM for purchases (receipts), EMAIL_FROM_NOREPLY for automated mail (account, alerts).
  const emailFrom = parseFrom(env.EMAIL_FROM || "");
  if (!emailFrom) problems.push("EMAIL_FROM must look like: Name <address@domain>");
  const emailFromNoreply = parseFrom(env.EMAIL_FROM_NOREPLY || "");
  if (!emailFromNoreply) problems.push("EMAIL_FROM_NOREPLY must look like: Name <address@domain>");

  // Who owns each first-party creator (owner, 2026-10-21, #172): "autostacc=owner@example.com,other=..." pairs from a
  // secret, so no address sits in the public repo. One owner per creator; a pair that doesn't parse is refused, not skipped.
  const firstPartyOwners = new Map();
  const ownedCreators = new Set();
  for (const pair of String(env.FIRST_PARTY_OWNERS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = pair.match(/^([a-z0-9-]{1,80})=([^\s@,=]+@[^\s@,=]+\.[^\s@,=]+)$/i);
    if (!m) { problems.push("FIRST_PARTY_OWNERS must be <creator>=<email> pairs separated by commas"); break; }
    const [creatorId, email] = [m[1].toLowerCase(), m[2].toLowerCase()];
    if (ownedCreators.has(creatorId)) problems.push(`FIRST_PARTY_OWNERS names creator "${creatorId}" twice`);
    ownedCreators.add(creatorId);
    firstPartyOwners.set(email, [...(firstPartyOwners.get(email) || []), creatorId]);
  }

  if (problems.length) throw new ConfigError(problems);

  const config = Object.freeze({
    appEnv,
    production,
    devLike,
    siteUrl,
    secure: siteUrl.startsWith("https://"),
    authSecret,
    downloadSecret,
    sweepToken,
    paymentProvider,
    stripeKey,
    stripeWebhookSecret,
    stripeLive,
    stripeApiBase,
    marketplaceKey,
    marketplaceWebhookSecret,
    marketplaceLive,
    marketplaceEnabled: Boolean(marketplaceKey),
    platformCountry,
    marketplaceTax,
    emailProvider,
    brevoKey,
    emailFrom,
    emailFromNoreply,
    newsletterLists,
    newsListId,
    // Comma-separated emails that are admins once verified. Roles can also be set in the user table.
    adminEmails: new Set(String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),
    // Email -> the first-party creator ids that verified account owns (server/studio/creators.js assigns it).
    firstPartyOwners,
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

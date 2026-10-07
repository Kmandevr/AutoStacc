// The store refuses to run with dangerous configuration: test payments in production, live keys outside it, mock
// providers anywhere but development/test, missing or reused secrets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, ConfigError } from "../../server/lib/config.js";

const S = "x".repeat(40), D = "y".repeat(40);
const base = { DB: {}, FILES: {}, BETTER_AUTH_SECRET: S, DOWNLOAD_SIGNING_SECRET: D, EMAIL_FROM: "G&S <store@autostacc.com>" };
const prod = { ...base, APP_ENV: "production", SITE_URL: "https://autostacc.com", PAYMENT_PROVIDER: "stripe", EMAIL_PROVIDER: "brevo",
  STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", BREVO_API_KEY: "xkeysib-abc" };
const problems = (env) => { try { loadConfig(env); return []; } catch (e) { assert.ok(e instanceof ConfigError); return e.problems; } };

test("a complete production config loads", () => {
  const c = loadConfig({ ...prod });
  assert.equal(c.production, true);
  assert.equal(c.stripeLive, true);
  assert.equal(c.stripeApiBase, "");
});

test("production refuses test keys, mock payments, the log mailer and plain http", () => {
  assert.match(problems({ ...prod, STRIPE_SECRET_KEY: "sk_test_abc" }).join(), /live Stripe key/);
  assert.match(problems({ ...prod, PAYMENT_PROVIDER: "mock" }).join(), /mock payment provider/);
  assert.match(problems({ ...prod, EMAIL_PROVIDER: "log" }).join(), /Brevo/);
  assert.match(problems({ ...prod, SITE_URL: "http://autostacc.com" }).join(), /https/);
  assert.match(problems({ ...prod, STRIPE_WEBHOOK_SECRET: "" }).join(), /STRIPE_WEBHOOK_SECRET/);
  assert.match(problems({ ...prod, BREVO_API_KEY: "" }).join(), /BREVO_API_KEY/);
});

test("the fake Stripe address is ignored outside development and test", () => {
  assert.equal(loadConfig({ ...prod, STRIPE_API_BASE: "http://127.0.0.1:1" }).stripeApiBase, "");
});

test("live keys and mock payments stay out of previews", () => {
  const preview = { ...prod, APP_ENV: "preview", SITE_URL: "https://x.autostacc.pages.dev", EMAIL_PROVIDER: "log" };
  assert.match(problems(preview).join(), /live Stripe keys are only allowed in production/);
  assert.match(problems({ ...preview, STRIPE_SECRET_KEY: "sk_test_x", PAYMENT_PROVIDER: "mock" }).join(), /mock payment provider/);
  assert.deepEqual(problems({ ...preview, STRIPE_SECRET_KEY: "sk_test_x" }), []);
});

test("secrets must exist, be long and differ", () => {
  const dev = { ...base, APP_ENV: "development", SITE_URL: "http://localhost:8788" };
  assert.deepEqual(problems(dev), []);
  assert.match(problems({ ...dev, BETTER_AUTH_SECRET: "short" }).join(), /BETTER_AUTH_SECRET/);
  assert.match(problems({ ...dev, DOWNLOAD_SIGNING_SECRET: S }).join(), /must differ/);
  assert.match(problems({ ...dev, DB: undefined }).join(), /D1 binding/);
  assert.match(problems({ ...dev, APP_ENV: "staging" }).join(), /unknown/);
});

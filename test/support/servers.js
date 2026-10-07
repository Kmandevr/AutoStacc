// Starts the local stores the API tests run against: one with the mock payment provider (what `npm run dev` runs)
// and one in Stripe mode talking to the fake Stripe API. Each gets a fresh local database and buckets.
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "./client.js";
import { startFakeStripe } from "./fake-stripe.js";

const require = createRequire(import.meta.url);
const { startDevServer, fileIdFor } = require("../../scripts/dev.js");

export const WEBHOOK_SECRET = "whsec_test_" + "a".repeat(32);
export const ADMIN_EMAIL = "admin@autostacc.test";

export async function startStores({ mock = true, stripe = true } = {}) {
  const out = { fileIdFor, children: [] };
  if (mock) {
    const stateDir = path.join(ROOT, ".wrangler", "test-mock");
    const s = startDevServer({ port: 8801, stateDir, fresh: true, quiet: true, vars: { APP_ENV: "test", ADMIN_EMAILS: ADMIN_EMAIL } });
    out.children.push(s.child);
    out.mock = { url: await s.ready, stateDir, log: s.log };
  }
  if (stripe) {
    const fake = await startFakeStripe(8812);
    const stateDir = path.join(ROOT, ".wrangler", "test-stripe");
    const s = startDevServer({ port: 8802, stateDir, fresh: true, quiet: true, vars: {
      APP_ENV: "test", ADMIN_EMAILS: ADMIN_EMAIL, PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_fake_key_for_tests",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: fake.url
    } });
    out.children.push(s.child);
    out.stripe = { url: await s.ready, stateDir, fake, log: s.log };
  }
  out.stop = async () => {
    out.children.forEach((c) => c.kill("SIGTERM"));
    if (out.stripe) await out.stripe.fake.close();
  };
  return out;
}

// Starts the local stores the API tests run against: one with the mock payment provider (what `npm run dev` runs)
// and one in Stripe mode talking to the fake Stripe API. Each gets a fresh local database and buckets. Groups of suites
// run in parallel (test/api/*.test.js), each with its own stores: `name` keeps their state folders apart and `ports`
// their addresses. The site must be built first (npm run test:api does it), so no store rewrites dist/ under another.
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "./client.js";
import { startFakeStripe } from "./fake-stripe.js";

const require = createRequire(import.meta.url);
const { startDevServer, fileIdFor } = require("../../scripts/dev.js");

export const WEBHOOK_SECRET = "whsec_test_" + "a".repeat(32);
export const MARKETPLACE_WEBHOOK_SECRET = "whsec_test_" + "b".repeat(32);
export const MARKETPLACE_KEY = "sk_test_marketplace_key_for_tests";
export const ADMIN_EMAIL = "admin@autostacc.test";

export async function startStores({ mock = true, stripe = true, name = "", ports = {} } = {}) {
  const { mock: mockPort = 8801, stripe: stripePort = 8802, fakeStripe: fakePort = 8812 } = ports;
  const out = { fileIdFor, servers: [] };
  let stopping = false;
  const state = (kind) => path.join(ROOT, ".wrangler", `test-${kind}${name ? "-" + name : ""}`);
  // A store that fails stops the group; anything still starting then is stopped as it comes up.
  const start = (opts) => {
    const s = startDevServer({ ...opts, fresh: true, quiet: true, build: false, inspectorPort: opts.port + 1000 });
    out.servers.push(s);
    if (stopping) s.stop();
    return s;
  };
  out.stop = async () => {
    stopping = true;
    out.servers.forEach((s) => s.stop());
    if (out.stripe) await out.stripe.fake.close();
  };
  await Promise.all([
    mock && (async () => {
      const stateDir = state("mock");
      const s = start({ port: mockPort, stateDir, vars: { APP_ENV: "test", ADMIN_EMAILS: ADMIN_EMAIL } });
      out.mock = { url: await s.ready, stateDir, log: s.log };
    })(),
    stripe && (async () => {
      const fake = await startFakeStripe(fakePort);
      if (stopping) { await fake.close(); return; }
      const stateDir = state("stripe");
      out.stripe = { fake, stateDir };
      const s = start({ port: stripePort, stateDir, vars: {
        APP_ENV: "test", ADMIN_EMAILS: ADMIN_EMAIL, PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_fake_key_for_tests",
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: fake.url,
        STRIPE_MARKETPLACE_KEY: MARKETPLACE_KEY, STRIPE_MARKETPLACE_WEBHOOK_SECRET: MARKETPLACE_WEBHOOK_SECRET
      } });
      Object.assign(out.stripe, { url: await s.ready, log: s.log });
    })()
  ]).catch(async (e) => { await out.stop(); throw e; });
  return out;
}

// Runs a group of API suites against its own local stores (test/support/servers.js). The groups are the *.test.js
// files here; `node --test` runs them in parallel, so each names its own state folders and ports. ALSO adds suites to
// a group by its name, after the group's own (for suites whose group file doesn't import them).
import { before, after } from "node:test";
import { startStores } from "../support/servers.js";
import content from "./content.suite.js";

// Project content (releases, news, shows) runs with the Studio suites: a mock store, an admin, no Stripe.
const ALSO = { studio: [content] };

export function runGroup({ name, ports, mock = true, stripe = true, vars }, suites) {
  const ctx = {};
  before(async () => Object.assign(ctx, await startStores({ name, ports, mock, stripe, vars })), { timeout: 240000 });
  after(() => ctx.stop && ctx.stop());
  for (const suite of [...suites, ...(ALSO[name] || []).filter((s) => !suites.includes(s))]) suite(ctx);
}

// Runs a group of API suites against its own local stores (test/support/servers.js). The groups are the *.test.js
// files here; `node --test` runs them in parallel, so each names its own state folders and ports.
import { before, after } from "node:test";
import { startStores } from "../support/servers.js";

export function runGroup({ name, ports, mock = true, stripe = true }, suites) {
  const ctx = {};
  before(async () => Object.assign(ctx, await startStores({ name, ports, mock, stripe })), { timeout: 240000 });
  after(() => ctx.stop && ctx.stop());
  for (const suite of suites) suite(ctx);
}

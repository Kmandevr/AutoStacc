// The community's feature hooks (server/community/core/hooks.js; docs/community.md, "Built as independent features"):
// a switched-off feature contributes nothing (no slots, checks, events, state, formatter rules or routes), switching one
// off leaves the others working, a failing event handler never breaks the write, and the core renders with no features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register, slot, check, emit, state, formatExtensions, featureRoutes, featuresOn } from "../../server/community/core/hooks.js";
import { threadMain } from "../../server/community/core/render-thread.js";
import { BARE } from "../../server/community/core/render-parts.js";
import { FEATURES } from "../../server/lib/features.js";

FEATURES["community.test-a"] = { on: true, label: "test a" };
FEATURES["community.test-b"] = { on: true, label: "test b" };
const seen = [];
register({ name: "test-a", switch: "community.test-a", slots: { postFooter: () => "<i>a</i>" }, checks: { post: () => { seen.push("check-a"); } },
  on: { replyPosted: () => { throw new Error("boom"); } }, state: { thread: () => ({ a: 1 }) }, format: { links: [() => "<b>card</b>"] },
  routes: [["GET", "/api/community/test-a", async () => "ran"]] });
register({ name: "test-b", switch: "community.test-b", slots: { postFooter: () => "<i>b</i>" }, on: { replyPosted: () => { seen.push("event-b"); } } });

const app = (vars = {}) => ({ env: { FEATURES_ON: "community.forum", ...vars } });

test("features add their parts while on, and nothing when the community is off", async () => {
  assert.equal(slot(app(), "postFooter", {}), "<i>a</i><i>b</i>");
  assert.equal(slot({ env: {} }, "postFooter", {}), "", "community.forum off");
  assert.deepEqual(featuresOn(app()).filter((n) => n.startsWith("test-")), ["test-a", "test-b"]);
});

test("switching one feature off leaves the other working", async () => {
  const offA = app({ FEATURES_OFF: "community.test-a" });
  assert.equal(slot(offA, "postFooter", {}), "<i>b</i>");
  assert.deepEqual(formatExtensions(offA).links, []);
  assert.deepEqual(await state(offA, {}, {}), {});
  seen.length = 0;
  await check(offA, "post", {});
  assert.deepEqual(seen, []);
  const route = featureRoutes().find(([, p]) => p === "/api/community/test-a");
  await assert.rejects(route[2](offA, {}), /Not found/);
  assert.equal(await route[2](app(), {}), "ran");
});

test("a failing event handler is logged and never stops the others", async () => {
  seen.length = 0;
  const err = console.error;
  console.error = () => {};
  try { await emit(app(), "replyPosted", {}); } finally { console.error = err; }
  assert.deepEqual(seen, ["event-b"]);
});

test("registering the same feature twice, or one without a switch, is refused", () => {
  assert.throws(() => register({ name: "test-a", switch: "community.test-a" }));
  assert.throws(() => register({ name: "nameless" }));
});

test("the core renders a take with no features at all", () => {
  const posts = [{ id: "p1", body: "**hi**", state: "visible", createdAt: "2026-10-16T00:00:00Z", author: "A" },
    { id: "p2", parentId: null, body: "reply", state: "visible", createdAt: "2026-10-16T00:01:00Z", author: null }];
  const html = threadMain({ id: "thr_x", type: "discussion" }, posts, BARE);
  assert.match(html, /<strong>hi<\/strong>/);
  assert.match(html, /deleted user/);
  assert.match(html, /1 reply/);
});

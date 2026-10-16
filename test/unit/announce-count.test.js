// Follower and news emails (server/admin/news.js): a send the provider refused counts as failed, never as sent, so the
// Control Center stops and says so instead of calling again forever while the provider is down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendAll } from "../../server/admin/news.js";

test("refused sends are counted as failed, not sent", async () => {
  const batch = [{ email: "a@x.test" }, { email: "b@x.test" }, { email: "c@x.test" }];
  const statuses = { "a@x.test": "sent", "b@x.test": "failed", "c@x.test": "logged" };
  assert.deepEqual(await sendAll(batch, async (e) => ({ status: statuses[e] })), { sent: 2, failed: 1 });
  assert.deepEqual(await sendAll(batch, async () => ({ status: "failed" })), { sent: 0, failed: 3 });
  assert.deepEqual(await sendAll([], async () => ({ status: "sent" })), { sent: 0, failed: 0 });
});

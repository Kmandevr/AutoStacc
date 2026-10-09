// Stripe refuses a Checkout Session that expires less than 30 minutes after it receives the request. The time is worked
// out before the network call, so the expiry we send must carry a margin; without one every live checkout failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expiresAtFor } from "../../server/payments/stripe.js";

test("the checkout expiry is comfortably more than 30 minutes ahead, whatever the configured length", () => {
  const now = 1_800_000_000_000;
  for (const [ttl, minSeconds] of [[30, 1800 + 60], [5, 1800 + 60], [45, 45 * 60], [0, 1800 + 60]]) {
    const ahead = expiresAtFor({ checkoutTtlMinutes: ttl }, now) - now / 1000;
    assert.ok(ahead >= minSeconds, `ttl ${ttl}: ${ahead}s ahead`);
    assert.ok(ahead < 86400, "and under Stripe's 24 hour limit");
  }
});

test("it still holds after a slow request (several seconds between working out the time and Stripe receiving it)", () => {
  const now = Date.now();
  const sent = expiresAtFor({ checkoutTtlMinutes: 30 }, now);
  assert.ok(sent - (now + 20_000) / 1000 >= 1800, "20s of network delay still leaves 30 minutes");
});

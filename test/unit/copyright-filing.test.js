// The public copyright form's counting key (server/copyright/filing.js network): an IPv4 address as it is, an IPv6
// address by its /64 however it's written, so one network can't look like millions of senders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "../../server/copyright/filing.js";

test("IPv6 addresses count by their /64, whatever their spelling; IPv4 as they are", () => {
  assert.equal(network("203.0.113.7"), "203.0.113.7");
  assert.equal(network("2001:db8::1"), network("2001:0db8:0000:0000:ffff:1:2:3"));
  assert.equal(network("2001:DB8:0:42::1"), "2001:db8:0:42::/64");
  assert.notEqual(network("2001:db8:0:42::1"), network("2001:db8:0:43::1"));
  assert.equal(network(null), "unknown");
});

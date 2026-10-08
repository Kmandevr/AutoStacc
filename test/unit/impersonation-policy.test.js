// The impersonation policy and the live-payment guards, without servers: what a request inside an impersonation may
// do (server/impersonation/policy.js), that a live store refuses impersonated payments and test purchases outright,
// and that audit details never carry secrets (server/audit/log.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { impersonationGate } from "../../server/impersonation/policy.js";
import { routes as testPurchaseRoutes } from "../../server/admin/test-purchases.js";
import { cleanDetail } from "../../server/audit/log.js";

const ADMIN = { id: "admin1", email: "owner@example.com", emailVerified: true, role: "admin" };
const OPEN = { id: "imp_x", purpose: "support", admin: ADMIN, customer: { id: "cust1", email: "c@example.com", emailVerified: true, role: "customer", impersonated: true } };

// A request the way server/app.js sees it, with the session lookups already answered (they're cached on app).
function app({ method = "POST", cookie = true, live = false, imp = OPEN, user } = {}) {
  return {
    request: new Request("https://autostacc.test/api/x", { method, headers: cookie ? { cookie: "gs_impersonation=abc" } : {} }),
    config: { paymentProvider: "stripe", stripeLive: live, adminEmails: new Set() },
    _imp: imp,
    _user: user !== undefined ? user : imp && !imp.stale ? imp.customer : null
  };
}
const route = (opts = {}) => ({ pattern: "/api/x", opts });
const code = async (p) => {
  try {
    await p;
    return "allowed";
  } catch (e) {
    return `${e.status} ${e.code}`;
  }
};

test("no impersonation cookie: the policy stays out of the way", async () => {
  assert.equal(await impersonationGate(app({ cookie: false, imp: null }), { route: route() }), null);
});

test("inside an impersonation: reads pass, writes need an opt-in, Better Auth is closed", async () => {
  assert.equal(await code(impersonationGate(app({ method: "GET" }), { route: route() })), "allowed");
  assert.equal(await code(impersonationGate(app(), { route: route() })), "403 impersonation_blocked");
  assert.equal(await code(impersonationGate(app(), { route: route({ impersonation: "allow" }) })), "allowed");
  assert.equal(await code(impersonationGate(app({ method: "GET" }), { auth: true })), "403 impersonation_blocked");
  assert.equal(await code(impersonationGate(app(), { auth: true })), "403 impersonation_blocked");
});

test("a live store never takes a payment inside an impersonation; a test store does", async () => {
  assert.equal(await code(impersonationGate(app({ live: true }), { route: route({ impersonation: "test-payments" }) })), "403 impersonation_live_payment");
  assert.equal(await code(impersonationGate(app({ live: false }), { route: route({ impersonation: "test-payments" }) })), "allowed");
});

test("a stale impersonation fails everything except the account check and exit", async () => {
  const stale = { stale: true, reason: "idle" };
  assert.equal(await code(impersonationGate(app({ method: "GET", imp: stale }), { route: route() })), "401 impersonation_ended");
  assert.equal(await code(impersonationGate(app({ imp: stale }), { auth: true })), "401 impersonation_ended");
  assert.equal(await code(impersonationGate(app({ method: "GET", imp: stale }), { route: route({ whenStale: true }) })), "allowed");
  assert.equal(await code(impersonationGate(app({ imp: stale }), { route: route({ impersonation: "exit" }) })), "allowed");
});

test("test purchases are refused outright by a live store", async () => {
  const start = testPurchaseRoutes.find(([m, p]) => m === "POST" && p === "/api/admin/test-purchases")[2];
  const a = app({ cookie: false, imp: null, user: ADMIN, live: true });
  assert.equal(await code(start(a)), "409 live_payments");
});

test("audit details drop secrets and personal fields, and stay small", () => {
  const out = JSON.parse(cleanDetail({ productId: "p1", password: "x", token: "t", apiKey: "k", email: "a@b.c", sessionId: "s", reason: "r".repeat(500), n: 3, nested: { a: 1 } }));
  assert.deepEqual(Object.keys(out).sort(), ["n", "productId", "reason"]);
  assert.equal(out.reason.length, 200);
  assert.equal(JSON.parse(cleanDetail({ note: "jane.doe@example.com can't see her pack" })).note, "[email] can't see her pack");
});

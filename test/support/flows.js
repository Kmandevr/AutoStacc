// Store flows the suites share: buying with the mock provider, and buying through Stripe mode (checkout, the fake
// Stripe marks it paid, then a signed webhook) with knobs for forged or mismatched events.
import { Client, verifiedUser, unique, sendWebhook } from "./client.js";
import { WEBHOOK_SECRET } from "./servers.js";

export async function mockBuy(client, items, extra = {}) {
  const co = await client.post("/api/checkout", { items, ...extra });
  if (co.status !== 201 && co.status !== 200) throw new Error("checkout failed " + JSON.stringify(co.data));
  const sessionId = new URL(co.data.url).searchParams.get("mock");
  const pay = await client.post("/api/dev/mock-payment", { orderId: co.data.orderId, sessionId, outcome: "paid" });
  return { orderId: co.data.orderId, sessionId, pay };
}

export const mockOutcome = (client, order, outcome) =>
  client.post("/api/dev/mock-payment", { orderId: order.orderId, sessionId: order.sessionId, outcome });

export async function newBuyer(base, tag = "buyer") {
  const c = new Client(base);
  const user = await verifiedUser(c, unique(tag));
  return { c, user };
}

let evt = 0;
export const eventId = () => `evt_test_${Date.now().toString(36)}_${evt++}`;

export function sessionEvent(type, session, overrides = {}) {
  return { id: eventId(), object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { ...session, ...overrides } } };
}

// Checkout in Stripe mode; returns { orderId, sessionId }.
export async function stripeCheckout(client, items, extra = {}) {
  const co = await client.post("/api/checkout", { items, ...extra });
  if (co.status !== 201) throw new Error("checkout failed " + JSON.stringify(co.data));
  return { orderId: co.data.orderId, sessionId: co.data.url.split("/pay/")[1], url: co.data.url };
}

export async function stripePay(ctx, client, order, { event = "checkout.session.completed", overrides = {} } = {}) {
  const session = ctx.stripe.fake.pay(order.sessionId);
  const ev = sessionEvent(event, session, overrides);
  const res = await sendWebhook(client, ev, WEBHOOK_SECRET);
  return { ev, res, session };
}

// The owner's account (ADMIN_EMAILS in the test servers), created once per server.
const admins = new Map();
export function adminClient(base) {
  if (!admins.has(base)) {
    admins.set(base, (async () => {
      const c = new Client(base);
      await verifiedUser(c, "admin@autostacc.test", "admin-password-123");
      return c;
    })());
  }
  return admins.get(base);
}

// A second, separate signed-in session of the owner's account: impersonation is tied to the session that started
// it, so tests that impersonate use their own instead of the shared adminClient.
export async function freshAdmin(base) {
  await adminClient(base);
  const c = new Client(base);
  const r = await c.post("/api/auth/sign-in/email", { email: "admin@autostacc.test", password: "admin-password-123" });
  if (r.status !== 200) throw new Error("admin sign-in failed " + JSON.stringify(r.data));
  return c;
}

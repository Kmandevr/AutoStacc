// Test purchases (docs/admin.md): the admin buys a product as a chosen customer through the real store, never a
// second checkout. Starting one opens a "test-purchase" impersonation and sends the admin to the product in the store;
// from there it is the customer's own cart, checkout (POST /api/checkout, which stamps the order with the
// impersonation) and payment page. Only where payments are test payments (mock, or Stripe with a test key): a live
// store refuses, so a test can never become real revenue. Verification re-runs the checks the store itself uses.
import { json, fail, readJson, id, str } from "../lib/http.js";
import { all, first } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { paymentProvider } from "../payments/index.js";
import { getProduct, isPurchasable } from "../catalog/products.js";
import { getOrder, orderItems } from "../orders/orders.js";
import { activeEntitlements } from "../entitlements/grants.js";
import { audit } from "../audit/log.js";
import { impersonableCustomer, beginImpersonation, USER_ID } from "../impersonation/routes.js";
import { userById } from "../impersonation/sessions.js";

export const testPaymentsOnly = (app) => !paymentProvider(app).livemode(app.config);

async function start(app) {
  const admin = await requireAdmin(app);
  if (!testPaymentsOnly(app)) fail(409, "live_payments", "This store takes live payments, so test purchases are off here. Run them in a test environment.");
  const body = await readJson(app.request);
  const customer = await impersonableCustomer(app, admin, str(body.userId, "userId", { max: 64, pattern: USER_ID }));
  const p = await getProduct(app.db, id(body.productId, "productId"));
  if (!isPurchasable(p)) fail(409, "not_purchasable", "That product can't be bought right now (unpublished, paused or free).");
  await audit(app, "test_purchase.started", { targetType: "product", targetId: p.id, subjectUserId: customer.id, detail: { provider: app.config.paymentProvider } });
  return beginImpersonation(app, { customer, purpose: "test-purchase", note: `test purchase: ${p.id}`,
    redirect: `/shop?project=${encodeURIComponent(p.project_id || "")}&item=${encodeURIComponent(p.id)}` });
}

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db,
    `SELECT o.id, o.status, o.total_cents, o.currency, o.provider, o.livemode, o.created_at, o.user_id, i.admin_user_id
     FROM orders o JOIN impersonations i ON i.id = o.impersonation_id WHERE o.impersonation_id IS NOT NULL ORDER BY o.created_at DESC LIMIT 50`);
  return json({ testPayments: testPaymentsOnly(app), provider: app.config.paymentProvider, orders: rows });
}

const check = (key, label, ok, detail) => ({ key, label, ok, detail });

// The checklist for one test order, each step answered by the same code the customer's requests go through.
export async function verifyTestOrder(db, order) {
  const items = await orderItems(db, order.id);
  const customer = order.user_id ? await userById(db, order.user_id) : null;
  const access = { user: customer && customer.emailVerified ? customer : null, guestOrderIds: [] };
  const ents = await all(db, "SELECT product_id, status FROM entitlements WHERE source_type = 'purchase' AND source_id = ?", order.id);
  const out = [
    check("test", "Placed as a test (test payments, admin impersonation)", Boolean(order.impersonation_id) && !order.livemode, `${order.provider}, livemode ${order.livemode}`),
    check("paid", "Payment confirmed by the provider", order.status === "paid", `status ${order.status}`)
  ];
  out.push(check("entitlements", "Entitlement created for every item",
    items.every((i) => ents.some((e) => e.product_id === i.product_id && e.status === "active")), `${ents.filter((e) => e.status === "active").length} of ${items.length} active`));
  const owned = new Set((await activeEntitlements(db, access)).map((e) => e.product_id));
  out.push(check("library", "Shows in the customer's library", items.every((i) => owned.has(i.product_id)),
    access.user ? `${items.filter((i) => owned.has(i.product_id)).length} of ${items.length} items` : "customer's email isn't verified, so their library is empty"));
  for (const i of items) {
    const files = await first(db, "SELECT COUNT(*) AS n FROM product_files WHERE product_id = ? AND active = 1", i.product_id);
    const allowed = (await activeEntitlements(db, access, i.product_id)).length > 0;
    out.push(check(`download:${i.product_id}`, `Download authorized: ${i.title}`, files.n ? allowed : null,
      files.n ? `${files.n} file(s), ${allowed ? "a download link would be issued" : "a download would be refused"}` : "no files uploaded for this product yet"));
  }
  const tried = await first(db, `SELECT SUM(event = 'issued') AS issued, SUM(event = 'served') AS served, SUM(event = 'denied') AS denied
    FROM download_events WHERE impersonation_id = ?`, order.impersonation_id);
  out.push(check("downloaded", "Downloaded during the test", tried.served ? true : null, `${tried.issued || 0} issued, ${tried.served || 0} served, ${tried.denied || 0} denied`));
  const mail = await first(db, "SELECT status FROM email_events WHERE dedupe_key = ?", `purchase-confirmation:${order.id}`);
  out.push(check("receipt", "Receipt email", mail ? mail.status !== "failed" : null, mail ? mail.status : "none yet"));
  return out;
}

async function verify(app, { orderId }) {
  await requireAdmin(app);
  const order = await getOrder(app.db, str(orderId, "orderId", { max: 40 }));
  if (!order || !order.impersonation_id) fail(404, "not_found", "No test order with that id.");
  return json({ orderId: order.id, checks: await verifyTestOrder(app.db, order) });
}

export const routes = [
  ["POST", "/api/admin/test-purchases", start],
  ["GET", "/api/admin/test-purchases", list],
  ["GET", "/api/admin/test-purchases/:orderId", verify]
];

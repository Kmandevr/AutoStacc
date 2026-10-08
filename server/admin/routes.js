// Admin API (owner only; every route starts with requireAdmin, which answers 404 to everyone else).
// Catalog content and prices live in data/products.js (reviewed in git, shown on the static pages); here the owner
// pauses sales and manages orders, customers and entitlements (paid files and previews: admin/files.js). Every change is
// written to the audit log (server/audit/log.js) under the admin's name.
import { json, fail, readJson, str, email as emailField, id } from "../lib/http.js";
import { all, first, run, newId, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { getProduct, publicProduct } from "../catalog/products.js";
import { getOrder, orderItems, publicOrder } from "../orders/orders.js";
import { sendConfirmation } from "../orders/fulfilment.js";
import { grant, revokeById } from "../entitlements/grants.js";
import { verifiedUserIdForEmail } from "../entitlements/claim.js";
import { audit } from "../audit/log.js";
import { paymentProvider } from "../payments/index.js";

const like = (q) => `%${String(q || "").replace(/[%_]/g, "")}%`;

async function summary(app) {
  await requireAdmin(app);
  const [orders, customers, entitlements, products, alerts] = await Promise.all([
    all(app.db, "SELECT status, COUNT(*) AS n, SUM(total_cents) AS cents FROM orders GROUP BY status"),
    first(app.db, 'SELECT COUNT(*) AS n FROM "user"'),
    first(app.db, "SELECT COUNT(*) AS n FROM entitlements WHERE status = 'active'"),
    first(app.db, "SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL"),
    // Payment events the store refused, errored on, or is holding (a refund waiting for its payment).
    all(app.db, `SELECT id, type, order_id, outcome, detail, received_at FROM payment_events
      WHERE outcome IN ('rejected', 'error') OR outcome LIKE '%waiting for payment' ORDER BY received_at DESC LIMIT 20`)
  ]);
  return json({ orders, customers: customers.n, activeEntitlements: entitlements.n, products: products.n, alerts, environment: app.config.appEnv,
    paymentProvider: app.config.paymentProvider, livePayments: paymentProvider(app).livemode(app.config) });
}

async function products(app) {
  await requireAdmin(app);
  const rows = await all(app.db, "SELECT * FROM products ORDER BY deleted_at IS NOT NULL, title");
  const files = await all(app.db, "SELECT id, product_id, filename, label, size_bytes, active, status, created_at, pac_id, kind FROM product_files ORDER BY sort, filename");
  return json({
    products: rows.map((p) => ({ ...publicProduct(p), published: Boolean(p.published), salesPaused: Boolean(p.sales_paused), deleted: Boolean(p.deleted_at),
      updatedAt: p.updated_at, createdAt: p.created_at, files: files.filter((f) => f.product_id === p.id) }))
  });
}

async function updateProduct(app, { productId }) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  if (typeof body.salesPaused !== "boolean") fail(400, "invalid_field", "salesPaused must be true or false.");
  const res = await run(app.db, "UPDATE products SET sales_paused = ?, updated_at = ? WHERE id = ?", body.salesPaused ? 1 : 0, now(), id(productId));
  if (!res.meta.changes) fail(404, "not_found", "No product with that id.");
  await audit(app, body.salesPaused ? "product.sales_paused" : "product.sales_resumed", { targetType: "product", targetId: productId });
  return json({ ok: true });
}

async function orders(app) {
  await requireAdmin(app);
  const url = new URL(app.request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const rows = await all(app.db,
    `SELECT * FROM orders WHERE (? IS NULL OR status = ?) AND (? IS NULL OR email LIKE ? OR id = ?) ORDER BY created_at DESC LIMIT 200`,
    status, status, q || null, like(q), q || "");
  return json({ orders: rows.map((o) => ({ ...publicOrder(o, []), userId: o.user_id, provider: o.provider, livemode: Boolean(o.livemode) })) });
}

async function order(app, { orderId }) {
  await requireAdmin(app);
  const o = await getOrder(app.db, str(orderId, "orderId", { max: 40 }));
  if (!o) fail(404, "not_found", "No order with that id.");
  const [items, events, ents, emails] = await Promise.all([
    orderItems(app.db, o.id),
    all(app.db, "SELECT id, type, outcome, detail, received_at FROM payment_events WHERE order_id = ? ORDER BY received_at", o.id),
    all(app.db, "SELECT * FROM entitlements WHERE source_type = 'purchase' AND source_id = ?", o.id),
    all(app.db, "SELECT kind, status, error, created_at FROM email_events WHERE dedupe_key = ? OR (to_email = ? AND kind = 'purchase-confirmation') ORDER BY created_at", `purchase-confirmation:${o.id}`, o.email)
  ]);
  return json({ order: { ...publicOrder(o, items), userId: o.user_id, provider: o.provider, providerSessionId: o.provider_session_id, providerPaymentId: o.provider_payment_id, livemode: Boolean(o.livemode) }, events, entitlements: ents, emails });
}

async function resendConfirmation(app, { orderId }) {
  await requireAdmin(app);
  const o = await getOrder(app.db, str(orderId, "orderId", { max: 40 }));
  if (!o || o.status !== "paid") fail(409, "not_paid", "Only paid orders get a confirmation.");
  const result = await sendConfirmation(app, o, null, { resend: true });
  await audit(app, "order.receipt_resent", { targetType: "order", targetId: o.id, subjectUserId: o.user_id, detail: { status: result.status } });
  return json({ ok: result.status !== "failed", status: result.status });
}

async function customers(app) {
  await requireAdmin(app);
  const q = new URL(app.request.url).searchParams.get("q");
  const rows = await all(app.db,
    `SELECT u.id, u.name, u.email, u.emailVerified AS verified, u.role, u.createdAt AS createdAt,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS paidOrders,
       (SELECT COUNT(*) FROM entitlements e WHERE e.user_id = u.id AND e.status = 'active') AS owned
     FROM "user" u WHERE (? IS NULL OR u.email LIKE ? OR u.name LIKE ?) ORDER BY u.createdAt DESC LIMIT 200`,
    q || null, like(q), like(q));
  return json({ customers: rows });
}

async function entitlements(app) {
  await requireAdmin(app);
  const url = new URL(app.request.url);
  const email = url.searchParams.get("email");
  const productId = url.searchParams.get("productId");
  const rows = await all(app.db,
    `SELECT * FROM entitlements WHERE (? IS NULL OR email = ?) AND (? IS NULL OR product_id = ?) ORDER BY granted_at DESC LIMIT 300`,
    email ? email.toLowerCase() : null, email ? email.toLowerCase() : null, productId || null, productId || null);
  return json({ entitlements: rows });
}

// Manual, promo and replacement grants. Each grant gets its own source id, so it can be revoked on its own.
async function grantEntitlement(app) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request);
  const to = emailField(body.email);
  const p = await getProduct(app.db, id(body.productId, "productId"));
  if (!p) fail(404, "not_found", "No product with that id.");
  const sourceType = str(body.sourceType || "manual", "sourceType", { pattern: /^(manual|promo|replacement)$/ });
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  const userId = await verifiedUserIdForEmail(app.db, to);
  const sourceId = newId("grant");
  await grant(app.db, { userId, email: to, productId: p.id, sourceType, sourceId, note: `${note || ""} (by ${admin.email})`.trim() });
  await audit(app, "entitlement.granted", { targetType: "product", targetId: p.id, subjectUserId: userId, detail: { sourceType, sourceId, toAccount: Boolean(userId) } });
  return json({ ok: true }, 201);
}

async function revokeEntitlement(app, { entitlementId }) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  const reason = str(body.reason || "revoked by admin", "reason", { max: 200 });
  const ent = await first(app.db, "SELECT user_id, product_id FROM entitlements WHERE id = ?", str(entitlementId, "entitlementId", { max: 40 }));
  const res = await revokeById(app.db, entitlementId, reason);
  if (!res.meta.changes) fail(404, "not_found", "No active entitlement with that id.");
  await audit(app, "entitlement.revoked", { targetType: "entitlement", targetId: entitlementId, subjectUserId: ent.user_id, detail: { productId: ent.product_id, reason } });
  return json({ ok: true });
}

async function analytics(app) {
  await requireAdmin(app);
  const days = Math.min(Number(new URL(app.request.url).searchParams.get("days")) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await all(app.db, "SELECT event, subject, SUM(count) AS count FROM analytics_daily WHERE day >= ? GROUP BY event, subject ORDER BY count DESC LIMIT 200", since);
  return json({ since, rows });
}

export const routes = [
  ["GET", "/api/admin/summary", summary],
  ["GET", "/api/admin/products", products],
  ["PATCH", "/api/admin/products/:productId", updateProduct],
  ["GET", "/api/admin/orders", orders],
  ["GET", "/api/admin/orders/:orderId", order],
  ["POST", "/api/admin/orders/:orderId/resend", resendConfirmation],
  ["GET", "/api/admin/customers", customers],
  ["GET", "/api/admin/entitlements", entitlements],
  ["POST", "/api/admin/entitlements", grantEntitlement],
  ["POST", "/api/admin/entitlements/:entitlementId/revoke", revokeEntitlement],
  ["GET", "/api/admin/analytics", analytics]
];

// Admin API (owner only; every route starts with requireAdmin, which answers 404 to everyone else).
// Catalog content and prices live in data/products.js (reviewed in git, shown on the static pages); here the owner
// pauses sales and manages orders, customers and entitlements (paid files and previews: admin/files.js). Every change is
// written to the audit log (server/audit/log.js) under the admin's name.
import { refreshSearchText } from "../discovery/facets.js";
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
import { paymentAlerts } from "./alerts.js";

const like = (q) => `%${String(q || "").replace(/[%_]/g, "")}%`;

async function summary(app) {
  await requireAdmin(app);
  const [orders, customers, entitlements, products, alerts] = await Promise.all([
    all(app.db, "SELECT status, COUNT(*) AS n, SUM(total_cents) AS cents FROM orders GROUP BY status"),
    first(app.db, 'SELECT COUNT(*) AS n FROM "user"'),
    first(app.db, "SELECT COUNT(*) AS n FROM entitlements WHERE status = 'active'"),
    first(app.db, "SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL"),
    // Payment events the store refused, errored on, or is holding (a refund waiting for its payment), ranked in admin/alerts.js.
    all(app.db, `SELECT id, type, order_id, outcome, detail, received_at FROM payment_events
      WHERE outcome IN ('rejected', 'error') OR outcome LIKE '%waiting for payment' ORDER BY received_at DESC LIMIT 20`)
  ]);
  return json({ orders, customers: customers.n, activeEntitlements: entitlements.n, products: products.n, alerts: paymentAlerts(alerts), environment: app.config.appEnv,
    paymentProvider: app.config.paymentProvider, livePayments: paymentProvider(app).livemode(app.config) });
}

async function products(app) {
  await requireAdmin(app);
  const [rows, files] = await Promise.all([
    all(app.db, "SELECT * FROM products ORDER BY deleted_at IS NOT NULL, title"),
    all(app.db, "SELECT id, product_id, filename, label, size_bytes, active, status, created_at, pac_id, kind FROM product_files ORDER BY sort, filename")
  ]);
  return json({
    products: rows.map((p) => ({ ...publicProduct(p), published: Boolean(p.published), salesPaused: Boolean(p.sales_paused), deleted: Boolean(p.deleted_at),
      updatedAt: p.updated_at, createdAt: p.created_at, files: files.filter((f) => f.product_id === p.id) }))
  });
}

// PATCH any of { salesPaused, priceCents, published, deleted, title, description }: the owner's controls over a product. A
// change to price, published, deleted, title or description marks the row admin-managed, so the next deploy's catalog sync (scripts/lib/catalog.js) leaves
// it alone. Price, publishing and removal are recorded in the audit log by database triggers (migration 0004).
async function updateProduct(app, { productId }) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  const sets = [], args = [];
  const flag = (name, col) => {
    if (body[name] === undefined) return;
    if (typeof body[name] !== "boolean") fail(400, "invalid_field", `${name} must be true or false.`);
    sets.push(`${col} = ?`); args.push(body[name] ? 1 : 0);
  };
  flag("salesPaused", "sales_paused");
  flag("published", "published");
  if (body.deleted !== undefined) {
    if (typeof body.deleted !== "boolean") fail(400, "invalid_field", "deleted must be true or false.");
    sets.push("deleted_at = ?"); args.push(body.deleted ? now() : null);
    if (body.deleted) sets.push("published = 0");
  }
  if (body.priceCents !== undefined) {
    if (!Number.isInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 1000000) fail(400, "invalid_field", "priceCents must be a whole number of cents from 0 to 1,000,000.");
    sets.push("price_cents = ?"); args.push(body.priceCents);
  }
  if (body.title !== undefined) { sets.push("title = ?"); args.push(str(body.title, "title", { min: 3, max: 80 }).trim()); }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 2000) fail(400, "invalid_field", "The description can be up to 2,000 characters.");
    sets.push("description = ?"); args.push(body.description.trim());
  }
  if (!sets.length) fail(400, "invalid_field", "Nothing to change.");
  if (["priceCents", "published", "deleted", "title", "description"].some((k) => body[k] !== undefined)) sets.push("admin_managed = 1");
  const res = await run(app.db, `UPDATE products SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...args, now(), id(productId));
  if (!res.meta.changes) fail(404, "not_found", "No product with that id.");
  if (body.title !== undefined || body.description !== undefined) await refreshSearchText(app.db, productId);
  if (body.salesPaused !== undefined) await audit(app, body.salesPaused ? "product.sales_paused" : "product.sales_resumed", { targetType: "product", targetId: productId });
  const changed = ["priceCents", "published", "deleted", "title", "description"].filter((k) => body[k] !== undefined);
  if (changed.length) await audit(app, "product.changed_by_admin", { targetType: "product", targetId: productId, detail: Object.fromEntries(changed.map((k) => [k, body[k]])) });
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
  ["POST", "/api/admin/entitlements/:entitlementId/revoke", revokeEntitlement]
];

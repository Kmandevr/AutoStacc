// Customer preview (admin only, read-only): what one customer has, at a glance, without becoming them. Their
// account, orders, what they own (through the same entitlement lookup their library uses), recent downloads, follows,
// and the impersonations and audit entries that concern them. Opening it is itself recorded in the audit log.
import { json, fail, str } from "../lib/http.js";
import { all } from "../lib/db.js";
import { requireAdmin, isAdmin } from "../auth/session.js";
import { activeEntitlements } from "../entitlements/grants.js";
import { getProducts } from "../catalog/products.js";
import { userById } from "../impersonation/sessions.js";
import { USER_ID } from "../impersonation/routes.js";
import { testPaymentsOnly } from "./test-purchases.js";
import { audit } from "../audit/log.js";

async function preview(app, { userId }) {
  await requireAdmin(app);
  const u = await userById(app.db, str(userId, "userId", { max: 64, pattern: USER_ID }));
  if (!u) fail(404, "not_found", "No customer with that id.");
  const email = String(u.email).toLowerCase();
  const access = { user: u.emailVerified ? u : null, guestOrderIds: [] };
  const [orders, entitlements, owned, downloads, follows, impersonations] = await Promise.all([
    all(app.db, `SELECT id, status, total_cents AS totalCents, currency, provider, livemode, created_at AS createdAt, impersonation_id AS impersonationId
      FROM orders WHERE user_id = ? OR email = ? ORDER BY created_at DESC LIMIT 50`, u.id, email),
    all(app.db, `SELECT id, product_id AS productId, source_type AS sourceType, status, granted_at AS grantedAt, revoked_at AS revokedAt, revoke_reason AS revokeReason
      FROM entitlements WHERE user_id = ? OR email = ? ORDER BY granted_at DESC LIMIT 200`, u.id, email),
    activeEntitlements(app.db, access),
    all(app.db, `SELECT event, product_id AS productId, reason, created_at AS at, impersonation_id IS NOT NULL AS byAdmin FROM download_events
      WHERE subject = ? ORDER BY created_at DESC LIMIT 20`, `u:${u.id}`),
    all(app.db, "SELECT project_id AS projectId, auto_stacc AS autoStacc FROM follows WHERE user_id = ?", u.id),
    all(app.db, `SELECT id, admin_user_id AS adminUserId, purpose, started_at AS startedAt, ended_at AS endedAt, end_reason AS endReason
      FROM impersonations WHERE customer_user_id = ? ORDER BY started_at DESC LIMIT 10`, u.id)
  ]);
  const productIds = [...new Set(owned.map((e) => e.product_id))];
  const products = await getProducts(app.db, productIds);
  await audit(app, "customer.previewed", { targetType: "user", targetId: u.id, subjectUserId: u.id });
  return json({
    customer: { id: u.id, name: u.name, email: u.email, verified: u.emailVerified, admin: isAdmin(app, u), createdAt: u.createdAt },
    library: products.map((p) => ({ productId: p.id, title: p.title, type: p.type })),
    libraryNote: access.user ? null : "Email not verified: their library shows nothing until they confirm it.",
    orders, entitlements, downloads, follows, impersonations,
    canImpersonate: !isAdmin(app, u), testPurchases: testPaymentsOnly(app)
  });
}

export const routes = [["GET", "/api/admin/customers/:userId", preview]];

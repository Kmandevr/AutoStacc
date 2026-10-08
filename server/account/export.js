// "Download your data": everything the store holds about the signed-in account, as one JSON file. A POST (the
// impersonation policy refuses it, so support can't take it) that each module answers for its own tables.
import { json, fail } from "../lib/http.js";
import { requireUser, impersonationIdOf } from "../auth/session.js";
import { listDevices, iso } from "../auth/devices.js";
import { getPreferences } from "../email/preferences.js";
import { emailsTo } from "../email/index.js";
import { ordersOfPerson, orderItems, publicOrder } from "../orders/orders.js";
import { entitlementsOfPerson } from "../entitlements/grants.js";
import { listFollows, publicFollow } from "../projects/follows.js";
import { votesOfUser } from "../polls/polls.js";
import { creatorsOfUser } from "../creators/creators.js";
import { limit } from "../lib/ratelimit.js";

export async function collect(app, user) {
  const db = app.db;
  const email = String(user.email).toLowerCase();
  const orders = [];
  for (const o of await ordersOfPerson(db, user.id, email)) orders.push({ ...publicOrder(o, await orderItems(db, o.id)), promoCode: o.promo_code || null });
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email, emailVerified: Boolean(user.emailVerified), createdAt: iso(user.createdAt) },
    emailPreferences: await getPreferences(db, user.id),
    devices: (await listDevices(db, user.id)).map(({ id, ...d }) => d),
    orders,
    library: (await entitlementsOfPerson(db, user.id, email)).map((e) => ({
      productId: e.product_id, source: e.source_type, status: e.status, grantedAt: e.granted_at, expiresAt: e.expires_at, revokedAt: e.revoked_at
    })),
    follows: (await listFollows(db, user.id)).map(publicFollow),
    pollVotes: (await votesOfUser(db, user.id)).map((v) => ({ pollId: v.poll_id, optionId: v.option_id, votedAt: v.created_at, changedAt: v.updated_at })),
    creators: (await creatorsOfUser(db, user.id)).map((c) => ({ id: c.id, slug: c.slug, name: c.name, role: c.role })),
    emailsSent: (await emailsTo(db, email)).map((m) => ({ kind: m.kind, subject: m.subject, status: m.status, at: m.created_at }))
  };
}

async function exportData(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  await limit(app, "account-export", 5, 3600);
  const data = await collect(app, user);
  return json(data, 200, {
    "Content-Disposition": `attachment; filename="autostacc-data-${data.exportedAt.slice(0, 10)}.json"`,
    "Cache-Control": "no-store"
  });
}

export const routes = [["POST", "/api/account/export", exportData]];

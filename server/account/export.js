// "Download your data": everything the store holds about the signed-in account, as one JSON file. A POST (the
// impersonation policy refuses it, so support can't take it) that each module answers for its own tables.
import { reviewsOfUser } from "../reviews/reviews.js";
import { json, fail } from "../lib/http.js";
import { requireUser, impersonationIdOf } from "../auth/session.js";
import { listDevices, iso } from "../auth/devices.js";
import { getPreferences } from "../email/preferences.js";
import { emailsTo } from "../email/index.js";
import { ordersOfPerson, orderItems, publicOrder } from "../orders/orders.js";
import { entitlementsOfPerson } from "../entitlements/grants.js";
import { listFollows, publicFollow } from "../projects/follows.js";
import { listWishlist } from "../wishlist/wishlist.js";
import { listCollections, itemsOf, tagsOf, searchesOf } from "../collections/collections.js";
import { votesOfUser } from "../polls/polls.js";
import { creatorsOfUser } from "../creators/creators.js";
import { limit } from "../lib/ratelimit.js";
import { twoFactorEnabled } from "../auth/two-factor-state.js";
import { twoFactorOn } from "../auth/two-factor.js";

export async function collect(app, user) {
  const db = app.db;
  const email = String(user.email).toLowerCase();
  // Every section reads only its own tables, so they are read together.
  const [twoStep, emailPreferences, devices, orders, library, follows, pollVotes, creators, emailsSent, wishlist, collections, items, tags, searches, reviews] = await Promise.all([
    twoFactorEnabled(db, user.id),
    getPreferences(db, user.id),
    listDevices(db, user.id),
    ordersOfPerson(db, user.id, email).then((list) => Promise.all(list.map(async (o) => ({ ...publicOrder(o, await orderItems(db, o.id)), promoCode: o.promo_code || null })))),
    entitlementsOfPerson(db, user.id, email),
    listFollows(db, user.id),
    votesOfUser(db, user.id),
    creatorsOfUser(db, user.id),
    emailsTo(db, email),
    listWishlist(db, user.id),
    listCollections(db, user.id),
    itemsOf(db, user.id),
    tagsOf(db, user.id),
    searchesOf(db, user.id),
    reviewsOfUser(db, user.id)
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email, emailVerified: Boolean(user.emailVerified), createdAt: iso(user.createdAt),
      // Whether two-step sign-in is on (only where it exists); never its secret or backup codes (they'd hand over the account).
      ...((twoStep || twoFactorOn(app)) && { twoStepSignIn: twoStep }) },
    emailPreferences,
    devices: devices.map(({ id, ...d }) => d),
    orders,
    library: library.map((e) => ({
      productId: e.product_id, source: e.source_type, status: e.status, grantedAt: e.granted_at, expiresAt: e.expires_at, revokedAt: e.revoked_at
    })),
    follows: follows.map(publicFollow),
    wishlist: wishlist.map((w) => ({ productId: w.product_id, addedAt: w.created_at })),
    // Item keys are a file's asset id (or its file id): the same ids Your Stacc shows.
    collections: collections.map((c) => ({ name: c.name, createdAt: c.created_at,
      items: items.filter((i) => i.collection_id === c.id).map((i) => ({ item: i.item_key, addedAt: i.added_at })) })),
    tags: tags.map((t) => ({ item: t.item_key, tag: t.tag, addedAt: t.created_at })),
    savedSearches: searches.map((s) => ({ name: s.name, query: s.query, savedAt: s.created_at })),
    reviews: reviews.map((r) => ({ productId: r.product_id, rating: r.rating, text: r.body, writtenAt: r.created_at, changedAt: r.updated_at, hiddenByAutoStacc: Boolean(r.hidden_at) })),
    pollVotes: pollVotes.map((v) => ({ pollId: v.poll_id, optionId: v.option_id, votedAt: v.created_at, changedAt: v.updated_at })),
    creators: creators.map((c) => ({ id: c.id, slug: c.slug, name: c.name, role: c.role })),
    emailsSent: emailsSent.map((m) => ({ kind: m.kind, subject: m.subject, status: m.status, at: m.created_at }))
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

// Reviews API (server/reviews/reviews.js): anyone reads a product's shown reviews and rating; a signed-in, verified
// account that owns the product right now writes, edits or deletes its own one. "mine" tells the page whether the
// visitor may review and what they wrote. Admin hiding is server/admin/reviews.js.
import { json, readJson, fail, id, int } from "../lib/http.js";
import { currentUser, requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { getProduct, isVisible } from "../catalog/products.js";
import { activeEntitlements } from "../entitlements/grants.js";
import { reviewsOf, reviewOfUser, saveReview, deleteReview, LIMITS } from "./reviews.js";

const owns = async (db, user, productId) => (await activeEntitlements(db, { user, guestOrderIds: [] }, productId)).length > 0;

async function visibleProduct(app, productId) {
  const p = await getProduct(app.db, id(productId, "productId"));
  if (!isVisible(p)) fail(404, "not_found", "Nothing here.");
  return p;
}

async function list(app, { productId }) {
  const p = await visibleProduct(app, productId);
  const user = await currentUser(app);
  const verified = user && user.emailVerified ? user : null;
  const mine = verified ? await reviewOfUser(app.db, p.id, verified.id) : null;
  return json({ ...(await reviewsOf(app.db, p.id)),
    mine: { signedIn: Boolean(verified), canReview: Boolean(verified && (await owns(app.db, verified, p.id))),
      review: mine && { rating: mine.rating, body: mine.body, hidden: Boolean(mine.hidden_at) } } }, 200, { "Cache-Control": "no-store" });
}

async function write(app, { productId }) {
  const user = await requireUser(app);
  const p = await visibleProduct(app, productId);
  await limit(app, "review-write", 20, 3600);
  if (!(await owns(app.db, user, p.id))) fail(403, "not_a_buyer", "Only people who own this product can review it.");
  const body = await readJson(app.request, 4096);
  const rating = int(body.rating, "rating", { min: 1, max: 5 });
  const text = body.body === undefined || body.body === null ? "" : String(body.body).trim();
  if (text.length > LIMITS.bodyChars) fail(400, "invalid_field", `Keep it under ${LIMITS.bodyChars} characters.`, { field: "body" });
  const r = await saveReview(app.db, { productId: p.id, userId: user.id, rating, body: text });
  return json({ review: { rating: r.rating, body: r.body, hidden: Boolean(r.hidden_at) } });
}

async function remove(app, { productId }) {
  const user = await requireUser(app);
  await deleteReview(app.db, id(productId, "productId"), user.id);
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/products/:productId/reviews", list],
  ["PUT", "/api/products/:productId/review", write],
  ["DELETE", "/api/products/:productId/review", remove]
];

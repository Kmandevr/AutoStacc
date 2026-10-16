// Reviews from confirmed buyers (D1 product_reviews; issue #96): 1 to 5 stars and an optional short text, one per account
// and product. Only someone who owns the product right now may write one, and a review is shown only while its author
// still does (entitlements/grants.js ownsNowSql), so a refund takes it off the page. Shown without a name ("Verified
// buyer"). Creators can't change buyers' reviews; AutoStacc can hide one (audited, server/admin/reviews.js).
import { all, first, run, stmt, newId, now } from "../lib/db.js";
import { ownsNowSql } from "../entitlements/grants.js";

export const LIMITS = { bodyChars: 1000, shown: 20 };

const SHOWN = `r.hidden_at IS NULL AND ${ownsNowSql("r.product_id", "r.user_id", "u.email")}`;
const FROM = `product_reviews r JOIN "user" u ON u.id = r.user_id`;

/** What the product page shows: the average and count of shown reviews, and the latest ones. */
export async function reviewsOf(db, productId) {
  const t = now();
  const [summary, list] = await Promise.all([
    first(db, `SELECT COUNT(*) AS count, AVG(r.rating) AS average FROM ${FROM} WHERE r.product_id = ? AND ${SHOWN}`, productId, t),
    all(db, `SELECT r.id, r.rating, r.body, r.created_at, r.updated_at FROM ${FROM} WHERE r.product_id = ? AND ${SHOWN} ORDER BY r.updated_at DESC LIMIT ?`, productId, t, LIMITS.shown)
  ]);
  return { count: summary.count, average: summary.count ? Math.round(summary.average * 10) / 10 : null,
    reviews: list.map((r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at, edited: r.updated_at !== r.created_at })) };
}

/** Every product's shown average and count, for the store (only products with reviews). */
export const ratingsOf = (db, productIds) => productIds.length ? all(db, `SELECT r.product_id, COUNT(*) AS count, AVG(r.rating) AS average FROM ${FROM}
  WHERE r.product_id IN (${productIds.map(() => "?").join(",")}) AND ${SHOWN} GROUP BY r.product_id`, ...productIds, now()) : Promise.resolve([]);

export const reviewOfUser = (db, productId, userId) => first(db, "SELECT * FROM product_reviews WHERE product_id = ? AND user_id = ?", productId, userId);

/** Writes (or rewrites) this account's review; editing keeps a hidden review hidden. */
export async function saveReview(db, { productId, userId, rating, body }) {
  const t = now();
  await run(db, `INSERT INTO product_reviews (id, product_id, user_id, rating, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body, updated_at = excluded.updated_at`,
  newId("rv"), productId, userId, rating, body, t, t);
  return reviewOfUser(db, productId, userId);
}

export const deleteReview = (db, productId, userId) => run(db, "DELETE FROM product_reviews WHERE product_id = ? AND user_id = ?", productId, userId);

// Account deletion and the data export.
export const eraseReviewsStmt = (db, userId) => stmt(db, "DELETE FROM product_reviews WHERE user_id = ?", userId);
export const reviewsOfUser = (db, userId) => all(db, "SELECT product_id, rating, body, created_at, updated_at, hidden_at FROM product_reviews WHERE user_id = ? ORDER BY created_at", userId);

// Admin: the latest reviews (hidden ones too), with their product, never the author's email.
export const latestReviews = (db, max = 200) => all(db,
  `SELECT r.id, r.product_id, p.title, r.rating, r.body, r.created_at, r.updated_at, r.hidden_at, r.hidden_note FROM product_reviews r
   LEFT JOIN products p ON p.id = r.product_id ORDER BY r.updated_at DESC LIMIT ?`, max);

export async function setHidden(db, id, hidden, adminId, note) {
  const res = hidden
    ? await run(db, "UPDATE product_reviews SET hidden_at = ?, hidden_by = ?, hidden_note = ? WHERE id = ? AND hidden_at IS NULL", now(), adminId, note, id)
    : await run(db, "UPDATE product_reviews SET hidden_at = NULL, hidden_by = NULL, hidden_note = NULL WHERE id = ? AND hidden_at IS NOT NULL", id);
  return res.meta.changes === 1;
}

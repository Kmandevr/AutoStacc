// Wishlists (D1 wishlist_items): a signed-in person's saved products. Only visible products can be saved; the list is
// theirs alone (every read and write is by their own user id), deleted with the account and part of the data export.
// The store's recommendations read it only for its owner, and only as counts per product for everyone else.
import { all, first, run, stmt, now } from "../lib/db.js";

export const MAX_ITEMS = 500;

export const listWishlist = (db, userId) =>
  all(db, "SELECT product_id, created_at FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC", userId);

// Adds once; the size cap is checked inside the insert, so parallel requests can't pass it.
export async function addToWishlist(db, userId, productId) {
  const res = await run(db, `INSERT OR IGNORE INTO wishlist_items (user_id, product_id, created_at)
    SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM wishlist_items WHERE user_id = ?) < ?`, userId, productId, now(), userId, MAX_ITEMS);
  if (res.meta.changes) return "added";
  return (await first(db, "SELECT 1 FROM wishlist_items WHERE user_id = ? AND product_id = ?", userId, productId)) ? "already" : "full";
}

export const removeFromWishlist = (db, userId, productId) =>
  run(db, "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?", userId, productId);

// For deleting an account (server/account/delete.js batches it with the rest).
export const removeWishlistStmt = (db, userId) => stmt(db, "DELETE FROM wishlist_items WHERE user_id = ?", userId);

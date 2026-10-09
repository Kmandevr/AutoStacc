// Marketplace-wide signals per product, from records the store already keeps: confirmed purchases (active purchase
// entitlements, so refunds don't count and carts never do), product page views (the anonymous daily counts in
// analytics_daily) and wishlist saves. Aggregates only; nothing about who. Cached briefly per Worker instance, since
// they change slowly and the store reads them on every recommendation.
import { all } from "../lib/db.js";

export const WINDOW_DAYS = { purchases: 90, views: 30 };
const TTL_MS = 60 * 1000;
let cache = null;

const daysAgo = (n, at) => new Date(Date.parse(at) - n * 86400000).toISOString();

// Map(productId -> { purchases, views, wishes }) for products with any signal.
export async function productSignals(db, at = new Date().toISOString()) {
  if (cache && cache.db === db && Date.now() - cache.time < TTL_MS) return cache.map;
  const [bought, viewed, wished] = await Promise.all([
    all(db, `SELECT product_id AS id, COUNT(*) AS n FROM entitlements WHERE source_type = 'purchase' AND status = 'active' AND granted_at >= ?
      GROUP BY product_id`, daysAgo(WINDOW_DAYS.purchases, at)),
    all(db, "SELECT subject AS id, SUM(count) AS n FROM analytics_daily WHERE event = 'product_view' AND day >= ? GROUP BY subject",
      daysAgo(WINDOW_DAYS.views, at).slice(0, 10)),
    all(db, "SELECT product_id AS id, COUNT(*) AS n FROM wishlist_items GROUP BY product_id")
  ]);
  const map = new Map();
  const put = (rows, key) => rows.forEach((r) => { const s = map.get(r.id) || { purchases: 0, views: 0, wishes: 0 }; s[key] = r.n; map.set(r.id, s); });
  put(bought, "purchases");
  put(viewed, "views");
  put(wished, "wishes");
  cache = { db, time: Date.now(), map };
  return map;
}

// Tests and admin changes that must be seen at once.
export const forgetSignals = () => { cache = null; };

// What the store may say publicly about recent sales: a floor bucket (5+, 10+, 25+, 50+, 100+), never an exact count,
// and nothing under 5.
export const soldBucket = (n) => [100, 50, 25, 10, 5].find((b) => n >= b) || 0;

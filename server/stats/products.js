// Product statistics: the catalog's state, and per product its sales (payment), views (browser-counted, so
// approximate) and a view-to-purchase rate shown only when there are enough views for it to mean something.
import { all, first } from "../lib/db.js";
import { count, rows } from "./metric.js";

const MIN_VIEWS = 50;

// Per product: its order lines (order_items by product, CROSS JOIN keeps that order) and its entitlements (by product).
export const queries = {
  catalog: `SELECT SUM(published = 1 AND deleted_at IS NULL) AS published, SUM(published = 0 AND deleted_at IS NULL) AS drafts,
    SUM(sales_paused = 1 AND deleted_at IS NULL) AS paused, SUM(deleted_at IS NOT NULL) AS removed FROM products`,
  perProduct: `SELECT p.id, p.title, p.published, p.sales_paused AS paused, p.price_cents AS price,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i CROSS JOIN orders o ON o.id = i.order_id
        WHERE i.product_id = p.id AND o.livemode = ? AND o.status = 'paid' AND o.paid_at >= ?) AS units,
      (SELECT COALESCE(SUM(a.count), 0) FROM analytics_daily a WHERE a.event = 'product_view' AND a.subject = p.id AND a.day >= ?) AS views,
      (SELECT COUNT(*) FROM entitlements e WHERE +e.status = 'active' AND e.product_id = p.id) AS owners
    FROM products p WHERE p.deleted_at IS NULL ORDER BY units DESC, p.title`
};

export default {
  queries,
  id: "products",
  title: "Products",
  async metrics({ db, live, since, sinceDay }) {
    const [catalog, list] = await Promise.all([first(db, queries.catalog), all(db, queries.perProduct, live, since, sinceDay)]);
    const paid = list.filter((p) => p.published && p.price > 0);
    const rate = (p) => (p.views >= MIN_VIEWS ? { percent: Math.round((p.units / p.views) * 1000) / 10 } : null);
    return [
      count("published", "Published", "record", catalog.published),
      count("drafts", "Drafts", "record", catalog.drafts, "In data/products.js but not published."),
      count("paused", "Sales paused", "record", catalog.paused),
      rows("per-product", "Per product", "record", ["Product", "Status", "Sold", "Views", "View → buy", "Owners"],
        list.map((p) => [p.title, p.published ? (p.paused ? "paused" : "published") : "draft", p.units, p.views, rate(p), p.owners]),
        `Sold: paid orders in this period. Views: product page views counted by browsers (approximate). View → buy is an estimate, shown only from ${MIN_VIEWS} views. Owners: active entitlements, all sources.`),
      rows("most", "Most purchased", "payment", ["Product", "Sold"], paid.slice(0, 3).filter((p) => p.units > 0).map((p) => [p.title, p.units])),
      rows("least", "Least purchased", "payment", ["Product", "Sold"], paid.slice(-3).reverse().map((p) => [p.title, p.units]),
        "Published paid products with the fewest sales in this period.")
    ];
  }
};

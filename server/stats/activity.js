// Site activity: the anonymous daily counters from POST /api/events (no cookies, IPs or user ids), so every number
// here is approximate and the same for live and test. The funnel compares browser counts with paid orders, which is
// why its rate is labelled an estimate.
import { all, first } from "../lib/db.js";
import { count, series, rows, percent, daily } from "./metric.js";

// Which counters this section reads, and how they're labelled. A new tracked event = one line here (and in
// server/analytics/routes.js EVENTS, and the page that sends it).
export const VIEWS = [
  ["page_view", "Page views"],
  ["project_view", "Project page views"],
  ["product_view", "Product page views"],
  ["release_view", "Release page views"],
  ["news_view", "News post views"]
];

export const queries = {
  // The primary key (day, event, subject) serves every date range; named, because the planner can't know days grow.
  totals: `SELECT event, SUM(count) AS n FROM analytics_daily INDEXED BY sqlite_autoindex_analytics_daily_1 WHERE day >= ? GROUP BY event`,
  pagesByDay: `SELECT day, SUM(count) AS n FROM analytics_daily INDEXED BY sqlite_autoindex_analytics_daily_1 WHERE day >= ? AND event = 'page_view'
    GROUP BY day ORDER BY day`,
  top: `SELECT event, subject, SUM(count) AS n FROM analytics_daily INDEXED BY sqlite_autoindex_analytics_daily_1 WHERE day >= ? AND subject != ''
    GROUP BY event, subject ORDER BY n DESC LIMIT 200`,
  paid: `SELECT COUNT(*) AS n FROM orders WHERE livemode = ? AND paid_at >= ? AND status = 'paid'`
};

export default {
  queries,
  id: "activity",
  title: "Site activity",
  async metrics({ db, live, since, sinceDay, untilDay }) {
    const [totals, byDay, top, paid] = await Promise.all([
      all(db, queries.totals, sinceDay), all(db, queries.pagesByDay, sinceDay), all(db, queries.top, sinceDay), first(db, queries.paid, live, since)
    ]);
    const n = (e) => (totals.find((t) => t.event === e) || { n: 0 }).n;
    const topOf = (e) => top.filter((t) => t.event === e).slice(0, 10).map((t) => [t.subject, t.n]);
    const views = n("product_view");
    return [
      ...VIEWS.map(([e, label]) => count(e, label, "activity", n(e))),
      series("pages-by-day", "Page views per day", "activity", daily(sinceDay, untilDay, byDay.map((r) => ({ day: r.day, value: r.n })))),
      rows("top-pages", "Most viewed pages", "activity", ["Page", "Views"], topOf("page_view")),
      rows("top-projects", "Most viewed projects", "activity", ["Project", "Views"], topOf("project_view")),
      rows("top-products", "Most viewed products", "activity", ["Product", "Views"], topOf("product_view")),
      rows("top-news", "Most read news", "activity", ["Post", "Views"], topOf("news_view")),
      rows("funnel", "Store funnel", "activity", ["Step", "Count"], [["Product views", views], ["Added to cart", n("add_to_cart")],
        ["Checkout started", n("checkout_start")], ["Purchase page reached", n("purchase_complete")], ["Paid orders (payment records)", paid.n]],
        "Browser counts, except the last row. Event pages aren't counted: events have no page of their own yet."),
      percent("conversion", "Views that became paid orders", "derived", views >= 50 ? Math.round((paid.n / views) * 1000) / 10 : null,
        views >= 50 ? "Paid orders ÷ product page views. An estimate: views are approximate and one order can follow many views." : "Not enough product views yet to estimate this (needs 50).")
    ];
  }
};

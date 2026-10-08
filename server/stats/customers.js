// Customer statistics: counts of accounts and buyers, never who they are. "Active" means bought (a paid order) or
// downloaded something in the period; downloads an admin made while impersonating don't count.
import { all, first } from "../lib/db.js";
import { count, series, rows, daily } from "./metric.js";

export const queries = {
  accounts: `SELECT COUNT(*) AS n FROM "user"`,
  newByDay: `SELECT substr("createdAt", 1, 10) AS day, COUNT(*) AS n FROM "user" WHERE "createdAt" >= ? GROUP BY day ORDER BY day`,
  active: `SELECT COUNT(*) AS n FROM (
      SELECT 'u:' || user_id AS who FROM orders WHERE livemode = ? AND paid_at >= ? AND status = 'paid' AND user_id IS NOT NULL
      UNION SELECT subject FROM download_events INDEXED BY download_events_time
        WHERE created_at >= ? AND event = 'served' AND impersonation_id IS NULL AND subject LIKE 'u:%')`,
  owners: `SELECT COUNT(DISTINCT email) AS n FROM entitlements WHERE status = 'active'`,
  neverBought: `SELECT COUNT(*) AS n FROM "user" u WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid' AND o.livemode = ?)`,
  buyers: `SELECT user_id IS NOT NULL AS account, COUNT(*) AS orders, COUNT(DISTINCT email) AS people FROM orders
    WHERE livemode = ? AND paid_at >= ? AND status = 'paid' GROUP BY account`,
  repeat: `SELECT COUNT(*) AS n FROM (SELECT email FROM orders WHERE livemode = ? AND paid_at >= ? AND status = 'paid' GROUP BY email HAVING COUNT(*) > 1)`
};

export default {
  queries,
  id: "customers",
  title: "Customers",
  async metrics({ db, live, since, sinceDay, untilDay }) {
    const [accounts, newByDay, active, owners, neverBought, buyers, repeat] = await Promise.all([
      first(db, queries.accounts), all(db, queries.newByDay, since), first(db, queries.active, live, since, since), first(db, queries.owners),
      first(db, queries.neverBought, live), all(db, queries.buyers, live, since), first(db, queries.repeat, live, since)
    ]);
    const by = (acct) => buyers.find((b) => b.account === acct) || { orders: 0, people: 0 };
    return [
      count("accounts", "Accounts", "record", accounts.n, "All accounts, including unverified ones and admins."),
      count("new", "New accounts", "record", newByDay.reduce((t, r) => t + r.n, 0)),
      series("new-by-day", "New accounts per day", "record", daily(sinceDay, untilDay, newByDay.map((r) => ({ day: r.day, value: r.n })))),
      count("active", "Active customers", "record", active.n, "Accounts that bought or downloaded something in this period."),
      count("owners", "People who own something", "record", owners.n, "Accounts and guest buyers with at least one active entitlement, by email."),
      count("never-bought", "Accounts with no purchases", "record", neverBought.n, "All time. They may still own free items."),
      rows("relationships", "Who places orders", "payment", ["Buyer", "Paid orders", "People"],
        [["With an account", by(1).orders, by(1).people], ["As a guest", by(0).orders, by(0).people]]),
      count("repeat", "Repeat buyers", "payment", repeat.n, "People (by email) with more than one paid order in this period.")
    ];
  }
};

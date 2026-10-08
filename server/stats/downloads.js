// Downloads and entitlements: what customers own (by how they got it) and what they downloaded, from the store's own
// download log. Downloads an admin made while impersonating are counted apart, never as the customer's.
import { all, first } from "../lib/db.js";
import { count, series, rows, daily } from "./metric.js";

export const queries = {
  entitlements: `SELECT source_type AS source, COUNT(*) AS n FROM entitlements WHERE status = 'active' GROUP BY source_type`,
  events: `SELECT event, COUNT(*) AS n FROM download_events WHERE created_at >= ? AND impersonation_id IS NULL GROUP BY event`,
  byDay: `SELECT substr(created_at, 1, 10) AS day, SUM(event = 'served') AS served, SUM(event = 'denied') AS denied FROM download_events
    WHERE created_at >= ? AND impersonation_id IS NULL GROUP BY day ORDER BY day`,
  byFile: `SELECT f.product_id AS productId, p.title, f.label, f.filename, f.active, COUNT(*) AS n FROM download_events d
    JOIN product_files f ON f.id = d.file_id JOIN products p ON p.id = f.product_id
    WHERE d.created_at >= ? AND d.event = 'served' AND d.impersonation_id IS NULL GROUP BY d.file_id ORDER BY n DESC LIMIT 20`,
  denied: `SELECT reason, COUNT(*) AS n FROM download_events WHERE created_at >= ? AND event = 'denied' AND impersonation_id IS NULL
    GROUP BY reason ORDER BY n DESC LIMIT 10`,
  byAdmins: `SELECT COUNT(*) AS n FROM download_events WHERE impersonation_id IS NOT NULL AND created_at >= ?`
};

export default {
  queries,
  id: "downloads",
  title: "Downloads & entitlements",
  async metrics({ db, since, sinceDay, untilDay }) {
    const [ents, events, byDay, byFile, denied, byAdmins] = await Promise.all([
      all(db, queries.entitlements), all(db, queries.events, since), all(db, queries.byDay, since), all(db, queries.byFile, since),
      all(db, queries.denied, since), first(db, queries.byAdmins, since)
    ]);
    const ev = (e) => (events.find((r) => r.event === e) || { n: 0 }).n;
    return [
      count("active-entitlements", "Active entitlements", "record", ents.reduce((t, r) => t + r.n, 0), "All time."),
      rows("by-source", "How customers got them", "record", ["Source", "Active"], ents.map((r) => [r.source, r.n])),
      count("served", "Downloads", "record", ev("served"), "Files actually delivered."),
      count("issued", "Download links issued", "record", ev("issued")),
      count("denied", "Failed or refused downloads", "record", ev("denied"), "Expired links, not owned, missing files."),
      series("by-day", "Downloads per day", "record", daily(sinceDay, untilDay, byDay.map((r) => ({ day: r.day, value: r.served, denied: r.denied })))),
      rows("by-file", "Most downloaded files (versions)", "record", ["Product", "File", "Downloads"],
        byFile.map((r) => [r.title, `${r.label || r.filename}${r.active ? "" : " (replaced or deactivated)"}`, r.n])),
      rows("denied-reasons", "Why downloads failed", "record", ["Reason", "Count"], denied.map((r) => [r.reason || "unknown", r.n])),
      count("by-admins", "Downloads by admins while impersonating", "record", byAdmins.n, "Support checks. Not included above.")
    ];
  }
};

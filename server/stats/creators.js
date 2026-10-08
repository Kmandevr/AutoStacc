// Creator statistics: how many creators and sites there are, the storage their images use, and paid sales split by
// creator into the platform's fee and the creator's share (fixed on each order line when it was written,
// server/revenue/split.js). Lines written before that split existed count as the creator's share in full.
import { all, first } from "../lib/db.js";
import { count, money, rows } from "./metric.js";

export const queries = {
  creators: `SELECT COUNT(*) AS total, SUM(source = 'studio') AS studio, SUM(status = 'suspended') AS suspended, SUM(trusted = 1) AS trusted
    FROM creators WHERE deleted_at IS NULL`,
  sites: `SELECT COUNT(*) AS n FROM projects WHERE source = 'studio' AND published = 1 AND deleted_at IS NULL`,
  storage: `SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM site_assets WHERE status = 'active'`,
  split: `SELECT COALESCE(i.creator_id, '') AS creatorId, o.currency, SUM(COALESCE(i.net_cents, i.line_total_cents)) AS net,
      SUM(COALESCE(i.platform_fee_cents, 0)) AS fee, SUM(COALESCE(i.creator_share_cents, i.line_total_cents)) AS share
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.livemode = ? AND o.paid_at >= ? AND o.status = 'paid' GROUP BY creatorId, o.currency ORDER BY net DESC LIMIT 50`
};

export default {
  queries,
  id: "creators",
  title: "Creators",
  async metrics({ db, live, since }) {
    const [c, sites, storage, split, names] = await Promise.all([
      first(db, queries.creators), first(db, queries.sites), first(db, queries.storage), all(db, queries.split, live, since),
      all(db, "SELECT id, name FROM creators")
    ]);
    const name = new Map(names.map((x) => [x.id, x.name]));
    const totals = (key) => [...new Set(split.map((r) => r.currency))].map((currency) => ({ currency, cents: split.filter((r) => r.currency === currency).reduce((t, r) => t + r[key], 0) }));
    return [
      count("creators", "Creators", "record", c.total, `${c.studio || 0} signed up in the Studio; ${c.trusted || 0} trusted; ${c.suspended || 0} suspended.`),
      count("sites", "Published creator sites", "record", sites.n),
      count("storage", "Creator image storage (MB)", "record", Math.round((storage.bytes / 1048576) * 10) / 10, `${storage.files} images.`),
      money("platform-fees", "Platform fees", "payment", totals("fee"), "AutoStacc's share of paid order lines, after promo codes."),
      money("creator-share", "Creators' share", "payment", totals("share"), "Owed to creators; nothing is paid out automatically yet."),
      rows("creator-sales", "Sales by creator", "payment", ["Creator", "Net", "Platform fee", "Creator share"],
        split.map((r) => [name.get(r.creatorId) || "(no creator)", { cents: r.net, currency: r.currency }, { cents: r.fee, currency: r.currency }, { cents: r.share, currency: r.currency }]))
    ];
  }
};

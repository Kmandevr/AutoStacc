// Who sold each order line and how its money divides, fixed when the order is written so later fee changes never
// rewrite history. net = line total minus the line's share of a promo code. A creator's sale (creatorSaleIds,
// server/creators/creators.js) splits into the platform fee, the creator's basis points of net (rounded to the cent,
// default server/creators/policy.js), and the creator's share, the rest, so fee + share equals net. Any other line is
// AutoStacc's own revenue, a first-party creator's included (owner, 2026-10-21, #171): no fee and no share, so it never
// reaches earnings or payouts. These are the records earnings and payouts read (server/revenue/).
import { sellersOfProducts, creatorSaleIds } from "../creators/creators.js";
import { feeBpsOf } from "../creators/policy.js";

export function splitLine({ lineTotalCents, discountCents = 0, feeBps = 0 }) {
  const net = Math.max(0, lineTotalCents - discountCents);
  const fee = Math.min(net, Math.round((net * feeBps) / 10000));
  return { netCents: net, platformFeeCents: fee, creatorShareCents: net - fee };
}

// The lines with project, creator and split filled in (lines: checkout's { productId, unitPriceCents, quantity, discountCents }).
export async function attributeLines(db, lines) {
  const ids = lines.map((l) => l.productId);
  const [rows, creatorSales] = await Promise.all([sellersOfProducts(db, ids), creatorSaleIds(db, ids)]);
  const sellers = new Map(rows.map((s) => [s.product_id, s]));
  return lines.map((l) => {
    const s = sellers.get(l.productId) || {};
    const split = splitLine({ lineTotalCents: l.unitPriceCents * l.quantity, discountCents: l.discountCents || 0, feeBps: feeBpsOf(s) });
    const own = creatorSales.has(l.productId) ? split : { ...split, platformFeeCents: 0, creatorShareCents: 0 };
    return { ...l, projectId: s.project_id || null, creatorId: s.creator_id || null, ...own };
  });
}

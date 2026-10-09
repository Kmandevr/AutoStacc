// Who sold each order line and how its money divides, fixed when the order is written so later fee changes never
// rewrite history. net = line total minus the line's share of a promo code; the platform fee is the creator's basis
// points of net (rounded to the cent, default server/creators/policy.js); the creator's share is the rest, so
// fee + share always equals net. These are the records earnings and payouts read (server/revenue/).
import { sellersOfProducts } from "../creators/creators.js";
import { feeBpsOf } from "../creators/policy.js";

export function splitLine({ lineTotalCents, discountCents = 0, feeBps = 0 }) {
  const net = Math.max(0, lineTotalCents - discountCents);
  const fee = Math.min(net, Math.round((net * feeBps) / 10000));
  return { netCents: net, platformFeeCents: fee, creatorShareCents: net - fee };
}

// The lines with project, creator and split filled in (lines: checkout's { productId, unitPriceCents, quantity, discountCents }).
export async function attributeLines(db, lines) {
  const sellers = new Map((await sellersOfProducts(db, lines.map((l) => l.productId))).map((s) => [s.product_id, s]));
  return lines.map((l) => {
    const s = sellers.get(l.productId) || {};
    return { ...l, projectId: s.project_id || null, creatorId: s.creator_id || null,
      ...splitLine({ lineTotalCents: l.unitPriceCents * l.quantity, discountCents: l.discountCents || 0, feeBps: feeBpsOf(s) }) };
  });
}

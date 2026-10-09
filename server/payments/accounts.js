// Which Stripe account takes the money for a product: AutoStacc's own catalog products go to the "main" account (Managed
// Payments), creators' Studio products to the "marketplace" account (Stripe Connect payouts), because Managed Payments
// doesn't allow marketplaces. With the mock provider (development and tests) everything is "main".
import { all } from "../lib/db.js";

export const MAIN = "main";
export const MARKETPLACE = "marketplace";

export async function accountsOfProducts(db, productIds) {
  const ids = [...new Set(productIds)];
  const out = new Map(ids.map((id) => [id, MAIN]));
  if (!ids.length) return out;
  for (const r of await all(db, `SELECT id, source FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)) {
    if (r.source === "studio") out.set(r.id, MARKETPLACE);
  }
  return out;
}

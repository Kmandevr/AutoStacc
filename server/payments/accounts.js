// Which Stripe account takes the money for a product: AutoStacc's own goods (catalog products, and Studio products of a
// first-party creator) go to the "main" account (Managed Payments), Studio creators' products to the "marketplace"
// account (Stripe Connect payouts), because Managed Payments doesn't allow marketplaces. Decided by the creator's source
// (server/creators/creators.js creatorSaleIds). With the mock provider (development and tests) everything is "main".
import { creatorSaleIds } from "../creators/creators.js";

export const MAIN = "main";
export const MARKETPLACE = "marketplace";

export async function accountsOfProducts(db, productIds) {
  const ids = [...new Set(productIds)];
  const out = new Map(ids.map((id) => [id, MAIN]));
  if (!ids.length) return out;
  for (const productId of await creatorSaleIds(db, ids)) out.set(productId, MARKETPLACE);
  return out;
}

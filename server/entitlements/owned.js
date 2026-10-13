// The files a person can download right now (the same rule as Your Stacc and every download: an active entitlement to
// the product, and a retired file only for people who had it before, for 30 days), for features that act on owned
// files only, like personal collections and tags (server/collections/). Each with its item key: its asset, the same
// across a Pac's versions, or its own id when it has none.
import { activeEntitlements } from "./grants.js";
import { deliverableFiles, stillDelivered } from "../files/files.js";

export const itemKeyOf = (file) => file.asset_id || file.id;

export async function ownedFiles(db, access) {
  const ents = await activeEntitlements(db, access);
  // The earliest active grant per product decides (entitlements come oldest first).
  const since = new Map();
  for (const e of ents) if (!since.has(e.product_id)) since.set(e.product_id, e.granted_at);
  const files = await deliverableFiles(db, [...since.keys()]);
  return files.filter((f) => stillDelivered(f, since.get(f.product_id))).map((f) => ({ ...f, key: itemKeyOf(f) }));
}

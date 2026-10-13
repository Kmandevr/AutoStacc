// The store's product shape for discovery responses: the public product (server/catalog publicProduct, so price, sale
// and availability read the same everywhere) plus its facets with labels, BPM, specs and badges the data supports:
// "new" (released in the last NEW_DAYS), a sale's percent off, and a floor bucket of recent confirmed sales (5+...).
import { parseJson } from "../lib/db.js";
import { publicProduct } from "../catalog/products.js";
import { label } from "./vocabulary.js";
import { NEW_DAYS } from "./filters.js";
import { soldBucket } from "./signals.js";

export function storeProduct(row, { sales, seller, facets = {}, at }) {
  const p = publicProduct(row, sales, seller);
  const released = row.released || row.released_at || row.created_at;
  const age = (Date.parse(at) - Date.parse(released)) / 86400000;
  return {
    ...p,
    facets: Object.fromEntries(Object.entries(facets).map(([f, vs]) => [f, vs.map((value) => ({ value, label: label(f, value) }))])),
    // The creator's tempo range, else the files' (search rows carry both as bpm_lo/bpm_hi).
    bpm: row.bpm_lo ? [row.bpm_lo, row.bpm_hi] : row.bpm_min ? [row.bpm_min, row.bpm_max] : null,
    specs: parseJson(row.metadata, {}).specs || {},
    released,
    badges: {
      new: age >= 0 && age < NEW_DAYS,
      percentOff: p.sale && p.listPriceCents ? Math.round((1 - p.priceCents / p.listPriceCents) * 100) : 0,
      soldRecently: soldBucket(row.sold || 0)
    }
  };
}

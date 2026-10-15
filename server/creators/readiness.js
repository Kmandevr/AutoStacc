// Whether a Studio product can go on sale (docs/studio.md, "Release"): one check, shown by the Product Studio and used
// by updateProduct to refuse `published: true`. Blocking items stop publishing; recommended ones only help buyers.
// Each item is { code, message, section } where section is the Studio section that fixes it (store|pacs|pricing|release).
// readiness() is pure; loadReadiness() reads what it needs for one product row.
import { first, parseJson } from "../lib/db.js";
import { SELLING } from "./policy.js";
import { DELIVERABLE } from "../files/files.js";
import { facetsOf } from "../discovery/facets.js";
import { pieceOfProduct } from "../library/links.js";

const MIN_DESCRIPTION = 80;
const item = (code, message, section) => ({ code, message, section });

/** product: a products row; deliverable / inReview: booleans; creator: a creators row; facets: { field: [values] }. */
export function readiness({ product, deliverable, inReview, creator, facets }) {
  const blocking = [], recommended = [];
  const meta = parseJson(product.metadata, {});
  const price = product.price_cents;
  if (!String(product.title || "").trim()) blocking.push(item("no_title", "Give the product a title.", "store"));
  if (!deliverable && product.type === "template") {
    blocking.push(item("needs_piece", "A site template is sold from the visual builder: share a piece to the library with a price.", "release"));
  } else if (!deliverable) {
    blocking.push(inReview
      ? item("pac_in_review", "Your Pac is waiting for AutoStacc's review. It can go on sale once it is approved.", "pacs")
      : item("needs_file", "Add a file and have it approved before putting this on sale.", "pacs"));
  }
  if (!Number.isInteger(price) || (price !== 0 && (price < SELLING.minPriceCents || price > SELLING.maxPriceCents))) {
    blocking.push(item("price_out_of_range", `A price is free, or from $${SELLING.minPriceCents / 100} to $${SELLING.maxPriceCents / 100}.`, "pricing"));
  }
  if (!creator || creator.status !== "active") blocking.push(item("creator_suspended", "This creator is suspended. Contact AutoStacc support.", "release"));

  if (String(product.description || "").trim().length < MIN_DESCRIPTION) recommended.push(item("short_description", `Write a description of at least ${MIN_DESCRIPTION} characters.`, "store"));
  if (!product.artwork) recommended.push(item("no_artwork", "Add cover art.", "store"));
  if (!product.preview) recommended.push(item("no_preview", "Add a preview clip buyers can play.", "store"));
  if (!parseJson(product.tags, []).length) recommended.push(item("no_tags", "Add a few tags so people can find it.", "store"));
  if (!Object.values(facets || {}).some((v) => v && v.length)) recommended.push(item("no_store_details", "Fill in the store details.", "store"));
  if (!(meta.includes || []).length) recommended.push(item("no_includes", "Add a few \"What's inside\" lines.", "store"));
  return { ready: blocking.length === 0, blocking, recommended };
}

/** The readiness of one product row as stored (or as it would be with `overrides` applied to the row). */
export async function loadReadiness(db, product, creator, overrides = {}) {
  // A site template's deliverable is its library piece, still listed; anything else needs a delivered file.
  const [deliverable, inReview, facets] = await Promise.all([
    product.type === "template" ? pieceOfProduct(db, product.id).then((p) => (p && p.status === "active" ? p : null))
      : first(db, `SELECT 1 FROM product_files WHERE product_id = ? AND ${DELIVERABLE} LIMIT 1`, product.id),
    first(db, "SELECT 1 FROM pac_versions WHERE product_id = ? AND status = 'in_review' LIMIT 1", product.id),
    facetsOf(db, [product.id], { creatorOnly: true })
  ]);
  return readiness({ product: { ...product, ...overrides }, deliverable: Boolean(deliverable), inReview: Boolean(inReview), creator, facets: facets[product.id] || {} });
}

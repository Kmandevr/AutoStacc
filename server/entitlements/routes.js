// The customer's library ("Your Stacc"): every product they own (from entitlements, whatever the source) with its
// downloadable files, each tagged with its Pac and content kind so the page can organize them (docs/library.md), and
// claiming free products. Paid files are listed by id only; links come from server/downloads. Opening it runs
// Auto-Stacc first, so free products of followed projects arrive without any other trigger.
import { json, fail, readJson, id } from "../lib/http.js";
import { parseJson } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { requireAccess } from "./access.js";
import { activeEntitlements, grant } from "./grants.js";
import { getProduct, getProducts, isFree, isVisible } from "../catalog/products.js";
import { limit } from "../lib/ratelimit.js";
import { deliverableFiles } from "../files/files.js";
import { autoStacc, AUTO_NOTE } from "./autostacc.js";

async function library(app) {
  const access = await requireAccess(app);
  if (access.user) await autoStacc(app.db, access.user);
  const ents = await activeEntitlements(app.db, access);
  const productIds = [...new Set(ents.map((e) => e.product_id))];
  const products = new Map((await getProducts(app.db, productIds)).map((p) => [p.id, p]));
  const files = await deliverableFiles(app.db, productIds);
  const items = productIds.filter((pid) => products.has(pid)).map((pid) => {
    const p = products.get(pid);
    const mine = ents.filter((e) => e.product_id === pid);
    return {
      productId: pid,
      title: p.title,
      type: p.type,
      projectId: p.project_id || null,
      pacs: parseJson(p.pacs, []),
      artwork: p.artwork,
      metadata: parseJson(p.metadata, {}),
      // Downloads go through this entitlement (the earliest active one).
      entitlementId: mine[0].id,
      sources: [...new Set(mine.map((e) => (e.source_type === "free" && e.note === AUTO_NOTE ? "auto" : e.source_type)))],
      grantedAt: mine[0].granted_at,
      files: files.filter((f) => f.product_id === pid).map((f) => ({ id: f.id, filename: f.filename, label: f.label, contentType: f.content_type, sizeBytes: f.size_bytes, pacId: f.pac_id || null, kind: f.kind || "" }))
    };
  });
  return json({ signedIn: Boolean(access.user), guestOrders: access.guestOrderIds, items });
}

// Free products: a signed-in customer adds them to their library. One grant per account, however often they click.
async function claimFree(app) {
  const user = await requireUser(app);
  await limit(app, "free", 20, 60);
  const body = await readJson(app.request);
  const p = await getProduct(app.db, id(body.productId, "productId"));
  if (!isVisible(p)) fail(404, "not_found", "No product with that id.");
  if (!isFree(p)) fail(409, "not_free", "That one isn't free.");
  await grant(app.db, { userId: user.id, email: user.email, productId: p.id, sourceType: "free", sourceId: user.id });
  return json({ ok: true, productId: p.id });
}

export const routes = [
  ["GET", "/api/library", library],
  ["POST", "/api/library/free", claimFree]
];

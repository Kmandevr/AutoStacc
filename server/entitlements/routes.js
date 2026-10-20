// The customer's library ("Your Stacc"): every product they own (from entitlements, whatever the source) with its
// downloadable files, each tagged with its Pac and content kind so the page can organize them (docs/library.md), and
// claiming free products. Paid files are listed by id only; links come from server/downloads. Opening it runs
// Auto-Stacc first, so free products of followed projects arrive without any other trigger.
import { json, fail, readJson, id } from "../lib/http.js";
import { isOpen } from "../settings/settings.js";
import { parseJson } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { requireAccess } from "./access.js";
import { activeEntitlements, grant } from "./grants.js";
import { getProduct, getProducts, isFree, isVisible, productPath } from "../catalog/products.js";
import { limit } from "../lib/ratelimit.js";
import { deliverableFiles, readmesOf, stillDelivered, RETIRED_KEEP_DAYS } from "../files/files.js";
import { isOn } from "../lib/features.js";
import { autoStacc, AUTO_NOTE } from "./autostacc.js";
import { projectNames } from "../creators/creators.js";
import { previewsOf } from "../packs/previews.js";
import { pausedByCopyright } from "../payments/creator-sales.js";

async function library(app) {
  const access = await requireAccess(app);
  if (access.user) await autoStacc(app.db, access.user);
  const ents = await activeEntitlements(app.db, access);
  const productIds = [...new Set(ents.map((e) => e.product_id))];
  const bundles = isOn(app, "downloads.bundles");
  const [rows, files] = await Promise.all([getProducts(app.db, productIds), deliverableFiles(app.db, productIds)]);
  const products = new Map(rows.map((p) => [p.id, p]));
  // Studio projects aren't in data/projects.js, so the page gets their names from here.
  const names = new Map((await projectNames(app.db, [...new Set(rows.map((p) => p.project_id).filter(Boolean))])).map((r) => [r.id, r.name]));
  // Each Pac's preview clips (public anyway, server/packs/previews.js) and read me (its text kept at publishing).
  const clips = await previewsOf(app.db, [...new Set(rows.flatMap((p) => parseJson(p.pacs, [])))]);
  const readmes = await readmesOf(app.db, productIds);
  const items = productIds.filter((pid) => products.has(pid)).map((pid) => {
    const p = products.get(pid);
    const mine = ents.filter((e) => e.product_id === pid);
    return {
      productId: pid,
      title: p.title,
      type: p.type,
      projectId: p.project_id || null,
      projectName: names.get(p.project_id) || null,
      path: productPath(p),
      pacs: parseJson(p.pacs, []),
      previews: parseJson(p.pacs, []).flatMap((id) => (clips[id] || []).map(({ title, url }) => ({ pacId: id, title, url }))),
      readme: readmes[pid] || null,
      artwork: p.artwork,
      metadata: parseJson(p.metadata, {}),
      // Downloads go through this entitlement (the earliest active one).
      entitlementId: mine[0].id,
      sources: [...new Set(mine.map((e) => (e.source_type === "free" && e.note === AUTO_NOTE ? "auto" : e.source_type)))],
      grantedAt: mine[0].granted_at,
      files: files.filter((f) => f.product_id === pid && stillDelivered(f, mine[0].granted_at)).map((f) => ({ id: f.id, filename: f.filename, label: f.label, contentType: f.content_type, sizeBytes: f.size_bytes, pacId: f.pac_id || null, kind: f.kind || "",
        folderPath: f.folder_path || "", ...(f.asset_id ? { assetId: f.asset_id } : {}), ...(f.retired_at ? { retiredAt: f.retired_at, availableUntil: new Date(Date.parse(f.retired_at) + RETIRED_KEEP_DAYS * 86400000).toISOString() } : {}),
        // Files with a stored original can go into a ZIP with others (POST /api/downloads/bundle).
        ...(f.blob_id && bundles ? { bundleable: true } : {}) }))
    };
  });
  return json({ signedIn: Boolean(access.user), guestOrders: access.guestOrderIds, items });
}

// Free products: a signed-in customer adds them to their library. One grant per account, however often they click.
async function claimFree(app) {
  const user = await requireUser(app);
  await limit(app, "free", 20, 60);
  if (!(await isOpen(app.db, "store_sales"))) fail(503, "sales_paused", "Sales are paused for a moment, free items too. Try again soon.");
  const body = await readJson(app.request);
  const p = await getProduct(app.db, id(body.productId, "productId"));
  if (!isVisible(p)) fail(404, "not_found", "No product with that id.");
  if (!isFree(p)) fail(409, "not_free", "That one isn't free.");
  if ((await pausedByCopyright(app.db, [p.id])).size) fail(409, "seller_paused", "This creator can't hand out items right now.");
  await grant(app.db, { userId: user.id, email: user.email, productId: p.id, sourceType: "free", sourceId: user.id });
  return json({ ok: true, productId: p.id });
}

export const routes = [
  ["GET", "/api/library", library],
  ["POST", "/api/library/free", claimFree]
];

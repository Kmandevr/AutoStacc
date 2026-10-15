// Studio API, the community library (owner, 2026-10-15; docs/builder.md, phase 8): browse pieces, share one (creators
// AutoStacc trusts only, and members whose role may share; a price makes it a store product of type "template", which
// also needs the role that runs products), install one into your own sites (a paid one only once you own it), delete
// your own, and report any. AutoStacc's takedowns are in library/admin.js.
import { json, readJson, fail, str, int } from "../lib/http.js";
import { first } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { SELLING } from "../creators/policy.js";
import { requireCreator, getCreator } from "../creators/creators.js";
import { requireProject } from "../creators/projects.js";
import { rolesFor, can } from "../creators/roles.js";
import { createProduct, updateProduct } from "../creators/products.js";
import { ownedProductIds } from "../entitlements/grants.js";
import { stillUsed, purge, releaseFile } from "../sites/images.js";
import { getProject } from "../creators/creators.js";
import { KINDS, browse, getPiece, share, linkProduct, install, setStatus, report, discard } from "./pieces.js";
import { activeEntitlements } from "../entitlements/grants.js";
import { logEvent } from "../downloads/events.js";

const PIECES_PER_CREATOR = 50;
const owned = async (app, user) => new Set(await ownedProductIds(app.db, { user, guestOrderIds: [] }));

async function list(app) {
  const user = await requireUser(app);
  const url = new URL(app.request.url);
  const kind = url.searchParams.get("kind");
  const creatorId = url.searchParams.get("creatorId");
  if (creatorId) await requireCreator(app.db, creatorId, user);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  return json({ pieces: await browse(app.db, { kind: KINDS.includes(kind) ? kind : null, q, creatorId, owned: await owned(app, user) }) });
}

async function create(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "library-share", 20, 3600);
  const { creator, role } = await requireCreator(app.db, creatorId, user, rolesFor("library.share"));
  if (!creator.trusted) fail(403, "not_trusted", "Sharing opens once AutoStacc has had a look at your pages and marked you trusted.");
  const body = await readJson(app.request, 160 * 1024);
  const title = str(body.title, "title", { min: 3, max: 80 });
  const description = body.description ? str(body.description, "description", { max: 500 }) : "";
  const priceCents = body.priceCents === undefined ? 0 : int(body.priceCents, "priceCents", { min: 0, max: SELLING.maxPriceCents });
  if (priceCents && priceCents < SELLING.minPriceCents) fail(400, "invalid_field", `A price is free, or from $${SELLING.minPriceCents / 100}.`, { field: "priceCents" });
  if (priceCents && !can(role, "products")) fail(403, "forbidden", "Selling a piece needs a role that runs products.");
  const { n } = await first(app.db, "SELECT COUNT(*) AS n FROM library_pieces WHERE creator_id = ? AND status = 'active'", creator.id);
  if (n >= PIECES_PER_CREATOR) fail(409, "limit_reached", `Up to ${PIECES_PER_CREATOR} shared pieces per creator. Delete one first.`);
  const project = priceCents ? (await requireProject(app.db, str(body.projectId, "projectId", { max: 80 }), user, rolesFor("products"))).project : null;
  if (project && project.creator_id !== creator.id) fail(404, "not_found", "Nothing here.");
  const pieceId = await share(app.db, { creator, user, kind: body.kind, title, description, raw: body.piece });
  if (priceCents) {
    // Shared and on sale together, or neither: a product that can't be made or put on sale takes the piece back.
    let product = null;
    try {
      product = await createProduct(app.db, { creator, project, user, input: { title, description, type: "template", priceCents } });
      await linkProduct(app.db, pieceId, product.id, priceCents);
      await updateProduct(app.db, { product, project, creator, input: { published: true }, user });
    } catch (e) {
      await discard(app.db, pieceId);
      if (product) await updateProduct(app.db, { product, project, creator, input: { deleted: true }, user }).catch(() => {});
      throw e;
    }
  }
  return json({ piece: { id: pieceId } }, 201);
}

async function remove(app, { creatorId, pieceId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("library.share"));
  const piece = await getPiece(app.db, pieceId);
  if (!piece || piece.creator_id !== creator.id || piece.status !== "active") fail(404, "not_found", "Nothing here.");
  await setStatus(app.db, piece.id, "deleted");
  // Off sale; people who bought it keep it (and can still install it).
  if (piece.product_id) {
    const product = await first(app.db, "SELECT * FROM products WHERE id = ?", piece.product_id);
    if (product) await updateProduct(app.db, { product, project: await getProject(app.db, product.project_id), creator, input: { published: false }, user });
  }
  // Its files: still the creator's while their own sites use them; else kept for the sites that installed it (and no
  // longer counted for the creator); else deleted.
  // Only other creators' installs keep files alive (installing your own piece doesn't).
  const installs = (await first(app.db, "SELECT COUNT(*) AS n FROM library_installs WHERE piece_id = ? AND creator_id <> ?", piece.id, creator.id)).n;
  const assets = JSON.parse(piece.assets || "[]");
  for (const id of assets) {
    if (await stillUsed(app.db, creator.id, id)) continue;
    const row = await first(app.db, "SELECT r2_key FROM site_assets WHERE id = ? AND status = 'active'", id);
    if (!row) continue;
    if (installs) await releaseFile(app.db, id);
    else await purge(app, id, row.r2_key);
  }
  return json({ ok: true });
}

async function use(app, { creatorId, pieceId }) {
  const user = await requireUser(app);
  await limit(app, "library-install", 60, 600);
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("site.edit"));
  const piece = await getPiece(app.db, pieceId);
  if (!piece || piece.status === "removed") fail(404, "not_found", "This piece isn't available.");
  const seller = await getCreator(app.db, piece.creator_id);
  const mine = piece.creator_id === creator.id;
  const bought = piece.product_id && (await owned(app, user)).has(piece.product_id);
  const before = await first(app.db, "SELECT 1 FROM library_installs WHERE piece_id = ? AND creator_id = ?", piece.id, creator.id);
  if (!mine && (!seller || seller.status !== "active")) fail(404, "not_found", "This piece isn't available.");
  if (piece.status === "deleted" && !mine && !bought && !before) fail(404, "not_found", "This piece isn't available.");
  if (piece.product_id && !mine && !bought) fail(402, "buy_first", "Buy it in the AutoStacc store first, then use it here.", { productPath: `/product?p=${piece.product_id}` });
  // Using a bought piece is like downloading it: its order can't be refunded by the buyer afterwards (orders/refunds.js).
  if (piece.product_id && !mine) {
    const [ent] = await activeEntitlements(app.db, { user, guestOrderIds: [] }, piece.product_id);
    if (ent) await logEvent(app, "served", { productId: piece.product_id, entitlementId: ent.id, subject: `u:${user.id}`, reason: "library-install" });
  }
  return json(await install(app.db, piece, creator.id, user));
}

async function flag(app, { pieceId }) {
  const user = await requireUser(app);
  await limit(app, "library-report", 10, 3600);
  const piece = await getPiece(app.db, pieceId);
  if (!piece || piece.status === "removed") fail(404, "not_found", "Nothing here.");
  const reason = str((await readJson(app.request)).reason, "reason", { min: 3, max: 500 });
  await report(app.db, piece, user, reason);
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/studio/library", list],
  ["POST", "/api/studio/creators/:creatorId/library", create],
  ["DELETE", "/api/studio/creators/:creatorId/library/:pieceId", remove],
  ["POST", "/api/studio/creators/:creatorId/library/:pieceId/install", use],
  ["POST", "/api/studio/library/:pieceId/report", flag]
];

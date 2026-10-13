// Which of a ZIP's files the store already has (docs/packs.md, Phase 6; carry.js): the Pack Builder asks before it
// uploads, so a revision sends only the files that are new to this owner. The answer covers only the owner's own stored
// originals (a creator's, or AutoStacc's for its catalog), never anyone else's. Scoped like every Pack Builder route
// (access.js): 404 outside it; read-only, so nothing to audit.
//   admin:  POST /api/admin/packs/:pacId/have                  {productId, hashes}  → {known}
//   studio: POST /api/studio/packs/products/:productId/have    {hashes}             → {known}
import { json, fail, readJson, id } from "../lib/http.js";
import { first } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";
import { ADMIN, STUDIO, ownerOf } from "./access.js";
import { knownHashes } from "./carry.js";

const MAX_HASHES = 5000;
const SHA = /^[0-9a-f]{64}$/;

function hashesOf(body) {
  const h = body.hashes;
  if (!Array.isArray(h) || h.length > MAX_HASHES || !h.every((x) => typeof x === "string" && SHA.test(x))) fail(400, "invalid_hashes", "Send up to 5,000 SHA-256 hashes.");
  return h;
}

export const routes = [
  ["POST", "/api/admin/packs/:pacId/have", async (app, { pacId }) => {
    const actor = await ADMIN.actor(app);
    const pac = await first(app.db, "SELECT id FROM pacs WHERE id = ? AND deleted_at IS NULL", id(pacId, "pacId"));
    if (!pac) fail(404, "not_found", "No such Pac.");
    const body = await readJson(app.request, 512 * 1024);
    const { product } = await ADMIN.product(app, actor, body.productId, pac.id);
    return json({ known: await knownHashes(app.db, await ownerOf(app.db, product), hashesOf(body)) });
  }],
  ["POST", "/api/studio/packs/products/:productId/have", async (app, { productId }) => {
    const actor = await STUDIO.actor(app);
    await limit(app, "studio-pack-have", 60, 3600);
    const { product } = await STUDIO.product(app, actor, productId);
    const body = await readJson(app.request, 512 * 1024);
    return json({ known: await knownHashes(app.db, await ownerOf(app.db, product), hashesOf(body)) });
  }]
];

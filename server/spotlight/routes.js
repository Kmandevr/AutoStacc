// The spotlight's hand-picked items (owner, 2026-10-22): admins pick what each browse page's banner shows first (GET,
// POST and DELETE /api/admin/spotlight, audited); pages read their picks from GET /api/spotlight?page=<page> and fill
// the remaining slots themselves with a fair daily rotation of what they list (js/browse-shelves.js), so new and small
// creators get equal turns and nothing is ranked by popularity. Only ids are kept; each page shows its own data.
import { json, readJson, fail, str, id } from "../lib/http.js";
import { all, first, run, now, newId } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";

export const PAGES = { discover: ["project", "creator", "community"], store: ["product"], explore: ["release", "event"] };
const MAX = 6;

const pageOf = (raw) => {
  const page = String(raw || "");
  if (!PAGES[page]) fail(400, "invalid_field", "Unknown page.", { field: "page" });
  return page;
};
const picks = (db, page) => all(db, "SELECT id, kind, ref_id AS refId, position FROM spotlight_picks WHERE page = ? ORDER BY position, created_at", page);

async function publicPicks(app) {
  const page = pageOf(new URL(app.request.url).searchParams.get("page"));
  return json({ picks: (await picks(app.db, page)).map((p) => ({ kind: p.kind, id: p.refId })) }, 200, { "Cache-Control": "public, max-age=300" });
}

async function adminList(app) {
  await requireAdmin(app);
  const out = {};
  for (const page of Object.keys(PAGES)) out[page] = await picks(app.db, page);
  return json({ pages: PAGES, picks: out, max: MAX }, 200, { "Cache-Control": "no-store" });
}

async function adminAdd(app) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  const page = pageOf(body.page);
  const kind = String(body.kind || "");
  if (!PAGES[page].includes(kind)) fail(400, "invalid_field", "That kind doesn't belong on this page.", { field: "kind" });
  const refId = str(body.refId, "refId", { max: 120 }).trim();
  if (!/^[a-z0-9_-]+$/i.test(refId)) fail(400, "invalid_field", "Paste the item's id.", { field: "refId" });
  const count = await first(app.db, "SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS top FROM spotlight_picks WHERE page = ?", page);
  if (count.n >= MAX) fail(409, "full", `A page shows at most ${MAX} picks. Remove one first.`);
  const pickId = newId("spk");
  try {
    await run(app.db, "INSERT INTO spotlight_picks (id, page, kind, ref_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)", pickId, page, kind, refId, count.top + 1, now());
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) fail(409, "already_picked", "That's already in this page's spotlight.");
    throw e;
  }
  await audit(app, "spotlight.add", { targetType: kind, targetId: refId, detail: { page } });
  return json({ id: pickId }, 201);
}

async function adminRemove(app, { pickId }) {
  await requireAdmin(app);
  const pick = await first(app.db, "SELECT * FROM spotlight_picks WHERE id = ?", id(pickId, "pickId"));
  if (!pick) fail(404, "not_found", "Not found.");
  await run(app.db, "DELETE FROM spotlight_picks WHERE id = ?", pick.id);
  await audit(app, "spotlight.remove", { targetType: pick.kind, targetId: pick.ref_id, detail: { page: pick.page } });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/spotlight", publicPicks],
  ["GET", "/api/admin/spotlight", adminList],
  ["POST", "/api/admin/spotlight", adminAdd],
  ["DELETE", "/api/admin/spotlight/:pickId", adminRemove]
];

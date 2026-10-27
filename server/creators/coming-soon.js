// Coming soon products (owner, 2026-10-27, #218; docs/studio.md, "Coming soon"): a creator announces an unpublished
// product with the day it goes on sale. Announcing needs what a buyer will see to be right (a title, an allowed price,
// an active creator), not the files yet. On the day (UTC) the daily sweep publishes it through the same readiness
// check as the Studio's Release; if something blocks it, it stays Coming soon and the creator's owner is emailed once
// for that day. It's never published by the browser, and never sold while Coming soon (it isn't published).
import { all, first, run, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { getProject, getCreator } from "./creators.js";
import { loadReadiness } from "./readiness.js";
import { recordEvent } from "./events.js";
import { sendEmail } from "../email/index.js";

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_DAYS = 366;
export const today = (nowMs = Date.now()) => new Date(nowMs).toISOString().slice(0, 10);

// comingSoonOn: "YYYY-MM-DD" (tomorrow up to a year ahead), or null to take it back to a plain draft.
export function cleanComingSoon(v, nowMs = Date.now()) {
  if (v === null) return null;
  if (typeof v !== "string" || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    fail(400, "invalid_field", "Pick the day it goes on sale.", { field: "comingSoonOn" });
  }
  const days = (Date.parse(`${v}T00:00:00Z`) - Date.parse(`${today(nowMs)}T00:00:00Z`)) / 86400000;
  if (days < 1 || days > MAX_DAYS) fail(400, "invalid_field", "Pick a day from tomorrow up to a year ahead.", { field: "comingSoonOn" });
  return v;
}

// What must be right before people see the page: everything but the files (those can come before the day).
const FILE_ITEMS = new Set(["needs_file", "pac_in_review", "needs_piece"]);
export async function requireAnnounceable(db, product, creator, input) {
  if (product.published && input.published !== false) fail(409, "already_on_sale", "This is on sale already.");
  const overrides = {};
  if (input.title !== undefined) overrides.title = input.title;
  if (input.priceCents !== undefined) overrides.price_cents = input.priceCents;
  const blocking = (await loadReadiness(db, product, creator, overrides)).blocking.filter((b) => !FILE_ITEMS.has(b.code));
  if (blocking.length) fail(409, "not_ready", blocking[0].message, { blocking });
}

const ownerEmail = async (db, creatorId) => (await first(db,
  `SELECT u.email FROM creator_members m JOIN "user" u ON u.id = m.user_id WHERE m.creator_id = ? AND m.role = 'owner'`, creatorId) || {}).email || null;

// The sweep's part: products whose day has come. Bounded per run; the rest wait for the next day.
export async function releaseComingSoon(app, { nowMs = Date.now() } = {}) {
  const day = today(nowMs);
  const due = await all(app.db, `SELECT * FROM products WHERE coming_soon_on IS NOT NULL AND coming_soon_on <= ? AND published = 0
    AND deleted_at IS NULL AND source = 'studio' ORDER BY coming_soon_on LIMIT 100`, day);
  let released = 0, waiting = 0;
  for (const p of due) {
    const project = p.project_id ? await getProject(app.db, p.project_id) : null;
    const creator = project ? await getCreator(app.db, project.creator_id) : null;
    const { blocking } = await loadReadiness(app.db, p, creator);
    if (creator && !blocking.length) {
      // Compare-and-set: only a product still Coming soon and unpublished goes on sale, once.
      const r = await run(app.db, "UPDATE products SET published = 1, coming_soon_on = NULL, updated_at = ? WHERE id = ? AND published = 0 AND coming_soon_on = ?", now(), p.id, p.coming_soon_on);
      if (r.meta.changes) { released++; await recordEvent(app.db, { productId: p.id, kind: "published", actorId: null, detail: { comingSoon: p.coming_soon_on } }); }
      continue;
    }
    waiting++;
    const to = creator && await ownerEmail(app.db, creator.id);
    if (to) {
      await sendEmail(app, "coming-soon-blocked", to, { title: p.title, day: p.coming_soon_on, reasons: blocking.map((b) => b.message).slice(0, 5),
        studioUrl: `${app.config.siteUrl}/studio` }, { dedupeKey: `coming-soon-blocked:${p.id}:${p.coming_soon_on}` });
    }
  }
  return { released, waiting };
}

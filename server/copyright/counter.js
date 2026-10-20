// Counter-notices (docs/copyright.md, step 3): the account whose upload an accepted notice took down (or, when no
// uploader was named, the creator space's owner) can answer once, signed in, with their details, the statements the
// law asks for and a signature matching their name. AutoStacc passes it to the claimant (the law requires it) and,
// unless the claimant says within 11 US business days (business-days.js) that they've gone to court (an admin notes "sued"), the daily sweep puts
// the content back and the notice's strikes end as countered (sweep.js). Others find nothing here.
import { json, readJson, fail, id, str, email as readEmail } from "../lib/http.js";
import { first, stmt, now, newId, guardStmt, isGuardFailure } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { sendEmail } from "../email/index.js";
import { alertAdmins } from "../email/alerts.js";
import { roleOf } from "../creators/creators.js";
import { targetsOf } from "./takedown.js";
import { afterBusinessDays } from "./business-days.js";

const NO_STORE = { "Cache-Control": "no-store" };
const fold = (s) => String(s).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// The notice, if this account may answer it.
async function answerable(app, user, noticeId) {
  const n = await first(app.db, "SELECT * FROM copyright_notices WHERE id = ? AND status = 'accepted'", noticeId);
  const mine = n && (n.uploader_user_id ? n.uploader_user_id === user.id : n.creator_id && (await roleOf(app.db, n.creator_id, user.id)) === "owner");
  if (!mine) fail(404, "not_found", "There's no copyright notice of yours there.");
  return n;
}

async function show(app, { noticeId }) {
  const user = await requireUser(app);
  const n = await answerable(app, user, id(noticeId, "noticeId"));
  const [targets, counter] = await Promise.all([targetsOf(app.db, [n.id]), first(app.db, "SELECT status, restore_after, created_at FROM copyright_counter_notices WHERE notice_id = ?", n.id)]);
  return json({ notice: { id: n.id, work: n.work, location: n.location, decidedAt: n.decided_at,
    takenDown: targets.map((t) => ({ kind: t.kind, removedAt: t.removed_at, restoredAt: t.restored_at })) },
  counter: counter && { status: counter.status, restoreAfter: counter.restore_after, sentAt: counter.created_at } }, 200, NO_STORE);
}

async function send(app, { noticeId }) {
  const user = await requireUser(app);
  await limit(app, "copyright-counter", 5, 3600, { by: user.id });
  const n = await answerable(app, user, id(noticeId, "noticeId"));
  const body = await readJson(app.request, 8 * 1024);
  const name = str(body.name, "name", { min: 2, max: 200 }).trim();
  const email = readEmail(body.email, "email");
  const address = str(body.address, "address", { min: 5, max: 500 }).trim();
  if (body.mistake !== true || body.jurisdiction !== true) fail(400, "statements_required", "A counter-notice needs both statements.", { field: "mistake" });
  const signature = str(body.signature, "signature", { min: 2, max: 200 }).trim();
  if (!fold(name) || fold(signature) !== fold(name)) fail(400, "signature_mismatch", "Type your full name as the signature, the same as above.", { field: "signature" });
  const at = now();
  const restoreAfter = afterBusinessDays(Date.now());
  try {
    await app.db.batch([
      guardStmt(app.db, "NOT EXISTS (SELECT 1 FROM copyright_counter_notices WHERE notice_id = ?)", n.id),
      stmt(app.db, `INSERT INTO copyright_counter_notices (id, notice_id, user_id, name, email, address, statements_at, signature, restore_after, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, newId("cpc"), n.id, user.id, name, email, address, at, signature, restoreAfter, at)
    ]);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "already_sent", "A counter-notice for this was already sent.");
    throw e;
  }
  try {
    // Nothing comes back until the claimant has been sent this (the sweep waits for claimant_told_at).
    const told = await sendEmail(app, "copyright-counter-notice", n.claimant_email, { name, address, email, restoreAfter: restoreAfter.slice(0, 10) }, { dedupeKey: `copyright-counter:${n.id}` });
    if (told.status !== "failed") await app.db.prepare("UPDATE copyright_counter_notices SET claimant_told_at = ? WHERE notice_id = ?").bind(now(), n.id).run();
    await alertAdmins(app, { key: `copyright-counter:${n.id}`, title: "a copyright counter-notice arrived",
      lines: [`A counter-notice answers notice ${n.id}. The content comes back on ${restoreAfter.slice(0, 10)} unless the claimant says they've gone to court (mark it in Daily › Copyright).`] });
  } catch (e) { console.error("copyright counter emails", e && e.message); }
  return json({ ok: true, restoreAfter }, 201);
}

// The claimant told AutoStacc they've filed a court action: the content stays down (admin, Daily › Copyright).
export async function noteSued(db, admin, noticeId, note) {
  const r = await db.prepare("UPDATE copyright_counter_notices SET status = 'sued', decided_by = ?, decided_at = ? WHERE notice_id = ? AND status = 'waiting'")
    .bind(admin.id, now(), noticeId).run();
  if (!r.meta.changes) fail(409, "changed", "There's no counter-notice waiting on that notice.");
  return note;
}

export const counterRoutes = [
  ["GET", "/api/copyright/notices/:noticeId/mine", show],
  ["POST", "/api/copyright/notices/:noticeId/counter", send]
];

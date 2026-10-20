// Copyright in the Control Center (docs/admin.md, "Copyright"): the latest notices with their strikes, recording a
// notice that came by email, accepting it (giving strikes) or rejecting it, withdrawing an accepted one, and holds
// that keep an account or creator space at the top level. Admins only (others find nothing), audited without the
// claimant's or anyone's email. The public form's route is filing.js.
import { json, readJson, fail, id, str, email as readEmail } from "../lib/http.js";
import { run, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { USER_ID } from "../impersonation/routes.js";
import { recordNotice, acceptNotice, rejectNotice, withdrawNotice, latestNotices } from "./notices.js";
import { accountLevel, creatorLevel } from "./standing.js";
import { filingRoutes } from "./filing.js";

const NO_STORE = { "Cache-Control": "no-store" };
const userId = (v, name) => (v === undefined || v === null || v === "" ? null : str(v, name, { max: 64, pattern: USER_ID }));
const note = (body, required) => {
  const n = body.note === undefined || body.note === null ? "" : str(body.note, "note", { max: 500 }).trim();
  if (required && n.length < 3) fail(400, "note_required", "Add a short note: it's kept with the decision.", { field: "note" });
  return n;
};

async function show(app) {
  await requireAdmin(app);
  return json({ notices: await latestNotices(app.db) }, 200, NO_STORE);
}

async function record(app) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 16 * 1024);
  const noticeId = await recordNotice(app.db, admin, {
    claimantName: str(body.claimantName, "claimantName", { min: 2, max: 200 }).trim(),
    claimantEmail: readEmail(body.claimantEmail, "claimantEmail"),
    claimantAddress: body.claimantAddress ? str(body.claimantAddress, "claimantAddress", { max: 500 }).trim() : "",
    work: str(body.work, "work", { min: 3, max: 4000 }).trim(),
    location: str(body.location, "location", { min: 3, max: 4000 }).trim(),
    statementsAt: body.statements === true ? now() : fail(400, "statements_required", "A notice needs the good-faith and accuracy statements.", { field: "statements" })
  });
  await audit(app, "copyright.notice_recorded", { targetType: "copyright_notice", targetId: noticeId });
  return json({ id: noticeId }, 201);
}

async function decide(app, { noticeId }) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 4096);
  const nid = id(noticeId, "noticeId");
  if (body.outcome === "accepted") {
    const creatorId = body.creatorId ? id(body.creatorId, "creatorId") : null;
    const uploaderId = userId(body.uploaderId, "uploaderId");
    await acceptNotice(app.db, admin, nid, { creatorId, uploaderId, note: note(body, false) });
    await audit(app, "copyright.notice_accepted", { targetType: "copyright_notice", targetId: nid, subjectUserId: uploaderId || undefined, detail: { creatorId } });
  } else if (body.outcome === "rejected") {
    await rejectNotice(app.db, admin, nid, note(body, true));
    await audit(app, "copyright.notice_rejected", { targetType: "copyright_notice", targetId: nid });
  } else if (body.outcome === "withdrawn") {
    await withdrawNotice(app.db, admin, nid, note(body, true));
    await audit(app, "copyright.notice_withdrawn", { targetType: "copyright_notice", targetId: nid });
  } else {
    fail(400, "invalid_field", "Accept, reject or withdraw.", { field: "outcome" });
  }
  return json({ notices: await latestNotices(app.db) });
}

const subjectOf = (body) => {
  if (body.subject === "account") return { subject: "account", subjectId: userId(body.subjectId, "subjectId") || fail(400, "invalid_field", "Which account?", { field: "subjectId" }) };
  if (body.subject === "creator") return { subject: "creator", subjectId: id(body.subjectId, "subjectId") };
  return fail(400, "invalid_field", "An account or a creator space.", { field: "subject" });
};

const hold = (on) => async (app) => {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 2048);
  const { subject, subjectId } = subjectOf(body);
  if (on) {
    await run(app.db, `INSERT INTO copyright_holds (subject, subject_id, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (subject, subject_id) DO UPDATE SET reason = excluded.reason, created_by = excluded.created_by, created_at = excluded.created_at`,
    subject, subjectId, note(body, true), admin.id, now());
  } else if (!(await run(app.db, "DELETE FROM copyright_holds WHERE subject = ? AND subject_id = ?", subject, subjectId)).meta.changes) {
    fail(404, "not_found", "There's no hold on that.");
  }
  await audit(app, on ? "copyright.hold_set" : "copyright.hold_lifted", { targetType: subject, targetId: subjectId, subjectUserId: subject === "account" ? subjectId : undefined });
  return json({ standing: subject === "account" ? await accountLevel(app.db, subjectId) : await creatorLevel(app.db, subjectId) });
};

export const routes = [
  ...filingRoutes,
  ["GET", "/api/admin/copyright", show],
  ["POST", "/api/admin/copyright/notices", record],
  ["POST", "/api/admin/copyright/notices/:noticeId", decide],
  ["PUT", "/api/admin/copyright/holds", hold(true)],
  ["DELETE", "/api/admin/copyright/holds", hold(false)]
];

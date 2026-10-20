// The public copyright notice form (copyright-notice.html; docs/copyright.md; owner, 2026-10-20): anyone can send a
// notice, with what the law asks of one (who they are and how to reach them, the work, where it is on AutoStacc,
// the good-faith and accuracy statements, and a typed signature matching their name). It lands in the Control
// Center as "received" for an admin to accept or reject, and the admins get one email an hour at most. The answer
// is the same whatever the notice names, so the form can't be used to probe what exists or who uploaded it. Limits:
// 5 an hour per address, 10 a day per claimant email, 200 a day in all; a filled-in hidden field is quietly ignored.
import { json, readJson, fail, str, email as readEmail } from "../lib/http.js";
import { now, newId } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";
import { alertAdmins } from "../email/alerts.js";

const MAX_LOCATIONS = 20;
const fold = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function file(app) {
  await limit(app, "copyright-notice", 5, 3600);
  await limit(app, "copyright-notice-all", 200, 86400, { by: "everyone" });
  const body = await readJson(app.request, 16 * 1024);
  const accepted = json({ ok: true }, 202);
  if (body.website) return accepted;
  const claimantName = str(body.claimantName, "claimantName", { min: 2, max: 200 }).trim();
  const claimantEmail = readEmail(body.claimantEmail, "claimantEmail");
  await limit(app, "copyright-notice-email", 10, 86400, { by: claimantEmail });
  const claimantAddress = str(body.claimantAddress, "claimantAddress", { min: 5, max: 500 }).trim();
  const role = body.role === "agent" ? "agent" : body.role === "owner" ? "owner" : fail(400, "invalid_field", "Say whether you own the work or act for the owner.", { field: "role" });
  const work = str(body.work, "work", { min: 3, max: 4000 }).trim();
  const location = str(body.location, "location", { min: 3, max: 4000 }).trim();
  if (location.split("\n").filter((l) => l.trim()).length > MAX_LOCATIONS) fail(400, "too_many_locations", `Name up to ${MAX_LOCATIONS} places in one notice; send another for the rest.`, { field: "location" });
  if (body.goodFaith !== true || body.accurate !== true) fail(400, "statements_required", "A notice needs both statements.", { field: "goodFaith" });
  const signature = str(body.signature, "signature", { min: 2, max: 200 }).trim();
  if (fold(signature) !== fold(claimantName)) fail(400, "signature_mismatch", "Type your full name as the signature, the same as above.", { field: "signature" });
  const at = now();
  await app.db.prepare(`INSERT INTO copyright_notices (id, source, claimant_name, claimant_email, claimant_address, claimant_role, work, location, statements_at, signature, created_at)
    VALUES (?, 'form', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId("cpn"), claimantName, claimantEmail, claimantAddress, role, work, location, at, signature, at).run();
  const alert = alertAdmins(app, { key: `copyright-notice:${at.slice(0, 13)}`, title: "a copyright notice is waiting",
    lines: ["Someone sent a copyright notice through the form. It's waiting in Daily › Copyright to be accepted or rejected."] }).catch((e) => console.error("copyright alert", e));
  if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(alert); else await alert;
  return accepted;
}

export const filingRoutes = [["POST", "/api/copyright/notices", file]];

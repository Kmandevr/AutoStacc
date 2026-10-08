// Secure downloads. POST /api/downloads issues a 5-minute link for one file the requester owns; GET
// /api/downloads/<token> checks the link, the requester and the entitlement again, then streams the private file.
// Unknown, unowned, unpublished-and-unowned and revoked all fail the same way.
import { json, fail, readJson, str } from "../lib/http.js";
import { run, newId, now } from "../lib/db.js";
import { resolveAccess, requireAccess, subjectsOf } from "../entitlements/access.js";
import { activeEntitlements, usableEntitlement } from "../entitlements/grants.js";
import { signDownload, readDownload } from "./tokens.js";
import { impersonationIdOf } from "../auth/session.js";
import { getFile, safeFilename } from "../storage/buckets.js";
import { limit } from "../lib/ratelimit.js";
import { getDeliverableFile as getActiveFile } from "../files/files.js";

// impersonation_id marks downloads an admin made while impersonating, so they never count as the customer's.
const logEvent = (app, event, f) =>
  run(app.db, `INSERT INTO download_events (id, event, product_id, file_id, entitlement_id, subject, reason, created_at, impersonation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("dl"), event, f.productId || null, f.fileId || null, f.entitlementId || null, f.subject || null, f.reason || null, now(), impersonationIdOf(app));


// Which of the requester's identities an entitlement belongs to (accounts first).
function subjectFor(access, ent) {
  if (access.user && (ent.user_id === access.user.id || (!ent.user_id && ent.email === String(access.user.email).toLowerCase()))) return `u:${access.user.id}`;
  if (ent.source_type === "purchase" && access.guestOrderIds.includes(ent.source_id)) return `g:${ent.source_id}`;
  return null;
}

async function issue(app) {
  await limit(app, "download", 40, 60);
  const access = await requireAccess(app);
  const body = await readJson(app.request);
  const fileId = str(body.fileId, "fileId", { max: 40, pattern: /^pf_[a-z2-7]+$/ });
  const file = await getActiveFile(app.db, fileId);
  const ents = file ? await activeEntitlements(app.db, access, file.product_id) : [];
  const ent = ents.find((e) => subjectFor(access, e));
  if (!file || !ent) {
    await logEvent(app, "denied", { fileId, productId: file && file.product_id, reason: "no entitlement", subject: subjectsOf(access)[0] });
    fail(403, "download_denied", "You don't own that file.");
  }
  const subject = subjectFor(access, ent);
  const { token, expiresAt } = await signDownload(app.config.downloadSecret, { fileId, entitlementId: ent.id, subject, ttlSeconds: app.config.downloadTtlSeconds });
  await logEvent(app, "issued", { fileId, productId: file.product_id, entitlementId: ent.id, subject });
  return json({ url: `/api/downloads/${token}`, expiresAt, filename: file.filename });
}

// A browser navigates here, so failures redirect to the library with a reason instead of showing JSON.
const back = (reason) => new Response(null, { status: 303, headers: { Location: `/library?download=${reason}`, "Cache-Control": "no-store" } });

async function redeem(app, { token }) {
  await limit(app, "download-get", 60, 60);
  const { payload, error } = await readDownload(app.config.downloadSecret, token);
  if (error) {
    await logEvent(app, "denied", { reason: error, fileId: payload && payload.f });
    return back(error === "expired" ? "expired" : "denied");
  }
  const access = await resolveAccess(app);
  const deny = async (reason) => {
    await logEvent(app, "denied", { reason, fileId: payload.f, entitlementId: payload.e, subject: payload.s });
    return back("denied");
  };
  // The link only works for the person it was issued to (copying it to someone else doesn't help them).
  if (!subjectsOf(access).includes(payload.s)) return deny("subject mismatch");
  const ent = await usableEntitlement(app.db, access, payload.e);
  if (!ent) return deny("entitlement inactive");
  const file = await getActiveFile(app.db, payload.f);
  if (!file || file.product_id !== ent.product_id) return deny("file mismatch");
  const object = await getFile(app.env, file.r2_key);
  if (!object) return deny("file missing from storage");
  await logEvent(app, "served", { fileId: file.id, productId: file.product_id, entitlementId: ent.id, subject: payload.s });
  const name = safeFilename(file.filename);
  return new Response(object.body, {
    headers: {
      "Content-Type": file.content_type || "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer"
    }
  });
}

export const routes = [
  // Allowed while impersonating (to check what a customer can download), and audited, including the file being served.
  ["POST", "/api/downloads", issue, { impersonation: "allow" }],
  ["GET", "/api/downloads/:token", redeem, { auditReads: true }]
];

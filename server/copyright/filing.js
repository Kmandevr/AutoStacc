// The public copyright notice form (copyright-notice.html; docs/copyright.md; owner, 2026-10-20): anyone can send a
// notice, with what the law asks of one (who they are and how to reach them, the work, where it is on AutoStacc,
// the good-faith and accuracy statements, and a typed signature matching their name). It lands in the Control
// Center as "received" for an admin to accept or reject, and the admins get one email an hour at most. The answer
// is the same whatever the notice names, so the form can't be used to probe what exists or who uploaded it. Limits:
// 5 an hour per network (an IPv4 address or an IPv6 /64), 10 complete notices a day per claimant email; past 200 in
// a day the notices are still kept but the admins' email waits. A filled-in hidden field is quietly ignored.
import { json, readJson, fail, str, email as readEmail } from "../lib/http.js";
import { now, newId } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";
import { alertAdmins } from "../email/alerts.js";

const MAX_LOCATIONS = 20;
const DAILY_ALERTS_AFTER = 200;
// Signatures match names in any script: accents and marks off, letters and digits in any alphabet kept.
const fold = (s) => String(s).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const LINES = /\r\n|[\n\r\u2028\u2029]/;

// The sender's network for counting: an IPv4 address, or an IPv6 address's /64 (one home or server gets a whole
// /64, so counting single IPv6 addresses would let one sender look like millions; security review).
export function network(ip) {
  if (!ip || !ip.includes(":")) return ip || "unknown";
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return `${full.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

const tooMany = () => fail(429, "rate_limited", "Too many notices from here for now. Try again later, or email the address on the copyright page.");
const counted = (app, name, max, seconds, by) => limit(app, name, max, seconds, { by }).then(() => true, (e) => (e && e.status === 429 ? false : Promise.reject(e)));

async function file(app) {
  if (!(await counted(app, "copyright-notice", 5, 3600, network(app.request.headers.get("cf-connecting-ip"))))) tooMany();
  const body = await readJson(app.request, 16 * 1024);
  const accepted = json({ ok: true }, 202);
  if (body.website) return accepted;
  const claimantName = str(body.claimantName, "claimantName", { min: 2, max: 200 }).trim();
  const claimantEmail = readEmail(body.claimantEmail, "claimantEmail");
  const claimantAddress = str(body.claimantAddress, "claimantAddress", { min: 5, max: 500 }).trim();
  const role = body.role === "agent" ? "agent" : body.role === "owner" ? "owner" : fail(400, "invalid_field", "Say whether you own the work or act for the owner.", { field: "role" });
  const work = str(body.work, "work", { min: 3, max: 4000 }).trim();
  const location = str(body.location, "location", { min: 3, max: 4000 }).trim();
  if (location.split(LINES).filter((l) => l.trim()).length > MAX_LOCATIONS) fail(400, "too_many_locations", `Name up to ${MAX_LOCATIONS} places in one notice; send another for the rest.`, { field: "location" });
  if (body.goodFaith !== true || body.accurate !== true) fail(400, "statements_required", "A notice needs both statements.", { field: "goodFaith" });
  const signature = str(body.signature, "signature", { min: 2, max: 200 }).trim();
  if (!fold(claimantName) || fold(signature) !== fold(claimantName)) fail(400, "signature_mismatch", "Type your full name as the signature, the same as above.", { field: "signature" });
  // Counted only for notices that are complete, so nobody can use up a claimant's or everyone's allowance with junk.
  if (!(await counted(app, "copyright-notice-email", 10, 86400, claimantEmail))) tooMany();
  const quiet = !(await counted(app, "copyright-notice-all", DAILY_ALERTS_AFTER, 86400, "everyone"));
  const at = now();
  await app.db.prepare(`INSERT INTO copyright_notices (id, source, claimant_name, claimant_email, claimant_address, claimant_role, work, location, statements_at, signature, created_at)
    VALUES (?, 'form', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId("cpn"), claimantName, claimantEmail, claimantAddress, role, work, location, at, signature, at).run();
  // Past 200 in a day the notices are still kept and listed; only the admins' email waits for the next day.
  if (!quiet) {
    const alert = alertAdmins(app, { key: `copyright-notice:${at.slice(0, 13)}`, title: "a copyright notice is waiting",
      lines: ["Someone sent a copyright notice through the form. It's waiting in Daily › Copyright to be accepted or rejected."] }).catch((e) => console.error("copyright alert", e));
    if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(alert); else await alert;
  }
  return accepted;
}

export const filingRoutes = [["POST", "/api/copyright/notices", file]];

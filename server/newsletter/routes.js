// Newsletter sign-up, per project, double opt-in. POST /api/newsletter { email, project } mails a signed 7-day link
// (whether or not the address is known, the answer is the same; 5 per 10 minutes per client, 3 per 6 hours per address); GET /api/newsletter/confirm?t=... adds the address to
// the project's Brevo list (config.newsletterLists) and goes back to the project's page. Nothing is stored here: the
// list lives in Brevo. Only first-party projects with a list have a sign-up (Studio projects aren't trusted by default).
import { json, fail, readJson, email as emailOf, id } from "../lib/http.js";
import { sha256 } from "../lib/crypto.js";
import { signToken, readToken } from "../lib/signed.js";
import { first } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";
import { sendEmail } from "../email/index.js";
import { addContact } from "../email/contacts.js";

const TTL_SECONDS = 7 * 24 * 3600;

// The list for a project: production needs one set; local development and tests treat every project as open.
const listFor = (config, projectId) => config.newsletterLists.get(projectId) ?? (config.devLike ? 0 : null);

// A first-party, visible project and the address of its home page.
const projectOf = (db, projectId) => first(db,
  `SELECT p.id, p.name, p.slug, c.slug AS creator FROM projects p LEFT JOIN creators c ON c.id = p.creator_id
   WHERE p.id = ? AND p.source = 'catalog' AND p.published = 1 AND p.deleted_at IS NULL`, projectId);
const homeOf = (p) => (p && p.creator && p.slug ? `/${p.creator}/${p.slug}` : "/");

async function subscribe(app) {
  await limit(app, "newsletter", 5, 600);
  const body = await readJson(app.request);
  const address = emailOf(body.email);
  // Per address too (by its hash, never the address), so many clients can't flood one inbox.
  await limit(app, `newsletter-to:${(await sha256(address)).slice(0, 32)}`, 3, 6 * 3600);
  const project = await projectOf(app.db, id(body.project, "project"));
  if (!project) fail(404, "not_found", "No project with that id.");
  if (listFor(app.config, project.id) === null) fail(503, "newsletter_off", "The mailing list isn't open yet.");
  const t = await signToken(app.config.downloadSecret, "nl1", { e: address, p: project.id, x: Math.floor(Date.now() / 1000) + TTL_SECONDS });
  await sendEmail(app, "newsletter-confirm", address, { url: `${app.config.siteUrl}/api/newsletter/confirm?t=${encodeURIComponent(t)}`, project: project.name });
  return json({ ok: true });
}

async function confirm(app) {
  const back = (path, result) => new Response(null, { status: 303, headers: { Location: `${path}?newsletter=${result}#newsletter`, "Cache-Control": "no-store" } });
  const read = await readToken(app.config.downloadSecret, "nl1", new URL(app.request.url).searchParams.get("t"));
  const payload = read && (read.expired ? read.payload : read);
  if (!payload || typeof payload.e !== "string" || typeof payload.p !== "string") return back("/", "invalid");
  const project = await projectOf(app.db, payload.p);
  const listId = project ? listFor(app.config, project.id) : null;
  if (listId === null) return back(homeOf(project), "invalid");
  if (read.expired) return back(homeOf(project), "expired");
  try {
    await addContact(app.config, payload.e, listId);
  } catch (e) {
    console.error("newsletter", e.message);
    return back(homeOf(project), "error");
  }
  return back(homeOf(project), "confirmed");
}

export const routes = [
  ["POST", "/api/newsletter", subscribe],
  ["GET", "/api/newsletter/confirm", confirm]
];

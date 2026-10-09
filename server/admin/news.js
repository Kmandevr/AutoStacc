// Admin, AutoStacc news: the owner writes a news email and sends it to every verified account that switched "AutoStacc
// news" on (Settings › Emails). Sending works in batches, so a Worker never runs past its limits: each call mails up to
// BATCH more and says how many are left; the page keeps calling until none are. Each address gets an issue once
// (dedupe key from the issue's text), so a retried or doubled call never mails anyone twice. A test goes only to the
// admin. Every send is audited. Also: announcing a new product to its project's followers (below).
import { json, readJson, str, fail } from "../lib/http.js";
import { all, first } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { sha256 } from "../lib/crypto.js";
import { sendEmail } from "../email/index.js";
import { productPath } from "../catalog/products.js";

const BATCH = 25;
const SUBSCRIBED = `FROM email_preferences p JOIN "user" u ON u.id = p.user_id WHERE p.platform_news = 1 AND u."emailVerified" = 1`;

async function overview(app) {
  await requireAdmin(app);
  const row = await first(app.db, `SELECT COUNT(*) AS n ${SUBSCRIBED}`);
  return json({ subscribers: row.n, brevoList: app.config.newsListId });
}

async function send(app) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 32 * 1024);
  const subject = str(body.subject, "subject", { min: 3, max: 120 }).trim();
  const text = str(body.body, "body", { min: 10, max: 20000 }).trim();
  const data = { subject, body: text, settingsUrl: `${app.config.siteUrl}/settings/email` };
  if (body.test === true) {
    await sendEmail(app, "platform-news", admin.email, data);
    return json({ ok: true, test: true, to: admin.email });
  }
  const issue = (await sha256(`${subject}\n${text}`)).slice(0, 16);
  const key = (email) => `platform-news:${issue}:${email}`;
  const batch = await all(app.db,
    `SELECT u.email ${SUBSCRIBED} AND NOT EXISTS (SELECT 1 FROM email_events e WHERE e.dedupe_key = 'platform-news:' || ? || ':' || u.email AND e.status <> 'failed')
     ORDER BY u.id LIMIT ?`, issue, BATCH);
  for (const { email } of batch) await sendEmail(app, "platform-news", email, data, { dedupeKey: key(email) });
  const left = await first(app.db,
    `SELECT COUNT(*) AS n ${SUBSCRIBED} AND NOT EXISTS (SELECT 1 FROM email_events e WHERE e.dedupe_key = 'platform-news:' || ? || ':' || u.email AND e.status <> 'failed')`, issue);
  if (batch.length) await audit(app, "news.sent", { targetType: "news", targetId: issue, detail: { subject, sent: batch.length } });
  // Failed sends stay "left"; the page stops when a batch sends nothing new, so a Brevo outage can't loop forever.
  return json({ ok: true, issue, sent: batch.length, left: left.n });
}


// New release: tells the followers of a published product's project who switched new-release emails on. Same batching
// and once-per-person guarantee as the news.
const FOLLOWERS = `FROM follows f JOIN email_preferences p ON p.user_id = f.user_id JOIN "user" u ON u.id = f.user_id
  WHERE f.project_id = ? AND p.new_releases = 1 AND u."emailVerified" = 1`;

async function announce(app, { productId }) {
  await requireAdmin(app);
  const p = await first(app.db, `SELECT p.*, j.name AS project_name FROM products p JOIN projects j ON j.id = p.project_id
    WHERE p.id = ? AND p.published = 1 AND p.deleted_at IS NULL`, String(productId).slice(0, 80));
  if (!p) fail(404, "not_found", "Only a published product can be announced.");
  const pending = `AND NOT EXISTS (SELECT 1 FROM email_events e WHERE e.dedupe_key = 'new-release:' || ? || ':' || u.email AND e.status <> 'failed')`;
  const batch = await all(app.db, `SELECT u.email ${FOLLOWERS} ${pending} ORDER BY u.id LIMIT ?`, p.project_id, p.id, BATCH);
  const data = { project: p.project_name, title: p.title, description: p.description || "", url: `${app.config.siteUrl}${productPath(p)}`,
    settingsUrl: `${app.config.siteUrl}/settings/email` };
  for (const { email } of batch) await sendEmail(app, "new-release", email, data, { dedupeKey: `new-release:${p.id}:${email}` });
  const left = await first(app.db, `SELECT COUNT(*) AS n ${FOLLOWERS} ${pending}`, p.project_id, p.id);
  if (batch.length) await audit(app, "product.announced", { targetType: "product", targetId: p.id, detail: { sent: batch.length } });
  return json({ ok: true, sent: batch.length, left: left.n });
}

export const routes = [
  ["GET", "/api/admin/news", overview],
  ["POST", "/api/admin/news", send],
  ["POST", "/api/admin/products/:productId/announce", announce]
];

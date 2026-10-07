// sendEmail: render a template, send it through the configured provider and record it in email_events.
// A dedupe key makes a send happen once (a replayed webhook never mails twice). Failures are recorded, never thrown,
// so a mail outage can't fail a payment; an admin can resend later.
import { render } from "./templates.js";
import { providers } from "./providers.js";
import { first, run, newId, now } from "../lib/db.js";

export async function sendEmail(app, kind, to, data, { dedupeKey } = {}) {
  const { config, db } = app;
  const key = dedupeKey || null;
  if (key) {
    const prior = await first(db, "SELECT status FROM email_events WHERE dedupe_key = ?", key);
    if (prior && prior.status !== "failed") return { status: "duplicate" };
  }
  const msg = { from: config.emailFrom, to, tags: [kind], ...render(kind, data) };
  let status = config.emailProvider === "log" ? "logged" : "sent";
  let providerId = "", error = null;
  try {
    ({ id: providerId } = await providers[config.emailProvider](config, msg));
  } catch (e) {
    status = "failed";
    error = String(e.message || e).slice(0, 300);
  }
  // Message bodies are only kept for the local "log" provider (they can hold one-time links).
  const body = config.emailProvider === "log" ? msg.text : null;
  await run(db,
    `INSERT INTO email_events (id, kind, to_email, provider, provider_message_id, status, dedupe_key, subject, body_text, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(dedupe_key) DO UPDATE SET status = excluded.status, provider_message_id = excluded.provider_message_id,
       error = excluded.error, created_at = excluded.created_at`,
    newId("em"), kind, to, config.emailProvider, providerId, status, key, msg.subject, body, error, now());
  return { status };
}

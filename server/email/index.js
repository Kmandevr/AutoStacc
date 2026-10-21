// sendEmail: render a template, send it through the configured provider and record it in email_events.
// A dedupe key makes a send happen once (a replayed webhook never mails twice). Failures are recorded, never thrown,
// so a mail outage can't fail a payment; an admin can resend later.
import { render, senderOf } from "./templates.js";
import { providers } from "./providers.js";
import { all, first, run, stmt, newId, now } from "../lib/db.js";

const CLAIM_MS = 5 * 60 * 1000;

export async function sendEmail(app, kind, to, data, { dedupeKey } = {}) {
  const { config, db } = app;
  const key = dedupeKey || null;
  if (key) {
    const prior = await first(db, "SELECT status FROM email_events WHERE dedupe_key = ?", key);
    if (prior && prior.status !== "failed") return { status: "duplicate" };
    // Claim the key before sending: whoever's insert (or takeover of a stale claim) changes the row sends, the other stops.
    const claim = await run(db, `INSERT INTO email_claims (dedupe_key, claimed_at) VALUES (?1, ?2)
      ON CONFLICT(dedupe_key) DO UPDATE SET claimed_at = ?2 WHERE claimed_at < ?3`, key, now(), new Date(Date.now() - CLAIM_MS).toISOString());
    if (!claim.meta.changes) return { status: "duplicate" };
  }
  try {
    // Looked again under the claim: a send that finished between the first look and the claim must not go twice.
    if (key) {
      const again = await first(db, "SELECT status FROM email_events WHERE dedupe_key = ?", key);
      if (again && again.status !== "failed") return { status: "duplicate" };
    }
    return await deliver(app, kind, to, data, key);
  } finally {
    if (key) await run(db, "DELETE FROM email_claims WHERE dedupe_key = ?", key).catch(() => {});
  }
}

async function deliver(app, kind, to, data, key) {
  const { config, db } = app;
  const msg = { from: senderOf(kind) === "store" ? config.emailFrom : config.emailFromNoreply, to, tags: [kind], ...render(kind, data) };
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

// What was mailed to this address (kinds, subjects, dates; never bodies), for the data export.
export const emailsTo = (db, email) =>
  all(db, "SELECT kind, status, subject, created_at FROM email_events WHERE to_email = ? ORDER BY created_at", email);

// Account deletion: the log keeps that a mail went out, not to whom or what it said. Dedupe keys of opt-in mail embed the
// address (new-release:<product>:<email>), so those are replaced too; keys without it (receipts per order) are kept so a
// replayed webhook still can't mail twice.
export const anonymiseEmailLogStmt = (db, email, anon) =>
  stmt(db, `UPDATE email_events SET to_email = ?, body_text = NULL,
      dedupe_key = CASE WHEN instr(dedupe_key, ?) > 0 THEN 'erased:' || id ELSE dedupe_key END
    WHERE to_email = ?`, anon, email, email);

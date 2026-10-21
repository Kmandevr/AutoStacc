// Paid creator storage, emails to a creator space's owner (the "storage-billing" template): a statement, a card charge
// that failed or needs the owner, a statement past due, a payment. Each is sent once per stage and statement (and per
// charge attempt), so a repeated sweep or webhook never mails twice. Its own file so statements.js, charges.js and
// payments.js can all mail without importing each other.
import { first } from "../lib/db.js";
import { sendEmail } from "../email/index.js";

export const ownerEmail = async (db, creatorId) => (await first(db,
  `SELECT u.email FROM creator_members m JOIN "user" u ON u.id = m.user_id WHERE m.creator_id = ? AND m.role = 'owner'`, creatorId) || {}).email || null;

/** extra: { attempt, card: { brand, last4, chargeOn }, nextTryAt }; the card is only ever its brand and last 4. */
export async function mailOwner(app, creatorId, stage, s, extra = {}) {
  const to = await ownerEmail(app.db, creatorId);
  if (!to) return;
  const card = extra.card ? { brand: extra.card.brand || null, last4: extra.card.last4 || null, chargeOn: extra.card.chargeOn || null } : null;
  await sendEmail(app, "storage-billing", to, { stage, period: s.period, amountCents: s.amount_cents, currency: s.currency, dueAt: s.due_at,
    card, nextTryAt: extra.nextTryAt || null, studioUrl: `${app.config.siteUrl}/studio#storage=${encodeURIComponent(creatorId)}` },
  { dedupeKey: `storage-billing:${stage}:${s.id}${extra.attempt ? `:${extra.attempt}` : ""}` });
}

// What happens after a verified payment or refund: grant or revoke the order's entitlements, send the confirmation.
// Granting is idempotent (running it twice changes nothing); the email goes out once per order (dedupe key).
import { grantStmt, revokeBySource, restoreBySource } from "../entitlements/grants.js";
import { verifiedUserIdForEmail } from "../entitlements/claim.js";
import { sendEmail } from "../email/index.js";
import { randomToken, first } from "../lib/db.js";
import { sha256 } from "../lib/crypto.js";
import { orderItems, getOrder } from "./orders.js";

export async function fulfil(app, orderId, { notify = true } = {}) {
  const order = await getOrder(app.db, orderId);
  if (!order || order.status !== "paid") return;
  const [items, userId] = await Promise.all([orderItems(app.db, order.id), order.user_id || verifiedUserIdForEmail(app.db, order.email)]);
  await app.db.batch(items.map((i) =>
    grantStmt(app.db, { userId, email: order.email, productId: i.product_id, sourceType: "purchase", sourceId: order.id })));
  if (notify) await sendConfirmation(app, order, items);
}

// Guests (no account on the order) get a library link carrying a fresh order key. Once a receipt is out, replays
// stop before minting a key, so the key in the sent mail stays valid; `resend` (admin) replaces it on purpose.
export async function sendConfirmation(app, order, items, { resend = false } = {}) {
  const libraryUrl = `${app.config.siteUrl}/library`;
  const dedupeKey = `purchase-confirmation:${order.id}`;
  // Already sent: nothing to do (and no new key minted). A failed earlier attempt is retried with a fresh key.
  if (!resend) {
    const prior = await first(app.db, "SELECT status FROM email_events WHERE dedupe_key = ?", dedupeKey);
    if (prior && prior.status !== "failed") return { status: "duplicate" };
  }
  let guestUrl = null;
  if (!order.user_id) {
    const secret = randomToken(32);
    await app.db.prepare("UPDATE orders SET email_key_hash = ? WHERE id = ?").bind(await sha256(secret), order.id).run();
    guestUrl = `${libraryUrl}#key=${order.id}.${secret}`;
  }
  return sendEmail(app, "purchase-confirmation", order.email,
    { order, items: items || (await orderItems(app.db, order.id)), libraryUrl, guestUrl },
    { dedupeKey: resend ? null : dedupeKey });
}

export const unfulfil = (app, orderId, reason) => revokeBySource(app.db, "purchase", orderId, reason);
// After a chargeback is won: the order's purchase grants come back.
export const restore = (app, orderId) => restoreBySource(app.db, "purchase", orderId, "disputed");

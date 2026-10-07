// What happens after a verified payment or refund: grant or revoke the order's entitlements, send the confirmation.
// Granting is idempotent (running it twice changes nothing); the email goes out once per order (dedupe key).
import { grantStmt, revokeBySource } from "../entitlements/grants.js";
import { verifiedUserIdForEmail } from "../entitlements/claim.js";
import { sendEmail } from "../email/index.js";
import { randomToken } from "../lib/db.js";
import { sha256 } from "../lib/crypto.js";
import { orderItems, getOrder } from "./orders.js";

export async function fulfil(app, orderId, { notify = true } = {}) {
  const order = await getOrder(app.db, orderId);
  if (!order || order.status !== "paid") return;
  const items = await orderItems(app.db, order.id);
  const userId = order.user_id || (await verifiedUserIdForEmail(app.db, order.email));
  await app.db.batch(items.map((i) =>
    grantStmt(app.db, { userId, email: order.email, productId: i.product_id, sourceType: "purchase", sourceId: order.id })));
  if (notify) await sendConfirmation(app, order, items);
}

// Guests (no account on the order) get a library link carrying a fresh order key. `resend` replaces the previous
// emailed key; otherwise a key is only minted once, so a replay can't swap the key of a mail already sent.
export async function sendConfirmation(app, order, items, { resend = false } = {}) {
  const libraryUrl = `${app.config.siteUrl}/library`;
  let guestUrl = null;
  if (!order.user_id) {
    const secret = randomToken(32);
    const res = await app.db
      .prepare(`UPDATE orders SET email_key_hash = ? WHERE id = ?${resend ? "" : " AND email_key_hash IS NULL"}`)
      .bind(await sha256(secret), order.id).run();
    if (res.meta.changes === 1) guestUrl = `${libraryUrl}#key=${order.id}.${secret}`;
  }
  return sendEmail(app, "purchase-confirmation", order.email,
    { order, items: items || (await orderItems(app.db, order.id)), libraryUrl, guestUrl },
    { dedupeKey: resend ? null : `purchase-confirmation:${order.id}` });
}

export const unfulfil = (app, orderId, reason) => revokeBySource(app.db, "purchase", orderId, reason);

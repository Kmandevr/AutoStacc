// Paid creator storage, the saved card (D1 storage_cards; owner, 2026-10-21, #142): one Stripe Customer per creator
// space on AutoStacc's main account, a card saved through a setup-mode Checkout (card details never reach AutoStacc; we
// keep the customer id, payment method id, brand and last 4). A card is recorded only from a verified card_saved event
// (server/payments/events.js) or a server-side lookup of the session, compare-and-set on the latest setup session. A new
// card replaces (detaches) the old one and puts open statements that couldn't be charged back in line for the sweep
// (charges.js); a removed card means statements fall back to the pay page.
import { first, run, now, randomToken } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { providerForAccount, providerByName } from "../payments/index.js";
import { isFirstParty } from "../creators/policy.js";
import { billingSettings, logStmt } from "./plans.js";
import { BILLING } from "./policy.js";

const ACCOUNT = "main";
const MAX_ATTEMPTS = (BILLING.chargeDays || [0, 3, 7, 12]).length;

export const cardOf = (db, creatorId) => first(db, "SELECT * FROM storage_cards WHERE creator_id = ?", creatorId);

/** What the owner sees: the brand and last 4 of a saved card, or null. */
export const publicCard = (row) => (row && row.payment_method_id ? { brand: row.brand || null, last4: row.last4 || null } : null);

const reject = (detail) => ({ outcome: "rejected", detail });

/** A setup-mode Checkout page to save (or replace) the card that pays this creator space's storage statements. */
export async function startCardSetup(app, creator, user) {
  const { db } = app;
  if (isFirstParty(creator)) fail(409, "storage_unlimited", "This creator's storage has no limit, so there's nothing to pay for.");
  if (!(await billingSettings(db)).on) fail(409, "storage_billing_off", "Paid storage isn't available yet.");
  const provider = providerForAccount(app, ACCOUNT);
  const live = provider.livemode(app.config);
  const row = await cardOf(db, creator.id);
  const same = row && row.provider === provider.name && Boolean(row.livemode) === live;
  const customerId = same ? row.customer_id
    : (await provider.ensureCustomer(app, { creatorId: creator.id, email: user.email, name: creator.name, key: `storage-customer-${creator.id}-${live ? "live" : "test"}` })).customerId;
  const back = `${app.config.siteUrl}/studio#storage=${encodeURIComponent(creator.id)}`;
  const { sessionId, url } = await provider.createCardSetup(app, { customerId, creatorId: creator.id, key: `storage-card-${creator.id}-${randomToken(6)}`,
    successUrl: `${back}&card=1`, cancelUrl: back });
  const t = now();
  // A different provider or mode starts over with no card: a card saved in test mode can't pay a live statement.
  await run(db, `INSERT INTO storage_cards (creator_id, provider, customer_id, livemode, setup_session_id, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(creator_id) DO UPDATE SET
      payment_method_id = CASE WHEN storage_cards.provider = excluded.provider AND storage_cards.livemode = excluded.livemode THEN storage_cards.payment_method_id END,
      brand = CASE WHEN storage_cards.provider = excluded.provider AND storage_cards.livemode = excluded.livemode THEN storage_cards.brand END,
      last4 = CASE WHEN storage_cards.provider = excluded.provider AND storage_cards.livemode = excluded.livemode THEN storage_cards.last4 END,
      provider = excluded.provider, customer_id = excluded.customer_id, livemode = excluded.livemode, setup_session_id = excluded.setup_session_id,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`, creator.id, provider.name, customerId, live ? 1 : 0, sessionId, t, user.id);
  // An earlier setup page left open can no longer save a card: close it.
  if (same && row.setup_session_id && row.setup_session_id !== sessionId) await provider.expireCheckout(app, row.setup_session_id).catch(() => {});
  await logStmt(db, creator.id, user.id, "card.setup_started", { replacing: Boolean(same && row.payment_method_id) }).run();
  return { url };
}

/** Applies a verified card_saved event (or a lookup of the setup session): the card is saved once, for its own session only. */
export async function applyCardEvent(app, ev) {
  const { db } = app;
  if (ev.account && ev.account !== ACCOUNT) return reject("payment account mismatch");
  if (!ev.sessionId || !ev.creatorId) return reject("no setup session or creator");
  const row = await cardOf(db, ev.creatorId);
  if (!row || row.provider !== ev.provider) return reject("no matching storage card");
  if (Boolean(row.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch");
  if (ev.customerId && ev.customerId !== row.customer_id) return reject("customer mismatch");
  // The webhook carries only the session: what was saved is read back from Stripe, never taken from the browser.
  let card = ev;
  if (!ev.paymentMethodId) {
    const provider = providerByName(ev.provider);
    card = await provider.retrieveCardSetup(app, ev.sessionId);
    if (!card || card.status !== "complete") return reject("setup session not complete");
    if ((card.creatorId && card.creatorId !== ev.creatorId) || (card.customerId && card.customerId !== row.customer_id)
      || (card.livemode !== undefined && Boolean(card.livemode) !== Boolean(row.livemode))) {
      return reject("setup session mismatch");
    }
  }
  if (!card.paymentMethodId) return reject("no payment method on the setup session");
  if (row.setup_session_id !== ev.sessionId) {
    return row.payment_method_id === card.paymentMethodId ? { outcome: "card already saved" } : reject("not the latest setup session");
  }
  const moved = await run(db, `UPDATE storage_cards SET payment_method_id = ?, brand = ?, last4 = ?, updated_at = ?, updated_by = ?
    WHERE creator_id = ? AND setup_session_id = ? AND payment_method_id IS NOT ?`,
    card.paymentMethodId, card.brand || null, card.last4 || null, now(), ev.actor || "system", row.creator_id, ev.sessionId, card.paymentMethodId);
  if (!moved.meta.changes) return { outcome: "card already saved" };
  // The card it replaces comes off the customer at Stripe; if that fails it's harmless (never charged again) and logged.
  if (row.payment_method_id && row.payment_method_id !== card.paymentMethodId) {
    await providerByName(row.provider).detachCard(app, row.payment_method_id).catch((e) => console.error("storage card detach", e && e.code));
  }
  await logStmt(db, row.creator_id, ev.actor || "system", "card.saved", { brand: card.brand || null, last4: card.last4 || null, event: ev.id || null }).run();
  // Open statements that couldn't be charged (no card, declined, needed authentication) are tried again by the next sweep.
  await run(db, `UPDATE storage_statements SET next_charge_at = ? WHERE creator_id = ? AND status = 'open' AND livemode = ?
    AND charge_status IN ('no_card', 'declined', 'requires_action') AND charge_attempts < ?`, now(), row.creator_id, row.livemode ? 1 : 0, MAX_ATTEMPTS);
  return { outcome: "storage card saved" };
}

/** Back from the setup page: looks the latest setup session up at Stripe and saves the card if it's done. */
export async function confirmCardSetup(app, creator, user) {
  const row = await cardOf(app.db, creator.id);
  const provider = providerForAccount(app, ACCOUNT);
  if (!row || !row.setup_session_id || row.provider !== provider.name) return { saved: false, card: publicCard(row) };
  const sessionId = row.setup_session_id;
  const found = await provider.retrieveCardSetup(app, sessionId).catch(() => null);
  if (!found || found.status !== "complete") return { saved: false, status: found ? found.status : null, card: publicCard(row) };
  const res = await applyCardEvent(app, { ...found, type: "card_saved", id: `lookup:${sessionId}`, provider: provider.name, sessionId,
    creatorId: creator.id, account: ACCOUNT, actor: user.id });
  return { saved: res.outcome !== "rejected", card: publicCard(await cardOf(app.db, creator.id)) };
}

/** Removes the saved card: detached at Stripe first; if Stripe refuses, nothing changes. Statements then use the pay page. */
export async function removeCard(app, creator, user) {
  const { db } = app;
  const row = await cardOf(db, creator.id);
  if (!row || !row.payment_method_id) fail(409, "no_card", "There's no saved card to remove.");
  try {
    await providerByName(row.provider).detachCard(app, row.payment_method_id);
  } catch (e) {
    // Already gone at Stripe is fine; any other refusal keeps the card (Stripe's words stay in the server log).
    if (!(e && e.code === "resource_missing")) {
      console.error("storage card remove", e && e.code);
      await logStmt(db, creator.id, user.id, "card.remove_failed", {}).run();
      fail(503, "card_remove_failed", "Stripe couldn't remove the card, so nothing changed. Try again in a moment.");
    }
  }
  // The setup session goes too, so a late event for it can't put the card back.
  const res = await run(db, `UPDATE storage_cards SET payment_method_id = NULL, brand = NULL, last4 = NULL, setup_session_id = NULL, updated_at = ?, updated_by = ?
    WHERE creator_id = ? AND payment_method_id = ?`, now(), user.id, creator.id, row.payment_method_id);
  if (res.meta.changes) await logStmt(db, creator.id, user.id, "card.removed", { brand: row.brand || null, last4: row.last4 || null }).run();
  return { card: null };
}

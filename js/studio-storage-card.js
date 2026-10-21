// Studio saved card for paid storage (GS.studioStorageCard, for js/studio-storage.js): shows the card that pays storage
// statements automatically (brand and last 4 only; card details stay at Stripe), the next charge date, and Save,
// Replace or Remove; removing it means statements come with a pay link by email instead. Back from the Stripe setup
// page (#storage=<id>&card=1) it asks the server to look the card up. Talks to /api/studio/creators/:id/storage/card
// (server/studio/storage.js). Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents, api } = window.GS;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const BRAND = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };
  const brandName = (b) => BRAND[b] || (b ? String(b) : "Card");

  // The next automatic charge the server has planned: the earliest open statement with a charge date.
  function nextCharge(statements) {
    return (statements || []).filter((t) => t.status === "open" && t.nextChargeAt)
      .sort((a, b) => (a.nextChargeAt < b.nextChargeAt ? -1 : 1))[0] || null;
  }

  function html(x) {
    const b = x.billing, plan = x.plan, card = b.card;
    const live = plan && ["active", "past_due", "cancelled"].includes(plan.status);
    const open = (x.statements || []).some((t) => t.status === "open");
    if (!card && !live && !open) return "";
    const next = card ? nextCharge(x.statements) : null;
    return `<div class="field"><h5>Card for storage statements</h5>
      ${card ? `<p>${e(brandName(card.brand))}${card.last4 ? ` ending ${e(card.last4)}` : ""}, saved with Stripe.</p>
        <p class="small-print">${next ? `Next charge: ${e(day(next.nextChargeAt))}, ${cents(next.amountCents, next.currency)} for ${e(next.period)}.`
          : "Each month's statement is paid from your earnings ready to pay out first, then this card is charged for the rest."}
          If a charge doesn't go through we email you and try again a few times within ${e(String(b.graceDays))} days.</p>
        <button class="btn ghost small" type="button" data-card-save>Replace card</button>
        <button class="btn ghost small danger" type="button" data-card-remove>Remove card</button>
        <p class="small-print">Without a card, each statement comes by email with a link to pay it yourself.</p>`
      : `<p class="small-print">No card saved: each statement comes by email with a link to pay it. Save a card and the part your earnings don't cover is charged automatically each month. Card details go to Stripe, never to AutoStacc.</p>
        <button class="btn small" type="button" data-card-save>Save a card</button>`}
      <p class="msg" role="status" data-card-say hidden></p></div>`;
  }

  // Back from the setup page: the server looks the card up at Stripe, then the address loses "card=1".
  async function confirmReturn(base, creatorId) {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("storage") !== creatorId || hash.get("card") !== "1") return null;
    hash.delete("card");
    try { history.replaceState(null, "", `${location.pathname}${location.search}#${hash.toString()}`); } catch (_) { /* address stays as is */ }
    return api(`${base}/card/confirm`, { method: "POST", body: {} });
  }

  /** Draws the card part into box for the storage answer x; refresh() redraws the whole storage panel. */
  async function mount(box, creatorId, x, refresh) {
    if (!box || !x.billing || x.storage.unlimited) return;
    const base = `/api/studio/creators/${encodeURIComponent(creatorId)}/storage`;
    const back = await confirmReturn(base, creatorId);
    if (back && back.ok && back.data.saved) return refresh();
    box.innerHTML = html(x);
    const say = (text, error) => {
      const m = box.querySelector("[data-card-say]");
      if (!m) return;
      m.hidden = false; m.className = error ? "msg error" : "msg"; m.textContent = text;
    };
    if (back && !back.ok) say(back.error.message, true);
    else if (back) say("Stripe hasn't finished saving your card yet. Reload in a moment to see it.");
    const sk = window.GS.skeleton; // the shared button spinner (js/skeleton.js); both buttons wait while one request is out
    const busy = (on, clicked) => box.querySelectorAll("button").forEach((btn) => (sk && btn === clicked ? sk.busy(btn, on) : (btn.disabled = on)));
    box.addEventListener("click", async (ev) => {
      const save = ev.target.closest("[data-card-save]");
      const remove = ev.target.closest("[data-card-remove]");
      if (!save && !remove) return;
      if (remove && !confirm("Remove this card? Future statements come by email with a link to pay them yourself. Nothing you store changes.")) return;
      const btn = save || remove;
      busy(true, btn);
      const out = save ? await api(`${base}/card`, { method: "POST", body: {} }) : await api(`${base}/card`, { method: "DELETE", body: {} });
      if (!out.ok) { busy(false, btn); return say(out.error.message, true); }
      return save ? location.assign(out.data.url) : refresh();
    });
  }

  window.GS.studioStorageCard = { mount };
})();

// Control Center, Payouts tab: creators' payout requests with how each wants to be paid. Send it as a Stripe
// transfer, or pay by hand and mark it paid, or decline with a note; each is recorded in the audit log.
// Talks to /api/admin/payouts.
// Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const day = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

  async function draw(el) {
    const res = await api("/api/admin/payouts");
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const rows = res.data.payouts.map((p) => `<tr><td>${e(p.creator.name)}<br><span class="small-print">/${e(p.creator.slug)}</span></td><td>${cents(p.amountCents, p.currency)}</td>
      <td>${e(p.details)}</td><td>${e(p.status)}</td><td>${e(day(p.requestedAt))}</td>
      <td>${p.status === "requested" ? `<input aria-label="Note for ${e(p.creator.name)}" data-note maxlength="300" placeholder="Note (optional)">
        <button class="btn small" type="button" data-settle="paid" data-id="${e(p.id)}">${p.viaStripe ? "Send via Stripe" : "Mark paid"}</button>
        <button class="btn ghost small" type="button" data-settle="declined" data-id="${e(p.id)}">Decline</button>` : e(p.note)}</td></tr>`).join("");
    el.innerHTML = `<p class="small-print">Requests with a Stripe account are sent from here (one Stripe transfer each, never two). Others you pay yourself (PayPal, bank transfer), then mark paid. Amounts are what has cleared the refund hold.</p>
      <div class="admin-table"><table><thead><tr><th scope="col">Creator</th><th scope="col">Amount</th><th scope="col">Pay to</th><th scope="col">Status</th><th scope="col">Asked</th><th scope="col">Action</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No payout requests.</td></tr>'}</tbody></table></div><p class="msg" role="status" hidden></p>`;
  }

  addEventListener("gs:admin", () => {
    const el = $("#admin-payouts");
    if (!el) return;
    draw(el);
    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-settle]");
      if (!btn || btn.disabled) return;
      const stripe = btn.textContent.includes("Stripe");
      if (!await window.GS.confirm(btn.dataset.settle === "paid" ? (stripe ? "Send this payout now? Stripe transfers the money to the creator's account." : "Mark this payout as paid? Only do this after sending the money.") : "Decline this payout request?")) return;
      btn.disabled = true;
      const note = $("[data-note]", btn.closest("td"));
      const res = await api(`/api/admin/payouts/${encodeURIComponent(btn.dataset.id)}`, { method: "PATCH", body: { status: btn.dataset.settle, note: note ? note.value : "" } });
      if (!res.ok) { btn.disabled = false; const m = $(".msg", el); m.hidden = false; m.className = "msg error"; m.textContent = res.error.message; return; }
      draw(el);
    });
  }, { once: true });
})();

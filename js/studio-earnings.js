// Studio earnings (GS.studioEarnings, for js/studio.js): what a creator's sales have brought in (their share after
// AutoStacc's fee and refunds), what is still on hold, what can be paid out, and a payout request form. Owners only;
// the server hides it from anyone else and never shows who bought. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");

  async function draw(el, creatorId) {
    const res = await api(`/api/studio/creators/${encodeURIComponent(creatorId)}/earnings`);
    if (!res.ok) { el.innerHTML = ""; return; }
    const { earnings: x, payouts } = res.data;
    const open = payouts.find((p) => p.status === "requested");
    el.innerHTML = `
      <h3>Earnings</h3>
      <div class="stats-grid">
        <div class="stat"><span class="stat-label">Your share</span><span class="stat-value">${cents(x.shareCents)}</span></div>
        <div class="stat"><span class="stat-label">On hold (${x.holdDays || 14} days)</span><span class="stat-value">${cents(x.onHoldCents)}</span></div>
        <div class="stat"><span class="stat-label">Ready to pay out</span><span class="stat-value">${cents(x.availableCents)}</span></div>
        <div class="stat"><span class="stat-label">Paid out</span><span class="stat-value">${cents(x.paidOutCents)}</span></div>
      </div>
      <p class="small-print">${x.salesCount} sales · AutoStacc's fee ${(x.feeBps || 0) / 100}% (${cents(x.platformFeeCents)}). Sales are held for a refund window before they can be paid out.</p>
      ${open ? `<p class="msg">Payout of ${cents(open.amountCents)} requested on ${e(day(open.requestedAt))}. It shows as paid when AutoStacc has sent it.</p>`
        : `<form data-form="payout"><div class="field"><label>How should we pay you?<input name="details" required minlength="5" maxlength="200" placeholder="PayPal: you@example.com"></label>
            <p class="small-print">Only you and AutoStacc see this. Payouts are sent by hand for now.</p></div>
            <button class="btn small" type="submit"${x.availableCents ? "" : " disabled"}>Request a payout of ${cents(x.availableCents)}</button></form>`}
      <p class="msg" role="status" hidden></p>
      ${x.products.length ? `<details><summary>By product</summary><ul>${x.products.map((p) => `<li>${e(p.title)}: ${p.sales} sold · ${cents(p.shareCents)}</li>`).join("")}</ul></details>` : ""}
      ${payouts.length ? `<details><summary>Payouts</summary><ul>${payouts.map((p) => `<li>${e(day(p.requestedAt))}: ${cents(p.amountCents)} · ${e(p.status)}${p.note ? ` · ${e(p.note)}` : ""}</li>`).join("")}</ul></details>` : ""}`;
    const form = $("form[data-form=payout]", el);
    if (form) form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = $("button", form);
      btn.disabled = true;
      const out = await api(`/api/studio/creators/${encodeURIComponent(creatorId)}/payouts`, { method: "POST", body: { details: form.details.value } });
      if (!out.ok) { btn.disabled = false; const m = $(".msg", el); m.hidden = false; m.className = "msg error"; m.textContent = out.error.message; return; }
      draw(el, creatorId);
    });
  }

  window.GS.studioEarnings = { draw };
})();

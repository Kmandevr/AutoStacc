// Studio earnings (GS.studioEarnings, for js/studio.js): what a creator's sales have brought in (their share after
// AutoStacc's fee and refunds), what is still on hold, what can be paid out, and a payout request form. Owners only;
// the server hides it from anyone else and never shows who bought. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");

  // The countries a payout account can be opened in: the same list as PAYOUT_COUNTRIES in server/payments/connect.js (Stripe's
  // self-serve payouts reach the US, UK, European Economic Area, Canada and Switzerland; the server refuses any other).
  const COUNTRIES = { US: "United States", CA: "Canada", GB: "United Kingdom", CH: "Switzerland", AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
    CZ: "Czechia", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France", DE: "Germany", GR: "Greece", HU: "Hungary", IS: "Iceland", IE: "Ireland", IT: "Italy",
    LV: "Latvia", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal", RO: "Romania",
    SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden" };

  // Where the creator is paid: with the marketplace account set up they connect a Stripe account (Stripe collects the ID and
  // bank details; none reach AutoStacc); without it they say how they'd like to be paid and AutoStacc pays by hand.
  function accountPanel(acct, creatorId) {
    if (!acct || !acct.open) return "";
    if (!acct.connected) {
      return `<form data-form="connect"><h4>Payout account</h4>
        <p class="small-print">Payouts go to a Stripe account in your name. Stripe asks for your ID and bank details on its own page; AutoStacc never sees them.</p>
        <div class="field"><label>Country of your bank account <select name="country" required>${Object.entries(COUNTRIES).map(([k, v]) => `<option value="${k}"${k === (acct.platformCountry || "US") ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <p class="small-print">You can't change this later.</p></div>
        <button class="btn small" type="submit">Set up payouts</button></form>`;
    }
    if (!acct.payoutsEnabled) {
      return `<form data-form="connect"><h4>Payout account</h4>
        <p class="msg">${acct.detailsSubmitted ? "Stripe is still checking your details." : "Setup isn't finished."}${acct.due ? ` ${acct.due} thing${acct.due === 1 ? "" : "s"} still needed.` : ""}</p>
        <button class="btn small" type="submit">Continue setup</button></form>`;
    }
    return `<p class="small-print">Payout account: ready${acct.country ? ` (${e(COUNTRIES[acct.country] || acct.country)})` : ""}.</p>`;
  }

  async function draw(el, creatorId) {
    const sk = window.GS.skeleton; // placeholders (js/skeleton.js) the first time only, so a redraw never flickers
    if (sk && !el.childElementCount) sk.show(el, "panel", 1);
    const [res, acctRes] = await Promise.all([api(`/api/studio/creators/${encodeURIComponent(creatorId)}/earnings`), api(`/api/studio/creators/${encodeURIComponent(creatorId)}/payout-account`)]);
    if (sk) sk.done(el);
    if (!res.ok) { el.innerHTML = ""; return; }
    const { earnings: x, payouts } = res.data;
    const acct = acctRes.ok ? acctRes.data : null;
    const stripe = Boolean(acct && acct.open);
    const open = payouts.find((p) => p.status === "requested");
    const ready = !stripe || Boolean(acct.payoutsEnabled);
    el.innerHTML = `
      <h3>Earnings</h3>
      <div class="stats-grid">
        <div class="stat"><span class="stat-label">Your share</span><span class="stat-value">${cents(x.shareCents)}</span></div>
        <div class="stat"><span class="stat-label">On hold (${x.holdDays || 14} days)</span><span class="stat-value">${cents(x.onHoldCents)}</span></div>
        <div class="stat"><span class="stat-label">Ready to pay out</span><span class="stat-value">${cents(x.availableCents)}</span></div>
        <div class="stat"><span class="stat-label">Paid out</span><span class="stat-value">${cents(x.paidOutCents)}</span></div>
      </div>
      ${x.deductedCents ? `<p class="small-print">${cents(x.deductedCents)} of your earnings paid your storage statements (Storage, above).</p>` : ""}
      <p class="small-print">${x.salesCount} sales · AutoStacc's fee ${(x.feeBps || 0) / 100}% (${cents(x.platformFeeCents)}). Sales are held for a refund window before they can be paid out.</p>
      ${x.balanceCents < 0 ? `<p class="msg" role="status">${cents(-x.balanceCents)} of sales you were already paid for were refunded. It comes out of your next sales before anything more is paid out.</p>` : ""}
      ${accountPanel(acct, creatorId)}
      ${open ? `<p class="msg">Payout of ${cents(open.amountCents)} requested on ${e(day(open.requestedAt))}. It shows as paid when AutoStacc has sent it.</p>`
        : `<form data-form="payout">${stripe ? "" : `<div class="field"><label>How should we pay you?<input name="details" required minlength="5" maxlength="200" placeholder="PayPal: you@example.com"></label>
            <p class="small-print">Only you and AutoStacc see this. Payouts are sent by hand for now.</p></div>`}
            <button class="btn small" type="submit"${x.availableCents && ready ? "" : " disabled"}>Request a payout of ${cents(x.availableCents)}</button>
            ${stripe && !ready ? '<p class="small-print">Finish your payout account first.</p>' : ""}</form>`}
      <p class="msg" role="status" hidden></p>
      ${x.products.length ? `<details><summary>By product</summary><ul>${x.products.map((p) => `<li>${e(p.title)}: ${p.sales} sold · ${cents(p.shareCents)}</li>`).join("")}</ul></details>` : ""}
      ${payouts.length ? `<details><summary>Payouts</summary><ul>${payouts.map((p) => `<li>${e(day(p.requestedAt))}: ${cents(p.amountCents)} · ${e(p.status)}${p.note ? ` · ${e(p.note)}` : ""}</li>`).join("")}</ul></details>` : ""}`;
    const say = (text) => { const m = $(".msg[role=status]", el); m.hidden = false; m.className = "msg error"; m.textContent = text; };
    const form = $("form[data-form=payout]", el);
    if (form) form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = $("button", form);
      btn.disabled = true;
      const out = await api(`/api/studio/creators/${encodeURIComponent(creatorId)}/payouts`, { method: "POST", body: form.details ? { details: form.details.value } : {} });
      if (!out.ok) { btn.disabled = false; return say(out.error.message); }
      draw(el, creatorId);
    });
    const connect = $("form[data-form=connect]", el);
    if (connect) connect.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = $("button", connect);
      btn.disabled = true;
      const out = await api(`/api/studio/creators/${encodeURIComponent(creatorId)}/payout-account`, { method: "POST", body: connect.country ? { country: connect.country.value } : {} });
      if (!out.ok) { btn.disabled = false; return say(out.error.message); }
      location.assign(out.data.url);
    });
  }

  window.GS.studioEarnings = { draw };
})();

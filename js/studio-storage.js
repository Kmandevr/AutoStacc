// Studio storage (GS.studioStorage, for js/studio.js): what a creator stores, split by kind, against its limit, the same
// figures uploads are checked against. For the owner, paid storage too (server/billing/): the monthly cap they chose, this
// month so far, statements with the daily measurements behind them, paying one, and the billing log. Members who aren't
// the owner see the storage only (the server sends nothing more). Talks to /api/studio/creators/:id/storage
// (server/studio/storage.js). Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const GB = 1024 ** 3;
  const size = (n) => (n >= GB ? `${(n / GB).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const PART = { singleFiles: "Paid files uploaded one by one", originals: "Pac files (each stored file once)", archives: "Pac uploads in progress",
    previews: "Pac preview clips", siteFiles: "Site images and fonts" };
  const STATUS = { nothing_due: "Nothing due", carried: "Under the minimum: added to next month", open: "To pay", paid: "Paid", waived: "Waived by AutoStacc", refunded: "Refunded",
    disputed: "Payment disputed: counts as unpaid" };
  const PLAN = { active: "Active", past_due: "Paused: a statement is overdue", cancelled: "Cancelled: charged until you're back within your free storage", ended: "Ended" };
  // Hundredths of a cent per GB-month, as a price.
  const rateText = (r) => (r ? `$${(r / 10000).toFixed(4).replace(/0{1,2}$/, "")} per GB a month` : "");

  function billingPanel(x) {
    const b = x.billing, plan = x.plan, s = x.storage;
    if (!b) return "";
    const live = plan && ["active", "past_due", "cancelled"].includes(plan.status);
    // A monthly spending cap in dollars (owner, 2026-10-16); what it buys at the rate is shown as it's typed.
    const buys = (dollars) => (b.rate ? size(s.includedBytes + Math.floor((dollars * 100 * 100 * GB) / b.rate)) : "");
    const capNow = plan && live ? plan.capCents / 100 : 2;
    const offer = b.available
      ? `<form data-form="storage-plan"><div class="field"><label>Most you'll spend a month $<input type="number" name="cap" min="${b.minCapCents / 100}" max="${b.maxCapCents / 100}" step="0.01" required value="${capNow}"></label>
          <p class="small-print" data-buys>Lets you store up to ${e(buys(capNow))}.</p>
          <p class="small-print">You pay ${e(rateText(b.rate))} for what you actually store above your free ${e(size(s.includedBytes))}, measured once a day, never for unused room. Uploads stop at your limit, so a month at most costs your cap. Statements come after each month and are paid from your earnings ready to pay out first, then by card; under ${cents(b.minChargeCents)} is added to the next one.</p></div>
          <button class="btn small" type="submit">${live && plan.status !== "cancelled" ? "Change cap" : "Start paid storage"}</button></form>`
      : `<p class="small-print">${live ? "Paid storage isn't open to new caps right now." : "More storage than the free allowance isn't available yet."}</p>`;
    const statements = x.statements.length ? `<div class="admin-table"><table><thead><tr><th>Month</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${x.statements.map((t) => `<tr>
        <td>${e(t.period)}</td><td>${cents(t.amountCents, t.currency)}${t.earningsCents ? ` <span class="small-print">(${cents(t.earningsCents)} paid from earnings)</span>` : ""}${t.carriedInCents ? ` <span class="small-print">(${cents(t.carriedInCents)} carried in)</span>` : ""}</td>
        <td>${e(STATUS[t.status] || t.status)}${t.status === "open" ? ` · due ${e(day(t.dueAt))}` : ""}</td>
        <td><button class="btn ghost small" type="button" data-days="${e(t.id)}">Daily figures</button>${t.status === "open" ? ` <button class="btn small" type="button" data-pay="${e(t.id)}">Pay</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : "";
    return `<h4>Paid storage</h4>
      ${plan ? `<p>${e(PLAN[plan.status] || plan.status)}${live ? ` · up to ${cents(plan.capCents)} a month, a limit of ${e(size(plan.capBytes))}` : ""}.</p>` : ""}
      ${s.overLimit && live ? `<p class="msg" role="status">You store ${e(size(s.usedBytes))}, more than your limit of ${e(size(s.quotaBytes))}. New uploads are stopped, and what's stored above your free ${e(size(s.includedBytes))} is still charged until you're back under your limit: delete files you don't need, or raise your cap. Not sure what to remove? <a href="/contact">Ask AutoStacc support</a>.</p>` : ""}
      ${plan && plan.status === "past_due" ? `<p class="msg" role="status">Pay the overdue statement below to get your limit back. Nothing you've stored is deleted or hidden, and buyers keep their downloads.</p>` : ""}
      ${offer}
      ${live ? `<p class="small-print">This month so far: ${x.monthToDate.daysMeasured} of ${x.monthToDate.daysInPeriod} days measured, ${cents(x.monthToDate.usageCents)}.</p>` : ""}
      ${plan && ["active", "past_due"].includes(plan.status) ? `<button class="btn ghost small danger" type="button" data-cancel>Cancel paid storage</button>
        <p class="small-print">Cancelling removes the limit at once. Nothing is deleted; storage above your free allowance is still charged until you're back within it.</p>` : ""}
      ${statements}<div data-day-list></div>
      ${x.log.length ? `<details><summary>Billing history</summary><ul>${x.log.map((l) => `<li>${e(day(l.at))}: ${e(l.action.replace(".", " "))} (${e(l.by)})</li>`).join("")}</ul></details>` : ""}`;
  }

  async function draw(el, creatorId) {
    const base = `/api/studio/creators/${encodeURIComponent(creatorId)}/storage`;
    const res = await api(base);
    if (!res.ok) { el.innerHTML = ""; return; }
    const x = res.data, s = x.storage;
    el.innerHTML = `<h3>Storage</h3>
      <p><meter min="0" max="${s.quotaBytes}" value="${Math.min(s.usedBytes, s.quotaBytes)}" aria-label="Storage used"></meter> ${e(size(s.usedBytes))} of ${e(size(s.quotaBytes))}</p>
      <details><summary>What counts</summary><ul>${Object.entries(s.byPart).map(([k, n]) => `<li>${e(PART[k] || k)}: ${e(size(n))}</li>`).join("")}</ul>
        <p class="small-print">A file kept by several products or versions counts once. Files a new version replaced count for the 30 days buyers can still download them. At the limit only new uploads stop.</p></details>
      ${billingPanel(x)}<p class="msg" role="status" data-say hidden></p>`;
    const say = (text) => { const m = $("[data-say]", el); m.hidden = false; m.className = "msg error"; m.textContent = text; };
    const form = $("form[data-form=storage-plan]", el);
    if (form) form.cap.addEventListener("input", () => { $("[data-buys]", form).textContent = `Lets you store up to ${size(s.includedBytes + Math.floor((Number(form.cap.value || 0) * 10000 * GB) / x.billing.rate))}.`; });
    if (form) form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = $("button", form);
      btn.disabled = true;
      const out = await api(`${base}/plan`, { method: "PUT", body: { capCents: Math.round(Number(form.cap.value) * 100) } });
      if (!out.ok) { btn.disabled = false; return say(out.error.message); }
      draw(el, creatorId);
    });
    el.addEventListener("click", async (ev) => {
      const t = ev.target;
      const cancel = t.closest("[data-cancel]");
      if (cancel) {
        if (!confirm("Cancel paid storage? Nothing is deleted; uploads stop above your free storage.")) return;
        cancel.disabled = true;
        const out = await api(`${base}/plan`, { method: "DELETE", body: {} });
        if (!out.ok) cancel.disabled = false;
        return out.ok ? draw(el, creatorId) : say(out.error.message);
      }
      const pay = t.closest("[data-pay]");
      if (pay) {
        pay.disabled = true;
        const out = await api(`${base}/statements/${encodeURIComponent(pay.dataset.pay)}/checkout`, { method: "POST", body: {} });
        if (!out.ok) { pay.disabled = false; return say(out.error.message); }
        return location.assign(out.data.url);
      }
      const days = t.closest("[data-days]");
      if (days) {
        const out = await api(`${base}/statements/${encodeURIComponent(days.dataset.days)}`);
        if (!out.ok) return say(out.error.message);
        $("[data-day-list]", el).innerHTML = `<details open><summary>${e(out.data.statement.period)}, day by day</summary><div class="admin-table"><table>
          <thead><tr><th>Day</th><th>Stored</th><th>Free</th><th>Charged for</th></tr></thead><tbody>${out.data.days.map((d) => `<tr><td>${e(d.day)}</td><td>${e(size(d.usedBytes))}</td>
          <td>${e(size(d.includedBytes))}</td><td>${e(size(d.billableBytes))}</td></tr>`).join("")}</tbody></table></div>
          <p class="small-print">Each day is 1/${out.data.statement.daysInPeriod} of a month. A day without a measurement isn't charged. Questions about a statement: write to AutoStacc support.</p></details>`;
      }
    });
  }

  window.GS.studioStorage = { draw };
})();

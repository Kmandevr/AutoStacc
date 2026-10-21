// Product Studio, Pricing (GS.studioSections.pricing, drawn by js/studio-workspace.js): the base price (PATCH priceCents:
// free, or within the store's limits), the product's sales (GET /api/studio/products/:id/pricing; POST .../sales; DELETE
// .../sales/:id ends one) and the earnings estimate the server works out. The server computes every real price; the
// only sum here is a labelled estimate of a sale price while the form is filled in. A first-party creator (firstParty)
// pays no platform fee: each sale is AutoStacc's own, so the estimate shows what a sale brings in. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});
  const STATE = { running: "Running", scheduled: "Scheduled", ended: "Ended" };

  sections.pricing = {
    draw(el, ctx) {
      const K = window.GS.studioKit;
      const p = ctx.product.product || {};
      const base = `/api/studio/products/${encodeURIComponent(p.id)}`;
      const lim = { minPriceCents: 100, maxPriceCents: 50000, ...(ctx.product.limits || {}) };
      const money = (c, cur) => (typeof c === "number" ? cents(c, cur || p.currency || "USD") : "—");
      const off = (s) => (s.percentOff ? `${s.percentOff}% off` : s.amountOffCents ? `${money(s.amountOffCents)} off` : "");
      const iso = (v) => (v ? new Date(v).toISOString() : undefined);

      function draw(pr) {
        const price = pr ? pr.priceCents : (ctx.product.product || {}).priceCents;
        const est = pr && pr.estimate;
        const fp = Boolean(pr && pr.firstParty);
        const row = (label, x) => x ? `<tr><th scope="row">${label}</th><td>${money(x.priceCents)}</td>${fp ? `<td>${money(x.netCents)}</td>`
          : `<td>${money(x.platformFeeCents)}</td><td>${money(x.creatorShareCents)}</td>`}</tr>` : "";
        const sales = (pr && pr.sales) || [];
        const open = sales.some((s) => s.status !== "ended");
        el.innerHTML = `
          <form class="panel sr-price" data-pr-price><h3>Base price</h3>
            <div class="field"><label for="pr-price">Price in dollars (0 = free)</label>
              <input id="pr-price" name="price" type="number" inputmode="decimal" min="0" max="${lim.maxPriceCents / 100}" step="0.01" required value="${((price || 0) / 100).toFixed(2)}"></div>
            <p class="small-print">Free, or ${money(lim.minPriceCents)} to ${money(lim.maxPriceCents)}.</p>
            <button class="btn small" type="submit">Save price</button><p class="msg" role="status"></p></form>
          ${pr === undefined ? '<p class="msg pending">Loading sales…</p>' : !pr ? '<p class="msg">Sales and earnings estimates aren\'t available right now. Try again in a moment.</p>' : `
          ${est ? `<h3>Estimated earnings per sale</h3><div class="sk-table"><table><thead><tr><th scope="col"></th><th scope="col">Buyer pays</th>${fp ? '<th scope="col">AutoStacc receives</th>'
            : `<th scope="col">Platform fee${pr.feeBps ? ` (${pr.feeBps / 100}%)` : ""}</th><th scope="col">Your share</th>`}</tr></thead>
            <tbody>${row("List price", est.list)}${row("During the sale", est.sale)}</tbody></table></div>
            <p class="small-print">${fp ? "AutoStacc's own creator: no platform fee and no creator share. Every sale goes to AutoStacc's own account." : "Estimates from the store's own split. Payment processing is AutoStacc's cost, not taken from your share."}</p>` : ""}
          ${pr.storeSale ? `<p class="msg">AutoStacc's store-wide sale "${e(pr.storeSale.name)}" also applies: buyers pay whichever price is lower (${money(pr.storeSale.priceCents)} with it).</p>` : ""}
          <h3>Sales</h3>
          ${sales.length ? `<div class="sk-table"><table><thead><tr><th scope="col">Discount</th><th scope="col">Starts</th><th scope="col">Ends</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>
            ${sales.map((s) => `<tr data-status="${e(s.status)}"><td>${e(off(s))}</td><td>${e(K.when(s.startsAt))}</td><td>${s.endsAt ? e(K.when(s.endsAt)) : "No end date"}</td><td>${e(STATE[s.status] || s.status)}</td>
              <td>${s.status === "ended" ? "" : `<button class="btn ghost small danger" type="button" data-pr-end="${e(s.id)}">${s.status === "running" ? "End sale" : "Cancel sale"}</button>`}</td></tr>`).join("")}</tbody></table></div>`
            : '<p class="small-print">No sales yet.</p>'}
          ${open ? '<p class="small-print">One sale at a time: end this one to make another. A sale can\'t be edited, so every order keeps the terms it got.</p>' : !price ? '<p class="small-print">A free product can\'t have a sale.</p>' : `
          <form class="panel sr-sale" data-pr-sale><h3>New sale</h3>
            <fieldset class="sr-choice"><legend>Discount</legend>
              <label><input type="radio" name="mode" value="percent" checked> Percent off</label>
              <label><input type="radio" name="mode" value="amount"> Amount off</label></fieldset>
            <div class="field"><label for="pr-off">How much off <span class="small-print" data-pr-unit>(1 to 90 percent)</span></label><input id="pr-off" name="off" type="number" inputmode="decimal" min="1" max="90" step="1" required></div>
            <fieldset class="sr-choice"><legend>Starts</legend>
              <label><input type="radio" name="start" value="now" checked> Now</label>
              <label><input type="radio" name="start" value="at"> At a set time</label></fieldset>
            <div class="field" data-pr-at hidden><label for="pr-starts">Start (your time)</label><input id="pr-starts" name="startsAt" type="datetime-local"></div>
            <div class="field"><label for="pr-ends">End (optional, at most 90 days)</label><input id="pr-ends" name="endsAt" type="datetime-local"></div>
            <p class="small-print" data-pr-est aria-live="polite"></p>
            <button class="btn small" type="submit">Start sale</button><p class="msg" role="status"></p></form>`}`}`;
      }

      // Redraws from the server's answer. Unless this follows a save (note), what the person already typed while it
      // loaded stays, with the cursor where it was: the first draw shows before the answer arrives.
      async function load(note) {
        const res = await api(`${base}/pricing`);
        if (!el.isConnected) return;
        const typed = note ? [] : [...el.querySelectorAll("input[id], textarea[id]")].filter((i) => i.type !== "checkbox" && i.type !== "radio" && i.value !== i.defaultValue).map((i) => [i.id, i.value]);
        const focused = !note && el.contains(document.activeElement) && document.activeElement.id;
        draw(res.ok ? res.data : null);
        for (const [id, value] of typed) { const i = el.querySelector(`#${CSS.escape(id)}`); if (i) i.value = value; }
        if (focused) { const i = el.querySelector(`#${CSS.escape(focused)}`); if (i) i.focus(); }
        if (note) window.GS.say($("[data-pr-price]", el), note);
      }

      el.addEventListener("input", (ev) => {
        const f = ev.target.closest("[data-pr-sale]");
        if (!f) return;
        const pct = f.mode.value === "percent";
        $("[data-pr-unit]", f).textContent = pct ? "(1 to 90 percent)" : "(in dollars)";
        f.off.max = pct ? "90" : String((ctx.product.product.priceCents || 0) / 100);
        f.off.step = pct ? "1" : "0.01";
        $("[data-pr-at]", f).hidden = f.start.value !== "at";
        const v = Number(f.off.value), list = ctx.product.product.priceCents || 0;
        const est = v > 0 ? Math.max(50, Math.round(pct ? list * (1 - v / 100) : list - v * 100)) : 0;
        $("[data-pr-est]", f).textContent = est ? `Estimate: buyers would pay about ${money(est)}. The store works out the real price at checkout.` : "";
      });

      el.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target, btn = $("button[type=submit]", f);
        let req;
        if (f.matches("[data-pr-price]")) {
          const c = Math.round(Number(f.price.value) * 100);
          req = () => api(base, { method: "PATCH", body: { priceCents: c } });
        } else if (f.matches("[data-pr-sale]")) {
          const pct = f.mode.value === "percent", v = Number(f.off.value);
          const body = { ...(pct ? { percentOff: Math.round(v) } : { amountOffCents: Math.round(v * 100) }),
            ...(f.start.value === "at" && f.startsAt.value ? { startsAt: iso(f.startsAt.value) } : {}), ...(f.endsAt.value ? { endsAt: iso(f.endsAt.value) } : {}) };
          req = () => api(`${base}/sales`, { method: "POST", body });
        } else return;
        btn.disabled = true;
        const res = await req();
        btn.disabled = false;
        if (!res.ok) return window.GS.say(f, res.error.message, true);
        await ctx.reload();
        load(f.matches("[data-pr-price]") ? "Price saved." : "Sale saved.");
      });

      el.addEventListener("click", async (ev) => {
        const end = ev.target.closest("[data-pr-end]");
        if (!end || !confirm("End this sale now? Orders already made keep their price.")) return;
        end.disabled = true;
        const res = await api(`${base}/sales/${encodeURIComponent(end.dataset.prEnd)}`, { method: "DELETE" });
        if (!res.ok) { end.disabled = false; return ctx.note(res.error.message, true); }
        await ctx.reload();
        load();
      });

      draw(undefined);
      load();
    }
  };
})();

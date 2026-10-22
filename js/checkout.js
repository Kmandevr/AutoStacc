// Checkout result page (/checkout?order=...): waits for the store to confirm the payment (it never trusts the
// address bar), asks the store to double-check with Stripe if confirmation is slow, and shows paid, failed, cancelled
// or still-waiting. In local test mode it also shows the mock payment buttons. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, fmtDate, api, cart, track } = window.GS;
  const root = $("#checkout-app");
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const orderId = params.get("order") || "";
  const mockSession = params.get("mock");

  const lines = (o) => `<ul class="order-lines">${o.items.map((i) => `<li><span>${escapeHTML(i.title)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</span><span>${cents(i.lineTotalCents, o.currency)}</span></li>`).join("")}
    <li><strong>Total</strong><strong>${cents(o.totalCents, o.currency)}</strong></li></ul>`;
  const state = (big, bad, body) => `<div class="panel appear wide checkout-state"><p class="big${bad ? " bad" : ""}">${big}</p>${body}</div>`;

  // The steps under the heading follow the order: paid moves on to Your Stacc; anything else stays on Payment.
  function journey(paid) {
    const steps = document.querySelectorAll("[data-journey] li");
    steps.forEach((li, i) => {
      const at = paid ? 2 : 1;
      li.classList.toggle("done", i < at || (paid && i === at));
      if (i === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }

  function show(o) {
    journey(o.status === "paid");
    if (o.status === "paid") {
      // The purchased pieces leave the cart; the success effects run once per order.
      o.items.forEach((i) => cart.remove(i.productId));
      let first = true;
      try { first = !sessionStorage.getItem("gs:done:" + o.id); sessionStorage.setItem("gs:done:" + o.id, "1"); } catch {}
      if (first) track("purchase_complete");
      // A split cart (AutoStacc's and creators' items) is paid one group at a time: say what's still waiting.
      const left = cart.items().length;
      const rest = left ? `<p class="msg" role="status">${left === 1 ? "1 item is" : `${left} items are`} still in your cart and need${left === 1 ? "s" : ""} their own checkout. <a href="/cart">Go to your cart</a></p>` : "";
      root.innerHTML = state("Payment confirmed", false, `<p>Stacc'd. Order <strong>${escapeHTML(o.id)}</strong> is yours, and a receipt is on its way to ${escapeHTML(o.email)}.</p>
        ${lines(o)}${rest}<div class="actions"><a class="btn" href="/library">Open Your Stacc</a><a class="btn ghost" href="/shop">Back to the store</a></div>
        <div data-guest-slot></div><div data-refund-slot></div>`);
      refundOption(o);
      guestNote(o);
    } else if (o.status === "failed") {
      root.innerHTML = state("Payment didn't go through", true, `<p>The payment didn't go through, so nothing is owed. Your cart is still here.</p>
        <div class="actions"><a class="btn" href="/cart">Back to cart</a></div>`);
    } else if (o.status === "cancelled") {
      root.innerHTML = state("Checkout cancelled", true, `<p>That checkout expired or was cancelled. Nothing was charged.</p><div class="actions"><a class="btn" href="/cart">Back to cart</a></div>`);
    } else if (o.status === "refunded") {
      root.innerHTML = state("Refunded", true, `<p>This order was refunded, so its files were removed from Your Stacc.</p>${lines(o)}
        <div class="actions"><a class="btn" href="/shop">Back to the store</a><a class="btn ghost" href="/library">Your Stacc</a></div>`);
    }
    // Move focus to the outcome so screen readers announce it.
    const big = $(".big", root);
    if (big) { big.tabIndex = -1; big.focus(); }
  }

  // Bought without an account: say how the files stay reachable, and offer an account with the order's email.
  async function guestNote(o) {
    const me = await api("/api/account");
    const slot = root.querySelector("[data-guest-slot]");
    if (!slot || !me.ok || me.data.user) return;
    slot.innerHTML = `<p class="small-print">Bought as a guest: your files open on this device, and the link in your receipt email opens them anywhere.
      <a href="/login#signup">Create an account with ${escapeHTML(o.email)}</a> to keep them in Your Stacc for good.</p>`;
  }

  // Why a paid order can't be refunded here, by the store's reason code (server/orders/refunds.js).
  const NO_REFUND = {
    expired: "The 14-day refund window for this order has closed.",
    free: "This order can't be refunded here.",
    downloaded: "Files from this order were downloaded, so it can't be refunded here.",
    disputed: "This order is in a payment dispute with your bank, so it can't be refunded here."
  };

  // Signed in or a guest with this order's key: a paid order can be refunded here within 14 days if nothing from it was
  // downloaded. The store decides (the status route says whether it is eligible); this only offers the button.
  async function refundOption(o) {
    let r = o.refund;
    if (!r) {
      const res = await api(`/api/orders/${encodeURIComponent(o.id)}`);
      r = res.ok ? res.data.order.refund : null;
    }
    const slot = $("[data-refund-slot]", root);
    if (!slot || !r) return;
    // Not refundable here: say why (the store's reason) and where to go instead.
    if (!r.eligible) {
      if (NO_REFUND[r.reason]) slot.innerHTML = `<p class="small-print">${NO_REFUND[r.reason]} Something wrong? <a href="/contact">Contact us</a>.</p>`;
      return;
    }
    slot.innerHTML = `<p class="small-print">Bought the wrong thing? <button class="link-btn" type="button" data-refund="${escapeHTML(o.id)}">Refund this order</button>
      until ${escapeHTML(fmtDate(r.until.slice(0, 10)))}, if you haven't downloaded anything from it.</p><p class="msg error" role="alert" hidden></p>`;
  }

  // Drawn once; later polls only change the message, so the panel doesn't re-glitch and screen readers hear each change once.
  function waiting(o, slow) {
    if (!$("[data-waiting]", root)) {
      root.innerHTML = state("Confirming your payment…", false, `<p class="msg pending" role="status" data-waiting></p>${lines(o)}
        <div class="actions" hidden data-slow><button class="btn ghost" type="button" data-recheck>Check again</button></div>`);
    }
    const text = slow
      ? "Still waiting for the payment to clear. That can take a minute. This page is safe to refresh, and we'll email you when it's done."
      : "Waiting for the payment to clear. Don't pay twice: this takes a few seconds.";
    const m = $("[data-waiting]", root);
    if (m.textContent !== text) m.textContent = text;
    $("[data-slow]", root).hidden = !slow;
  }

  // One check at a time: "Check again" while a check runs does nothing.
  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try { await pollOnce(); } finally { polling = false; }
  }

  // Never takes the return address as proof: only the store's answer moves the page on. If the store can't answer at
  // all, the page says so and offers another check instead of waiting forever.
  async function pollOnce() {
    let seen = null;
    for (let i = 0; i < 20; i++) {
      // After a few seconds without a webhook, ask the store to check with the payment provider directly.
      const res = i === 3
        ? await api(`/api/orders/${encodeURIComponent(orderId)}/reconcile`, { method: "POST", body: {} })
        : await api(`/api/orders/${encodeURIComponent(orderId)}`);
      if (res.status === 404) {
        root.innerHTML = state("Order not found", true, `<p>This device can't open that order. Log in with the account that placed it, or use the link in your receipt email.</p>
          <div class="actions"><a class="btn" href="/login?next=/library">Log in</a></div>`);
        return;
      }
      if (res.ok) {
        const o = res.data.order;
        if (o.status !== "pending") return show(o);
        seen = o;
        waiting(o, false);
      } else if (res.status === 0 && i > 2) {
        root.innerHTML = `<p class="msg error">We couldn't reach the store to check your order. Your payment is safe either way. <button class="link-btn" type="button" data-recheck>Check again</button></p>`;
        return;
      }
      await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 3000));
    }
    const last = await api(`/api/orders/${encodeURIComponent(orderId)}/reconcile`, { method: "POST", body: {} });
    if (last.ok && last.data.order.status !== "pending") return show(last.data.order);
    if (last.ok || seen) return waiting(last.ok ? last.data.order : seen, true);
    root.innerHTML = state("We couldn't confirm your payment yet", true, `<p class="msg error" role="alert">The store didn't answer just now. Your order is safe either way, and nothing is charged twice if you check again. If the payment went through, your receipt email is on its way.</p>
      <div class="actions"><button class="btn ghost" type="button" data-recheck>Check again</button></div>`);
    const big = $(".big", root);
    if (big) { big.tabIndex = -1; big.focus(); }
  }

  // Local test mode only: the store says it runs the mock provider, so offer the outcomes Stripe could report.
  async function mockPanel() {
    const me = await api("/api/account");
    if (!(me.ok && me.data.store.paymentProvider === "mock")) return poll();
    const res = await api(`/api/orders/${encodeURIComponent(orderId)}`);
    if (!res.ok) return poll();
    root.innerHTML = `<div class="panel wide mock-pay appear"><h2>Pay</h2>
      <p>Local test mode: no real money, no Stripe. Pick what the payment does.</p>${lines(res.data.order)}
      <div class="actions"><button class="btn" type="button" data-mock="paid">Pay (succeeds)</button><button class="btn ghost" type="button" data-mock="failed">Card declined</button><button class="btn ghost" type="button" data-mock="expired">Abandon checkout</button></div></div>`;
  }

  root.addEventListener("click", async (e) => {
    const recheck = e.target.closest("[data-recheck]");
    if (recheck) {
      if (recheck.disabled) return;
      recheck.disabled = true;
      await poll();
      recheck.disabled = false;
      return;
    }
    const refund = e.target.closest("[data-refund]");
    if (refund) {
      if (refund.disabled || !confirm("Refund this order? The money goes back to your card and the files leave Your Stacc.")) return;
      refund.disabled = true;
      const res = await api(`/api/orders/${encodeURIComponent(refund.dataset.refund)}/refund`, { method: "POST", body: {} });
      if (res.ok) return show(res.data.order);
      refund.disabled = false;
      const msg = $("[data-refund-slot] .msg", root);
      msg.hidden = false;
      msg.textContent = res.error.message;
      return;
    }
    const btn = e.target.closest("[data-mock]");
    if (!btn || btn.disabled) return;
    const buttons = root.querySelectorAll("[data-mock]");
    buttons.forEach((b) => (b.disabled = true));
    const res = await api("/api/dev/mock-payment", { method: "POST", body: { orderId, sessionId: mockSession, outcome: btn.dataset.mock } });
    if (!res.ok) {
      buttons.forEach((b) => (b.disabled = false));
      const old = $(".mock-error", root);
      if (old) old.remove();
      root.insertAdjacentHTML("afterbegin", `<p class="msg error mock-error" role="alert">${escapeHTML(res.error.message)}</p>`);
      return;
    }
    history.replaceState(null, "", `/checkout?order=${encodeURIComponent(orderId)}&status=return`);
    poll();
  });

  if (!/^ord_[a-z2-7]+$/.test(orderId)) {
    root.innerHTML = state("No order to show", true, `<p>This page shows your order after checkout. There's nothing to show right now.</p><div class="actions"><a class="btn" href="/cart">Go to cart</a></div>`);
  } else if (mockSession) mockPanel();
  else poll();
})();

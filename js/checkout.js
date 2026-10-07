// Checkout result page (/checkout?order=...): waits for the store to confirm the payment (it never trusts the
// address bar), asks the store to double-check with Stripe if confirmation is slow, and shows paid, failed, cancelled
// or still-waiting. In local test mode it also shows the mock payment buttons. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api, cart, track } = window.GS;
  const root = $("#checkout-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);
  const orderId = params.get("order") || "";
  const mockSession = params.get("mock");

  const lines = (o) => `<ul class="order-lines">${o.items.map((i) => `<li><span>${escapeHTML(i.title)}${i.quantity > 1 ? ` ×${i.quantity}` : ""}</span><span>${cents(i.lineTotalCents, o.currency)}</span></li>`).join("")}
    <li><strong>Total</strong><strong>${cents(o.totalCents, o.currency)}</strong></li></ul>`;
  const state = (big, bad, body) => `<div class="panel appear wide checkout-state"><p class="big${bad ? " bad" : ""}">${big}</p>${body}</div>`;

  function show(o) {
    if (o.status === "paid") {
      // The purchased pieces leave the cart; the success effects run once per order.
      o.items.forEach((i) => cart.remove(i.productId));
      let first = true;
      try { first = !sessionStorage.getItem("gs:done:" + o.id); sessionStorage.setItem("gs:done:" + o.id, "1"); } catch {}
      if (first) { sound("cinch"); track("purchase_complete"); }
      root.innerHTML = state("CINCHED.", false, `<p>Payment confirmed. Order <strong>${escapeHTML(o.id)}</strong> is yours, and a receipt is on its way to ${escapeHTML(o.email)}.</p>
        ${lines(o)}<div class="actions"><a class="btn" href="/library">Open my library</a><a class="btn ghost" href="/shop">Back to the shop</a></div>`);
    } else if (o.status === "failed") {
      root.innerHTML = state("PAYMENT FAILED", true, `<p>The payment didn't go through, so nothing is owed. Your cart is still here.</p>
        <div class="actions"><a class="btn" href="/cart">Back to cart</a></div>`);
    } else if (o.status === "cancelled") {
      root.innerHTML = state("CHECKOUT CANCELLED", true, `<p>That checkout expired or was cancelled. Nothing was charged.</p><div class="actions"><a class="btn" href="/cart">Back to cart</a></div>`);
    } else if (o.status === "refunded") {
      root.innerHTML = state("REFUNDED", true, `<p>This order was refunded, so its files left your library.</p>${lines(o)}`);
    }
    // Move focus to the outcome so screen readers announce it.
    const big = $(".big", root);
    if (big) { big.tabIndex = -1; big.focus(); }
  }

  function waiting(o, slow) {
    root.innerHTML = state("STITCHING…", false, `<p class="msg pending" role="status">${slow
      ? "Still waiting for the payment to clear. That can take a minute. This page is safe to refresh, and we'll email you when it's done."
      : "Waiting for the payment to clear. Don't pay twice: this takes a few seconds."}</p>${lines(o)}
      ${slow ? `<div class="actions"><button class="btn ghost" type="button" data-recheck>Check again</button></div>` : ""}`);
  }

  async function poll() {
    for (let i = 0; i < 20; i++) {
      // After a few seconds without a webhook, ask the store to check with the payment provider directly.
      const res = i === 3
        ? await api(`/api/orders/${encodeURIComponent(orderId)}/reconcile`, { method: "POST", body: {} })
        : await api(`/api/orders/${encodeURIComponent(orderId)}`);
      if (res.status === 404) {
        root.innerHTML = state("ORDER NOT FOUND", true, `<p>This device can't open that order. Log in with the account that placed it, or use the link in your receipt email.</p>
          <div class="actions"><a class="btn" href="/login?next=/library">Log in</a></div>`);
        return;
      }
      if (res.ok) {
        const o = res.data.order;
        if (o.status !== "pending") return show(o);
        waiting(o, false);
      } else if (res.status === 0 && i > 2) {
        root.innerHTML = `<p class="msg error">Signal lost while checking your order. Your payment is safe either way. <button class="link-btn" type="button" data-recheck>Check again</button></p>`;
        return;
      }
      await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 3000));
    }
    const last = await api(`/api/orders/${encodeURIComponent(orderId)}/reconcile`, { method: "POST", body: {} });
    if (last.ok && last.data.order.status !== "pending") return show(last.data.order);
    if (last.ok) waiting(last.data.order, true);
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
    if (e.target.closest("[data-recheck]")) return poll();
    const btn = e.target.closest("[data-mock]");
    if (!btn || btn.disabled) return;
    root.querySelectorAll("[data-mock]").forEach((b) => (b.disabled = true));
    const res = await api("/api/dev/mock-payment", { method: "POST", body: { orderId, sessionId: mockSession, outcome: btn.dataset.mock } });
    if (!res.ok) { root.insertAdjacentHTML("afterbegin", `<p class="msg error">${escapeHTML(res.error.message)}</p>`); return; }
    history.replaceState(null, "", `/checkout?order=${encodeURIComponent(orderId)}&status=return`);
    poll();
  });

  if (!/^ord_[a-z2-7]+$/.test(orderId)) {
    root.innerHTML = state("NO ORDER HERE", true, `<p>This page shows an order after checkout. Nothing to show right now.</p><div class="actions"><a class="btn" href="/cart">Go to cart</a></div>`);
  } else if (mockSession) mockPanel();
  else poll();
})();

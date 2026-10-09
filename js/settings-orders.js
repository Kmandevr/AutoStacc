// Settings › Orders: every order with its status, items and total (/api/orders), a way back into a pending checkout,
// and the way to Your Stacc. Draws into #settings-app when js/settings.js opens this section. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, fmtDate, api, loginPath } = window.GS;
  const root = $('#settings-app[data-section="orders"]');
  if (!root) return;

  const STATUS = { paid: "paid", pending: "waiting for payment", failed: "payment failed", refunded: "refunded", cancelled: "cancelled" };
  const day = (iso) => fmtDate(iso.slice(0, 10));

  // A paid order can be refunded here until 14 days after paying, if nothing from it has been downloaded.
  const refundNote = (o) => {
    const r = o.refund;
    if (!r || o.status !== "paid") return "";
    if (r.eligible) return `<p class="small-print"><button class="link-btn" type="button" data-refund="${escapeHTML(o.id)}">Refund this order</button> Until ${day(r.until)}, as long as you haven't downloaded anything from it.</p>`;
    return r.reason === "downloaded" ? '<p class="small-print">Downloaded, so it can\'t be refunded here. Something wrong? <a href="/contact">Contact us</a>.</p>' : "";
  };

  const orders = (list) => (!list.length
    ? `<p>No orders yet. <a href="/shop">Browse the store</a>.</p>`
    : `<ul class="orders">${list.map((o) => `<li class="order status-${escapeHTML(o.status)}">
        <div class="order-head"><strong>${escapeHTML(o.id)}</strong><span>${day(o.createdAt)}</span><span class="order-status">${escapeHTML(STATUS[o.status] || o.status)}</span><span class="price">${cents(o.totalCents, o.currency)}</span></div>
        <ul class="order-items">${o.items.map((i) => `<li><a href="/shop/${escapeHTML(i.productId)}">${escapeHTML(i.title)}</a>${i.quantity > 1 ? ` ×${i.quantity}` : ""}</li>`).join("")}</ul>
        ${o.status === "pending" ? `<a href="/checkout?order=${encodeURIComponent(o.id)}">Check this order</a>` : ""}
        ${refundNote(o)}
      </li>`).join("")}</ul>`);

  async function draw(note) {
    const panel = $(".panel", root);
    const res = await api("/api/orders");
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    panel.innerHTML = `<h2 id="orders-title">Orders</h2>${note ? `<p class="msg" role="status">${escapeHTML(note)}</p>` : ""}
      ${res.ok ? orders(res.data.orders) : `<p class="msg error" role="alert">Couldn't load your orders: ${escapeHTML(res.error.message)}</p>`}
      <div class="actions"><a class="btn ghost" href="/library">Open Your Stacc</a></div>`;
  }

  addEventListener("gs:settings", () => {
    root.innerHTML = `<section class="panel wide appear" aria-labelledby="orders-title"><h2 id="orders-title">Orders</h2><p class="msg pending">Loading your orders…</p></section>`;
    draw();
  }, { once: true });

  root.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-refund]");
    if (!btn || btn.disabled) return;
    if (!confirm("Refund this order? The money goes back to your card and the files leave Your Stacc.")) return;
    btn.disabled = true;
    const res = await api(`/api/orders/${encodeURIComponent(btn.dataset.refund)}/refund`, { method: "POST", body: {} });
    if (!res.ok) { btn.disabled = false; return draw(res.error.message); }
    draw("Refunded. The money usually shows on your statement within 5 to 10 days.");
  });
})();

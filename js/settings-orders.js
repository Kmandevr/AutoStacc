// Settings › Orders: every order with its status, items and total (/api/orders), a way back into a pending checkout,
// and the way to Your Stacc. Draws into #settings-app when js/settings.js opens this section. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, fmtDate, api, loginPath } = window.GS;
  const root = $('#settings-app[data-section="orders"]');
  if (!root) return;

  const day = (iso) => fmtDate(iso.slice(0, 10));
  const short = (id) => id.slice(-6).toUpperCase();
  // What a customer needs to know about an order that didn't complete, in one plain sentence.
  const REASON = {
    failed: "The payment didn't go through. You weren't charged.",
    cancelled: "Checkout was left before paying. You weren't charged.",
    pending: "Waiting for payment."
  };
  const CHIP = { paid: "Paid", refunded: "Refunded" };

  // A paid order can be refunded here until 14 days after paying, if nothing from it has been downloaded.
  const refundNote = (o) => {
    const r = o.refund;
    if (!r || o.status !== "paid") return "";
    if (r.eligible) return `<p class="order-note"><button class="link-btn" type="button" data-refund="${escapeHTML(o.id)}">Refund this order</button> until ${day(r.until)}, if nothing has been downloaded.</p>`;
    return r.reason === "downloaded" ? '<p class="order-note">Downloaded, so it can\'t be refunded here. Something wrong? <a href="/contact">Contact us</a>.</p>' : "";
  };

  const titles = (o) => o.items.map((i) => `<a href="${escapeHTML(i.path || `/shop/${i.productId}`)}">${escapeHTML(i.title)}</a>${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");

  // A finished order (paid or refunded): what you got, when, what it cost, and what you can do about it.
  const done = (o) => `<li class="order status-${escapeHTML(o.status)}">
      <div class="order-main"><p class="order-titles">${titles(o)}</p><p class="order-meta">${day(o.createdAt)} · Order ${escapeHTML(short(o.id))}</p></div>
      <div class="order-side"><span class="price">${cents(o.totalCents, o.currency)}</span><span class="order-chip">${CHIP[o.status]}</span></div>
      ${refundNote(o)}
    </li>`;

  // An order that never completed: one quiet line with its reason, kept out of the way.
  const unfinished = (o) => `<li class="order order-quiet status-${escapeHTML(o.status)}">
      <span>${day(o.createdAt)} · ${titles(o)}</span>
      <span class="order-reason">${escapeHTML(REASON[o.status] || "Not completed.")}${o.status === "pending" ? ` <a href="/checkout?order=${encodeURIComponent(o.id)}">Check it</a>` : ""}</span>
    </li>`;

  const orders = (list) => {
    if (!list.length) return `<p>No orders yet. <a href="/shop">Browse the store</a>.</p>`;
    const finished = list.filter((o) => o.status === "paid" || o.status === "refunded");
    const waiting = list.filter((o) => o.status === "pending");
    const other = list.filter((o) => o.status !== "paid" && o.status !== "refunded" && o.status !== "pending");
    return `${waiting.length ? `<p class="msg" role="status">${waiting.length === 1 ? "1 order is" : `${waiting.length} orders are`} waiting for payment. <a href="/checkout?order=${encodeURIComponent(waiting[0].id)}">Check ${waiting.length === 1 ? "it" : "the latest"}</a>.</p>` : ""}
      ${finished.length ? `<ul class="orders">${finished.map(done).join("")}</ul>` : "<p>Nothing paid yet.</p>"}
      ${other.length ? `<details class="orders-other"><summary>Failed or cancelled (${other.length})</summary><ul class="orders">${other.map(unfinished).join("")}</ul></details>` : ""}`;
  };

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

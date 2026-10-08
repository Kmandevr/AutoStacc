// Account page: who you are, order history, and links to Your Stacc, settings (name and password: js/settings.js) and
// the admin for the owner. Orders come from /api/orders; [data-signout] is handled by js/account-nav.js. The server only
// serves this page to a signed-in visitor (server/pages/guard.js); this script still sends anyone else to log in.
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, fmtDate, api, loginPath } = window.GS;
  const root = $("#account-app");
  if (!root) return;

  const STATUS = { paid: "paid", pending: "waiting for payment", failed: "payment failed", refunded: "refunded", cancelled: "cancelled" };
  const day = (iso) => fmtDate(iso.slice(0, 10));

  function orders(list) {
    if (!list.length) return `<p>No orders yet. <a href="/shop">Browse the store</a>.</p>`;
    return `<ul class="orders">${list.map((o) => `<li class="order status-${escapeHTML(o.status)}">
        <div class="order-head"><strong>${escapeHTML(o.id)}</strong><span>${day(o.createdAt)}</span><span class="order-status">${escapeHTML(STATUS[o.status] || o.status)}</span><span class="price">${cents(o.totalCents, o.currency)}</span></div>
        <ul class="order-items">${o.items.map((i) => `<li><a href="/shop/${escapeHTML(i.productId)}">${escapeHTML(i.title)}</a>${i.quantity > 1 ? ` ×${i.quantity}` : ""}</li>`).join("")}</ul>
        ${o.status === "pending" ? `<a href="/checkout?order=${encodeURIComponent(o.id)}">Check this order</a>` : ""}
      </li>`).join("")}</ul>`;
  }

  function render(user, list) {
    root.innerHTML = `
      <div class="panel appear wide account-top">
        <h2>Hi, ${escapeHTML(user.name || "you")}</h2>
        <p>${escapeHTML(user.email)} · member since ${day(user.createdAt)}</p>
        <div class="actions"><a class="btn" href="/library">Open Your Stacc</a><a class="btn ghost" href="/settings">Settings</a>${user.admin ? `<a class="btn ghost" href="/admin">Admin</a>` : ""}<button class="btn ghost" type="button" data-signout>Log out</button></div>
      </div>
      <div class="panel wide"><h2>Orders</h2>${orders(list)}</div>`;
  }

  (async () => {
    const me = await api("/api/account");
    if (me.status === 503) { root.innerHTML = `<p class="msg error">Accounts are offline for maintenance. Try again soon.</p>`; return; }
    if (!me.ok) { root.innerHTML = `<p class="msg error">${escapeHTML(me.error.message)}</p>`; return; }
    if (!me.data.user) { location.replace(loginPath("/account")); return; }
    const res = await api("/api/orders");
    if (res.status === 401) { location.replace(loginPath("/account")); return; }
    render(me.data.user, res.ok ? res.data.orders : []);
    if (!res.ok) root.insertAdjacentHTML("afterbegin", `<p class="msg error">Couldn't load your orders: ${escapeHTML(res.error.message)}</p>`);
  })();
})();

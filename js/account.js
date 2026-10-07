// Account page: profile (name), password change, order history, sign out, and links to the library (and the admin for
// the owner). Profile, password and sign-out are Better Auth endpoints; orders come from /api/orders. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, fmtDate, api } = window.GS;
  const root = $("#account-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));

  const STATUS = { paid: "paid", pending: "waiting for payment", failed: "payment failed", refunded: "refunded", cancelled: "cancelled" };
  const day = (iso) => fmtDate(iso.slice(0, 10));

  function orders(list) {
    if (!list.length) return `<p>No orders yet. <a href="/shop">Find something to tear apart.</a></p>`;
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
        <div class="actions"><a class="btn" href="/library">Open my library</a>${user.admin ? `<a class="btn ghost" href="/admin">Admin</a>` : ""}<button class="btn ghost" type="button" data-signout>Log out</button></div>
      </div>
      <div class="panel wide"><h2>Orders</h2>${orders(list)}</div>
      <form class="panel" data-form="profile" novalidate>
        <h2>Profile</h2><p class="msg" role="status"></p>
        <div class="field"><label for="name">Name</label><input id="name" type="text" autocomplete="name" maxlength="80" required value="${escapeHTML(user.name || "")}"></div>
        <p class="small-print">Your email can't be changed here: your purchases are tied to it.</p>
        <div class="actions"><button class="btn" type="submit">Save</button></div>
      </form>
      <form class="panel" data-form="password" novalidate>
        <h2>Password</h2><p class="msg" role="status"></p>
        <div class="field"><label for="current">Current password</label><input id="current" type="password" autocomplete="current-password" maxlength="128" required></div>
        <div class="field"><label for="new">New password (10+ characters)</label><input id="new" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>
        <p class="small-print">Saving logs out your other devices.</p>
        <div class="actions"><button class="btn" type="submit">Change password</button></div>
      </form>`;
  }

  const say = (form, text, error) => {
    const m = $(".msg", form);
    m.className = "msg" + (error ? " error" : "");
    m.setAttribute("role", error ? "alert" : "status");
    m.textContent = text;
    if (error) sound("error");
  };

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    if (!form.checkValidity()) return say(form, "Check the fields above.", true);
    btn.disabled = true;
    const res = form.dataset.form === "profile"
      ? await api("/api/auth/update-user", { method: "POST", body: { name: $("#name", form).value.trim() } })
      : await api("/api/auth/change-password", { method: "POST", body: { currentPassword: $("#current", form).value, newPassword: $("#new", form).value, revokeOtherSessions: true } });
    btn.disabled = false;
    if (res.ok) {
      if (form.dataset.form === "password") form.reset();
      return say(form, "Saved.");
    }
    if (res.status === 401) return location.replace("/login?next=/account");
    say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.code === "INVALID_PASSWORD" ? "The current password is wrong." : res.error.message, true);
  });

  root.addEventListener("click", async (e) => {
    const out = e.target.closest("[data-signout]");
    if (!out) return;
    out.disabled = true;
    await api("/api/auth/sign-out", { method: "POST", body: {} });
    location.replace("/");
  });

  (async () => {
    const me = await api("/api/account");
    if (me.status === 503) { root.innerHTML = `<p class="msg error">Accounts are offline for maintenance. Try again soon.</p>`; return; }
    if (!me.ok) { root.innerHTML = `<p class="msg error">${escapeHTML(me.error.message)}</p>`; return; }
    if (!me.data.user) { location.replace("/login?next=/account"); return; }
    const res = await api("/api/orders");
    render(me.data.user, res.ok ? res.data.orders : []);
    if (!res.ok) root.insertAdjacentHTML("afterbegin", `<p class="msg error">Couldn't load your orders: ${escapeHTML(res.error.message)}</p>`);
  })();
})();

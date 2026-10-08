// Settings page: your name and your password, both Better Auth endpoints (/api/auth/update-user, /change-password).
// The email can't change (purchases are tied to it). The server only serves this page to a signed-in visitor
// (server/pages/guard.js); this script still sends anyone else to log in. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath } = window.GS;
  const root = $("#settings-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const toLogin = () => location.replace(loginPath("/settings"));

  function render(user) {
    root.innerHTML = `
      <form class="panel appear" data-form="profile" novalidate>
        <h2>Profile</h2><p class="msg" role="status"></p>
        <div class="field"><label for="name">Name</label><input id="name" type="text" autocomplete="name" maxlength="80" required value="${escapeHTML(user.name || "")}"></div>
        <p class="small-print">Your email (${escapeHTML(user.email)}) can't be changed here: your purchases are tied to it.</p>
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
    if (res.status === 401) return toLogin();
    say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.code === "INVALID_PASSWORD" ? "The current password is wrong." : res.error.message, true);
  });

  (async () => {
    const me = await api("/api/account");
    if (me.status === 503) { root.innerHTML = `<p class="msg error">Accounts are offline for maintenance. Try again soon.</p>`; return; }
    if (!me.ok) { root.innerHTML = `<p class="msg error">${escapeHTML(me.error.message)}</p>`; return; }
    if (!me.data.user) return toLogin();
    render(me.data.user);
  })();
})();

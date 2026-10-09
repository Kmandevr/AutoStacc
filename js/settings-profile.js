// Settings › Profile: your name (Better Auth's /api/auth/update-user) and the email your purchases are tied to, which
// can't change. Draws into #settings-app when js/settings.js opens this section. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, fmtDate, api, loginPath, say } = window.GS;
  const root = $('#settings-app[data-section="profile"]');
  if (!root) return;

  addEventListener("gs:settings", ({ detail: { user } }) => {
    root.innerHTML = `
      <form class="panel appear" data-form="profile" novalidate>
        <h2>Profile</h2><p class="msg" role="status"></p>
        <div class="field"><label for="name">Name</label><input id="name" type="text" autocomplete="name" maxlength="80" required value="${escapeHTML(user.name || "")}"></div>
        <div class="field"><label for="email">Email</label><input id="email" type="email" value="${escapeHTML(user.email)}" readonly aria-describedby="email-note"></div>
        <p class="small-print" id="email-note">Your email can't be changed: your Stacc is tied to it.${user.createdAt ? ` Member since ${fmtDate(user.createdAt.slice(0, 10))}.` : ""}</p>
        <div class="actions"><button class="btn" type="submit">Save name</button></div>
      </form>`;
  }, { once: true });

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest('[data-form="profile"]');
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    if (!form.checkValidity()) return say(form, "Enter your name.", true);
    btn.disabled = true;
    const res = await api("/api/auth/update-user", { method: "POST", body: { name: $("#name", form).value.trim() } });
    btn.disabled = false;
    if (res.ok) return say(form, "Saved.");
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.message, true);
  });
})();

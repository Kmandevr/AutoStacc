// Settings › Profile: your name (Better Auth's /api/auth/update-user) and your email. Changing the email
// (/api/account/email) needs the password and a click on the link sent to the new address; the link comes back here with
// ?email=<result>. Draws into #settings-app when js/settings.js opens this section. Needs js/util.js.
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
        <p class="small-print" id="email-note">${user.createdAt ? `Member since ${fmtDate(user.createdAt.slice(0, 10))}.` : ""}</p>
        <div class="actions"><button class="btn" type="submit">Save name</button></div>
      </form>
      <form class="panel appear" data-form="email" novalidate>
        <h2>Change email</h2><p class="msg" role="status">${escapeHTML(RESULTS[result] || "")}</p>
        <p class="small-print">We send a link to the new address; your email changes when you click it, and Your Stacc moves with your account. Your old address is told too.</p>
        <div class="field"><label for="new-email">New email</label><input id="new-email" type="email" autocomplete="email" maxlength="254" required></div>
        <div class="field"><label for="email-password">Your password</label><input id="email-password" type="password" autocomplete="current-password" maxlength="128" required></div>
        <div class="actions"><button class="btn" type="submit">Send confirmation link</button></div>
      </form>`;
  }, { once: true });

  const RESULTS = {
    changed: "Your email is changed. Use the new one to sign in.",
    expired: "That link expired. Ask for a new one below.",
    invalid: "That link didn't work. It may have been used already; ask for a new one below.",
    taken: "That email belongs to another account now, so nothing changed."
  };
  const result = new URLSearchParams(location.search).get("email");

  root.addEventListener("submit", async (e) => {
    const change = e.target.closest('[data-form="email"]');
    if (change) {
      e.preventDefault();
      const btn = $("button[type=submit]", change);
      if (btn.disabled) return;
      if (!change.checkValidity()) return say(change, "Enter the new email and your password.", true);
      btn.disabled = true;
      const res = await api("/api/account/email", { method: "POST", body: { email: $("#new-email", change).value.trim(), password: $("#email-password", change).value } });
      btn.disabled = false;
      if (res.status === 401) return location.replace(loginPath(location.pathname));
      if (!res.ok) return say(change, res.status === 429 ? "Too many tries. Wait a few minutes." : res.error.message, true);
      change.reset();
      return say(change, "Check the new inbox: click the link there within an hour to finish.");
    }
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

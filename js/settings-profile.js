// Settings › Profile: your name (Better Auth's /api/auth/update-user) and your email. Changing the email
// (/api/account/email) needs the password; the link sent to the new address opens this page with ?confirm=<token>, and
// pressing Confirm here (signed in as the same account) makes the change (/api/account/email/confirm). Draws into #settings-app when js/settings.js opens this section. Needs js/util.js (js/skeleton.js optional: placeholders and button spinners).
(function () {
  "use strict";

  const { $, escapeHTML, fmtDate, api, loginPath, say, skeleton: sk } = window.GS;
  const root = $('#settings-app[data-section="profile"]');
  if (!root) return;
  // A request button: GS.skeleton's spinner when it's loaded, otherwise just disabled while the request runs.
  const busy = (btn, on) => (sk ? sk.busy(btn, on) : (btn.disabled = on));

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
        <h2>Change email</h2><p class="msg" role="status"></p>
        ${confirmTo ? `<div class="panel" data-confirm-box><p>Make <strong>${escapeHTML(confirmTo)}</strong> your account's email? Your Stacc moves with it, and your other devices are logged out.</p>
          <div class="actions"><button class="btn" type="button" data-confirm-email>Confirm</button></div></div>` : ""}
        <p class="small-print">We send a link to the new address; your email changes when you click it, and Your Stacc moves with your account. Your old address is told too.</p>
        <div class="field"><label for="new-email">New email</label><input id="new-email" type="email" autocomplete="email" maxlength="254" required></div>
        <div class="field"><label for="email-password">Your password</label><input id="email-password" type="password" autocomplete="current-password" maxlength="128" required></div>
        <div class="actions"><button class="btn" type="submit">Send confirmation link</button></div>
      </form>`;
  }, { once: true });

  // The link's token names the new address (it was mailed there); the store checks everything else.
  const token = new URLSearchParams(location.search).get("confirm") || "";
  const confirmTo = (() => {
    try { return JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).n || ""; } catch { return ""; }
  })();

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-confirm-email]");
    if (!btn || btn.disabled) return;
    const form = btn.closest("form");
    busy(btn, true);
    const res = await api("/api/account/email/confirm", { method: "POST", body: { t: token } });
    if (res.status === 401) return location.replace(loginPath(location.pathname + location.search));
    if (!res.ok) { busy(btn, false); return say(form, res.error.message, true); }
    history.replaceState(null, "", location.pathname);
    $("[data-confirm-box]", form).remove();
    $("#email", root).value = res.data.email;
    say(form, "Your email is changed. Use the new one to log in.");
  });

  root.addEventListener("submit", async (e) => {
    const change = e.target.closest('[data-form="email"]');
    if (change) {
      e.preventDefault();
      const btn = $("button[type=submit]", change);
      if (btn.disabled) return;
      if (!change.checkValidity()) return say(change, "Enter the new email and your password.", true);
      busy(btn, true);
      const res = await api("/api/account/email", { method: "POST", body: { email: $("#new-email", change).value.trim(), password: $("#email-password", change).value } });
      busy(btn, false);
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
    busy(btn, true);
    const res = await api("/api/auth/update-user", { method: "POST", body: { name: $("#name", form).value.trim() } });
    busy(btn, false);
    if (res.ok) return say(form, "Saved.");
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.message, true);
  });
})();

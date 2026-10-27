// Settings › Profile: your name (Better Auth's /api/auth/update-user), an optional private phone number
// (/api/account/phone), your community username (/api/community/me, while the community is on) and your email. Changing the email
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
        <div class="field"><label for="phone">Phone <span class="small-print">(optional, private)</span></label><input id="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" aria-describedby="phone-note"></div>
        <p class="small-print" id="phone-note">Only for reaching you about your account. Never shown to anyone or shared. Leave it empty to remove it.</p>
        <div class="field"><label for="email">Email</label><input id="email" type="email" value="${escapeHTML(user.email)}" readonly aria-describedby="email-note"></div>
        <p class="small-print" id="email-note">${user.createdAt ? `Member since ${fmtDate(user.createdAt.slice(0, 10))}.` : ""}</p>
        <div class="actions"><button class="btn" type="submit">Save</button></div>
      </form>
      <form class="panel appear" data-form="username" novalidate hidden>
        <h2>Community username</h2><p class="msg" role="status"></p>
        <p class="small-print">What people see on your posts in the community. Brand and creator names are kept for their owners: to post as a project you're on the team of, pick it under "Post as" when you write.</p>
        <div class="field"><label for="username">Username</label><input id="username" type="text" autocomplete="username" maxlength="30" required aria-describedby="username-note"></div>
        <p class="small-print" id="username-note">3 to 30 letters, numbers, spaces, dots, hyphens or underscores. You can change it a few times a month.</p>
        <label class="check" data-age hidden><input type="checkbox" id="username-age"> I'm 16 or older</label>
        <div class="actions"><button class="btn" type="submit">Save username</button></div>
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
    loadExtras();
  }, { once: true });

  // The phone number and, while the community is on, the username (joining with it if there's none yet).
  let member = null;
  async function loadExtras() {
    const [phone, cm] = await Promise.all([api("/api/account/phone"), api("/api/community/me")]);
    if (phone.ok && phone.data.phone) $("#phone", root).value = phone.data.phone;
    if (!cm.ok || !cm.data.signedIn) return;
    member = cm.data.member;
    const form = $('[data-form="username"]', root);
    form.hidden = false;
    if (member) $("#username", form).value = member.displayName;
    else $("[data-age]", form).hidden = false;
  }

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
    const uname = e.target.closest('[data-form="username"]');
    if (uname) {
      e.preventDefault();
      const btn = $("button[type=submit]", uname);
      if (btn.disabled) return;
      const displayName = $("#username", uname).value.trim();
      if (!displayName) return say(uname, "Enter a username.", true);
      if (!member && !$("#username-age", uname).checked) return say(uname, "Confirm you're 16 or older to take part in the community.", true);
      busy(btn, true);
      const res = member ? await api("/api/community/me", { method: "PATCH", body: { displayName } })
        : await api("/api/community/me", { method: "PUT", body: { displayName, ageConfirmed: true } });
      busy(btn, false);
      if (res.status === 401) return location.replace(loginPath(location.pathname));
      if (!res.ok) return say(uname, res.status === 429 ? "That's enough username changes for now. Try again next month." : res.error.message, true);
      member = res.data.member;
      $("[data-age]", uname).hidden = true;
      return say(uname, "Saved. Your posts show the new name.");
    }
    const form = e.target.closest('[data-form="profile"]');
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    if (!form.checkValidity()) return say(form, "Enter your name.", true);
    busy(btn, true);
    const [res, phone] = await Promise.all([api("/api/auth/update-user", { method: "POST", body: { name: $("#name", form).value.trim() } }),
      api("/api/account/phone", { method: "PUT", body: { phone: $("#phone", form).value.trim() } })]);
    busy(btn, false);
    if (res.ok && phone.ok) { $("#phone", form).value = phone.data.phone || ""; return say(form, "Saved."); }
    if (res.ok && !phone.ok) return say(form, phone.status === 429 ? "Too many tries. Wait a minute." : phone.error.message, true);
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.message, true);
  });
})();

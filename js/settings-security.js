// Settings › Security: change your password (Better Auth's /api/auth/change-password, which signs out your other
// devices) and see every device signed in to your account, sign one out or all the others (/api/account/devices).
// Log out of this device is [data-signout], handled by js/account-nav.js. Draws into #settings-app when js/settings.js
// opens this section. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath, say } = window.GS;
  const root = $('#settings-app[data-section="security"]');
  if (!root) return;
  const toLogin = () => location.replace(loginPath(location.pathname));
  const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "unknown");

  const device = (d) => `
    <li class="device">
      <div class="device-text">
        <span class="device-name">${escapeHTML(d.device)}${d.current ? '<span class="device-here">This device</span>' : ""}</span>
        <span class="device-meta">Last active ${escapeHTML(when(d.lastActiveAt))}${d.ipAddress ? ` · ${escapeHTML(d.ipAddress)}` : ""} · signed in ${escapeHTML(when(d.signedInAt))}</span>
      </div>
      ${d.current ? '<button class="btn ghost" type="button" data-signout>Log out</button>'
        : `<button class="btn ghost" type="button" data-device="${escapeHTML(d.id)}" aria-label="Sign out ${escapeHTML(d.device)}, last active ${escapeHTML(when(d.lastActiveAt))}">Sign out</button>`}
    </li>`;

  async function drawDevices() {
    const panel = $("[data-devices]", root);
    const res = await api("/api/account/devices");
    if (res.status === 401) return toLogin();
    const list = $(".devices", panel);
    if (!res.ok) { list.innerHTML = ""; return say(panel, res.error.message, true); }
    const devices = res.data.devices;
    list.innerHTML = devices.map(device).join("");
    $("[data-sign-out-others]", panel).hidden = devices.length < 2;
  }

  addEventListener("gs:settings", () => {
    root.innerHTML = `
      <form class="panel appear" data-form="password" novalidate>
        <h2>Password</h2><p class="msg" role="status"></p>
        <div class="field"><label for="current">Current password</label><input id="current" type="password" autocomplete="current-password" maxlength="128" required></div>
        <div class="field"><label for="new">New password (10+ characters)</label><input id="new" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>
        <p class="small-print">Changing it signs out your other devices.</p>
        <div class="actions"><button class="btn" type="submit">Change password</button></div>
      </form>
      <section class="panel" data-devices aria-labelledby="devices-title">
        <h2 id="devices-title">Signed-in devices</h2><p class="msg" role="status"></p>
        <p class="small-print">Don't recognise one? Sign it out and change your password.</p>
        <ul class="devices"><li class="device"><span class="device-meta">Loading…</span></li></ul>
        <div class="actions"><button class="btn ghost" type="button" data-sign-out-others hidden>Sign out all other devices</button></div>
      </section>`;
    drawDevices();
  }, { once: true });

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest('[data-form="password"]');
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    if (!form.checkValidity()) return say(form, "Fill in both passwords; the new one needs 10 or more characters.", true);
    btn.disabled = true;
    const res = await api("/api/auth/change-password", { method: "POST", body: { currentPassword: $("#current", form).value, newPassword: $("#new", form).value, revokeOtherSessions: true } });
    btn.disabled = false;
    if (res.status === 401) return toLogin();
    if (!res.ok) return say(form, res.status === 429 ? "Too many tries. Wait a minute." : res.error.code === "INVALID_PASSWORD" ? "The current password is wrong." : res.error.message, true);
    form.reset();
    await drawDevices();
    say(form, "Password changed. Your other devices are signed out.");
  });

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-device], [data-sign-out-others]");
    if (!btn || btn.disabled) return;
    const panel = $("[data-devices]", root);
    btn.disabled = true;
    const res = btn.dataset.device
      ? await api(`/api/account/devices/${encodeURIComponent(btn.dataset.device)}/sign-out`, { method: "POST", body: {} })
      : await api("/api/account/devices/sign-out-others", { method: "POST", body: {} });
    btn.disabled = false;
    if (res.status === 401) return toLogin();
    if (!res.ok) return say(panel, res.error.message, true);
    // Redraw first, so the message is announced with the list already showing what changed.
    await drawDevices();
    say(panel, btn.dataset.device ? "That device is signed out." : "Every other device is signed out.");
  });
})();

// Settings › Security: two-step sign-in for admin accounts (authenticator-app codes; the store's switch
// auth.adminTwoFactor, off by default). Asks GET /api/account/two-factor and draws nothing when that is 404 (switch
// off, or not an admin), so other accounts see no change. Setting up: password, then the secret as text and as an
// otpauth:// link for the app, the backup codes once, and a code from the app to switch it on. Turning off: password
// and a code. All through Better Auth's /api/auth/two-factor/*. Draws after js/settings-security.js. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath, say } = window.GS;
  const root = $('#settings-app[data-section="security"]');
  if (!root) return;
  let panel;

  const field = (id, label, type, extra) =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" required ${extra}></div>`;
  const password = (id) => field(id, "Password", "password", 'autocomplete="current-password" maxlength="128"');
  const code = (id, label) => field(id, label, "text", 'autocomplete="one-time-code" inputmode="numeric" maxlength="20" spellcheck="false"');
  const intro = `<p>Logging in then asks for your password and a 6-digit code from an authenticator app on your phone, so a
    leaked password alone can't open this admin account.</p>`;

  const VIEWS = {
    off: () => `${intro}
      <form data-form="two-step-start" novalidate>
        ${password("tf-password")}
        <div class="actions"><button class="btn" type="submit">Set up two-step sign-in</button></div>
      </form>`,
    setup: ({ uri, backupCodes }) => {
      const secret = new URL(uri).searchParams.get("secret") || "";
      return `<ol class="small-print">
          <li>In your authenticator app, add an account and type this key (or, on this phone, <a href="${escapeHTML(uri)}">open it in the app</a>):
            <p><code data-secret>${escapeHTML(secret.replace(/(.{4})/g, "$1 ").trim())}</code></p></li>
          <li>Save these backup codes somewhere safe. Each signs you in once without the app. They're shown only now.
            <ul class="backup-codes">${backupCodes.map((c) => `<li><code>${escapeHTML(c)}</code></li>`).join("")}</ul></li>
          <li>Type the code the app shows to switch it on.</li>
        </ol>
        <form data-form="two-step-confirm" novalidate>
          ${code("tf-code", "Code from the app")}
          <div class="actions"><button class="btn" type="submit">Switch on</button></div>
        </form>`;
    },
    on: () => `<p><strong>On.</strong> Logging in asks for a code from your authenticator app (or a backup code).</p>
      <form data-form="two-step-off" novalidate>
        ${password("tf-off-password")}${code("tf-off-code", "Code from the app, or a backup code")}
        <div class="actions"><button class="btn ghost" type="submit">Switch off</button></div>
      </form>`
  };

  function draw(view, data, notice) {
    $(".two-step-body", panel).innerHTML = VIEWS[view](data);
    if (notice) say(panel, notice);
  }

  const ERRORS = {
    INVALID_PASSWORD: "That password isn't right.",
    INVALID_CODE: "That code isn't right. Type the newest one from the app.",
    INVALID_BACKUP_CODE: "That code isn't right.",
    TOTP_ALREADY_ENABLED: "Two-step sign-in is already on. Reload the page."
  };
  const errorText = (res) => (res.status === 429 ? "Too many tries. Wait a minute, then try again." : ERRORS[res.error.code] || res.error.message);

  addEventListener("gs:settings", async () => {
    const res = await api("/api/account/two-factor");
    if (!res.ok) return; // switched off, or not an admin: nothing to show
    panel = document.createElement("section");
    panel.className = "panel appear";
    panel.dataset.twoStep = "";
    panel.setAttribute("aria-labelledby", "two-step-title");
    panel.innerHTML = `<h2 id="two-step-title">Two-step sign-in</h2><p class="msg" role="status"></p><div class="two-step-body"></div>`;
    root.append(panel);
    draw(res.data.enabled ? "on" : "off");
  }, { once: true });

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest('[data-form^="two-step-"]');
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    if (!form.checkValidity()) return say(panel, "Fill in every field.", true);
    const value = (id) => $("#" + id, form).value;
    const kind = form.dataset.form;
    btn.disabled = true;
    const res = kind === "two-step-start"
      ? await api("/api/auth/two-factor/enable", { method: "POST", body: { password: value("tf-password") } })
      : kind === "two-step-confirm"
        ? await api("/api/auth/two-factor/verify-totp", { method: "POST", body: { code: value("tf-code").replace(/\s+/g, "") } })
        : await api("/api/auth/two-factor/disable", { method: "POST", body: { password: value("tf-off-password"), code: value("tf-off-code").replace(/\s+/g, "") } });
    btn.disabled = false;
    if (res.status === 401 && kind !== "two-step-confirm") return location.replace(loginPath(location.pathname));
    if (!res.ok) return say(panel, errorText(res), true);
    if (kind === "two-step-start") return draw("setup", { uri: res.data.totpURI, backupCodes: res.data.backupCodes }, "Add the key to your app, save the backup codes, then type a code.");
    if (kind === "two-step-confirm") return draw("on", null, "Two-step sign-in is on. Next time you log in, have your app ready.");
    draw("off", null, "Two-step sign-in is off. Logging in needs only your password again.");
  });
})();

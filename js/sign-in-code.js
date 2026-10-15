// Login page, the second step of two-step sign-in (admins who switched it on in Settings › Security; the store's
// switch auth.adminTwoFactor, off by default): after a right password js/auth.js sends gs:two-step on window, and this
// asks for the 6-digit code from the authenticator app, or a backup code, then goes on to where the person was going.
// Without the switch the store never asks, so nothing here runs. Needs js/util.js.
(function () {
  "use strict";

  const { $, api, say } = window.GS;
  const root = $("#auth-app");
  if (!root) return;
  let next = "/dashboard";

  const ERRORS = {
    INVALID_CODE: "That code isn't right. Type the newest one from the app.",
    INVALID_BACKUP_CODE: "That backup code isn't right, or was already used.",
    TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many wrong codes for this sign-in. Start again.",
    INVALID_TWO_FACTOR_COOKIE: "This sign-in has run out of time. Start again.",
    ACCOUNT_TEMPORARILY_LOCKED: "Too many wrong codes. Wait 15 minutes, then log in again."
  };

  addEventListener("gs:two-step", (e) => {
    next = (e.detail && e.detail.next) || next;
    root.innerHTML = `<form class="panel appear" data-form="two-step" novalidate>
        <h2>Enter your code</h2><p class="msg" id="code-msg" role="status"></p>
        <p>Open your authenticator app and type the 6-digit code it shows for AutoStacc. No phone with you? Type one of your backup codes instead; each works once.</p>
        <div class="field"><label for="code">Code</label><input id="code" name="code" type="text" required autocomplete="one-time-code" inputmode="numeric" maxlength="20" spellcheck="false" aria-describedby="code-msg"></div>
        <div class="actions"><button class="btn" type="submit">Continue</button></div>
        <p class="small-print"><a href="/login">Start again</a></p>
      </form>`;
    $("#code", root).focus();
  });

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest('[data-form="two-step"]');
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    const code = $("#code", form).value.replace(/\s+/g, "");
    if (!code) return say(form, "Type the code from your authenticator app.", true);
    btn.disabled = true;
    // Six digits: the app's code. Anything else: a backup code (they look like abcde-12345).
    const path = /^\d{6}$/.test(code) ? "/api/auth/two-factor/verify-totp" : "/api/auth/two-factor/verify-backup-code";
    const res = await api(path, { method: "POST", body: { code } });
    if (res.ok) { location.replace(next); return; }
    btn.disabled = false;
    say(form, res.status === 0 ? res.error.message : res.status === 429 ? "Too many tries. Wait a minute, then try again." : ERRORS[res.error.code] || res.error.message, true);
  });
})();

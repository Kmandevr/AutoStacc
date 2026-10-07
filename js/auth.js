// Login page: sign in, create an account, forgot password and set a new password, all through Better Auth's
// endpoints (/api/auth/*). Modes: #signup, #forgot, ?token=... (from the reset email), default sign in.
// ?next=/path returns there afterwards (same-site paths only). Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api } = window.GS;
  const root = $("#auth-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);
  const rawNext = params.get("next") || "";
  // Only paths on this site, never //other.host or javascript:.
  const next = /^\/(?!\/)[\w\-/?=&.%#]*$/.test(rawNext) ? rawNext : "/account";

  const field = (id, label, type, extra = "") =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" required ${extra}></div>`;
  const email = field("email", "Email", "email", 'autocomplete="email" inputmode="email" maxlength="254"');
  const msg = (text = "", kind = "") => `<p class="msg ${kind}" role="${kind === "error" ? "alert" : "status"}">${text}</p>`;

  const VIEWS = {
    signin: () => `<form class="panel appear" data-form="signin" novalidate>
        <h2>Log in</h2>${msg()}
        ${email}${field("password", "Password", "password", 'autocomplete="current-password" maxlength="128"')}
        <label class="check"><input type="checkbox" id="remember" checked> Keep me logged in on this device</label>
        <div class="actions"><button class="btn" type="submit">Log in</button></div>
        <p class="small-print"><a href="#forgot">Forgot your password?</a> · New here? <a href="#signup">Create an account</a></p>
      </form>`,
    signup: () => `<form class="panel appear" data-form="signup" novalidate>
        <h2>Create account</h2>${msg()}
        ${field("name", "Name", "text", 'autocomplete="name" maxlength="80"')}
        ${email}${field("password", "Password (10+ characters)", "password", 'autocomplete="new-password" minlength="10" maxlength="128"')}
        <div class="actions"><button class="btn" type="submit">Create account</button></div>
        <p class="small-print">Bought something as a guest? Use the same email: once you confirm it, those purchases join this account.</p>
        <p class="small-print">Have an account? <a href="#signin">Log in</a></p>
      </form>`,
    forgot: () => `<form class="panel appear" data-form="forgot" novalidate>
        <h2>Reset password</h2>${msg()}
        <p>Enter your account email and we'll send a reset link.</p>
        ${email}
        <div class="actions"><button class="btn" type="submit">Send reset link</button></div>
        <p class="small-print"><a href="#signin">Back to log in</a></p>
      </form>`,
    reset: () => `<form class="panel appear" data-form="reset" novalidate>
        <h2>New password</h2>${msg()}
        ${field("password", "New password (10+ characters)", "password", 'autocomplete="new-password" minlength="10" maxlength="128"')}
        <div class="actions"><button class="btn" type="submit">Save password</button></div>
      </form>`
  };

  function show(view, notice = "", kind = "") {
    root.innerHTML = VIEWS[view]();
    if (notice) $(".msg", root).outerHTML = msg(notice, kind);
    const first = $("input", root);
    if (first && view !== "signin") first.focus();
  }

  const route = () => {
    if (params.get("token")) return show("reset");
    if (params.get("error")) return show("forgot", "That link has expired or was already used. Ask for a new one.", "error");
    const view = location.hash.slice(1);
    show(VIEWS[view] && view !== "reset" ? view : "signin");
  };

  const value = (id) => ($("#" + id, root) || {}).value || "";
  function setBusy(form, on, label) {
    const btn = $("button[type=submit]", form);
    btn.disabled = on;
    btn.classList.toggle("busy", on);
    if (label) btn.textContent = label;
  }
  const say = (form, text, kind) => { $(".msg", form).outerHTML = msg(text, kind); if (kind === "error") sound("error"); };

  const ERRORS = {
    INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
    EMAIL_NOT_VERIFIED: "Confirm your email first. We just sent a fresh link.",
    PASSWORD_TOO_SHORT: "Use at least 10 characters.",
    INVALID_TOKEN: "That reset link has expired or was already used. Ask for a new one."
  };
  const errorText = (res) => res.status === 0 ? res.error.message
    : res.status === 429 ? "Too many tries. Wait a minute, then try again."
    : escapeHTML(ERRORS[res.error.code] || res.error.message);

  async function submit(form) {
    if (!form.checkValidity()) {
      [...form.querySelectorAll("input")].forEach((i) => i.setAttribute("aria-invalid", String(!i.checkValidity())));
      say(form, "Check the highlighted fields.", "error");
      const bad = form.querySelector(":invalid");
      if (bad) bad.focus();
      return;
    }
    const kind = form.dataset.form;
    setBusy(form, true);
    let res;
    if (kind === "signin") {
      res = await api("/api/auth/sign-in/email", { method: "POST", body: { email: value("email"), password: value("password"), rememberMe: $("#remember", form).checked } });
      if (res.ok) { sound("open"); location.replace(next); return; }
    } else if (kind === "signup") {
      res = await api("/api/auth/sign-up/email", { method: "POST", body: { name: value("name"), email: value("email"), password: value("password"), callbackURL: "/library?welcome=1" } });
      // Same answer whether or not the email already had an account (the owner of that email gets a note instead).
      if (res.ok) { setBusy(form, false); show("signin", `Check ${escapeHTML(value("email") || "your inbox")} for a link to confirm your email, then log in.`); return; }
    } else if (kind === "forgot") {
      res = await api("/api/auth/request-password-reset", { method: "POST", body: { email: value("email"), redirectTo: "/login" } });
      if (res.ok) { setBusy(form, false); say(form, "If that email has an account, a reset link is on its way. It works for one hour."); return; }
    } else if (kind === "reset") {
      res = await api("/api/auth/reset-password", { method: "POST", body: { newPassword: value("password"), token: params.get("token") } });
      if (res.ok) { history.replaceState(null, "", "/login"); show("signin", "Password saved. Log in with the new one."); return; }
    }
    setBusy(form, false);
    say(form, errorText(res), "error");
  }

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", e.target);
    if (!btn.disabled) submit(e.target);
  });
  addEventListener("hashchange", route);

  // Already signed in: go straight on.
  api("/api/account").then((res) => {
    if (res.ok && res.data.user && !params.get("token")) location.replace(next);
    else if (res.status === 503) root.innerHTML = msg("Accounts are offline for maintenance. Your purchases are safe; try again soon.", "error");
    else route();
  });
})();

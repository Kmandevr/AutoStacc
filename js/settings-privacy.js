// Settings › Privacy and data: download everything AutoStacc holds about you as a JSON file (POST /api/account/export)
// and, in a separate danger zone, delete your account (POST /api/account/delete: your email and password to confirm;
// orders stay as anonymous sales records, everything you own stops downloading). Draws into #settings-app when
// js/settings.js opens this section. Needs js/util.js (js/skeleton.js optional: placeholders and button spinners).
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath, say, skeleton: sk } = window.GS;
  const root = $('#settings-app[data-section="privacy"]');
  if (!root) return;
  // A request button: GS.skeleton's spinner when it's loaded, otherwise just disabled while the request runs.
  const busy = (btn, on) => (sk ? sk.busy(btn, on) : (btn.disabled = on));
  let email = "";
  const toLogin = () => location.replace(loginPath(location.pathname));

  addEventListener("gs:settings", ({ detail: { user } }) => {
    email = String(user.email).toLowerCase();
    root.innerHTML = `
      <section class="panel appear" data-export aria-labelledby="export-title">
        <h2 id="export-title">Download your data</h2><p class="msg" role="status"></p>
        <p>One file with your account, orders, library, follows, votes, email choices, signed-in devices and the emails we've sent you.</p>
        <div class="actions"><button class="btn" type="button" data-export-now>Download my data</button></div>
      </section>
      <section class="panel danger" data-delete aria-labelledby="delete-title">
        <h2 id="delete-title">Delete your account</h2><p class="msg" role="status"></p>
        <ul class="small-print">
          <li>You're signed out everywhere, and nothing you've Stacc'd can be downloaded again.</li>
          <li>Your follows, votes and email choices are deleted.</li>
          <li>Your orders are kept as anonymous sales records (for tax and refunds), no longer linked to you.</li>
          <li>This can't be undone. Download your data first if you want a copy.</li>
        </ul>
        <div class="actions"><button class="btn ghost" type="button" data-delete-start aria-expanded="false" aria-controls="delete-form">Delete account…</button></div>
        <form class="danger-confirm" id="delete-form" data-form="delete" novalidate hidden>
          <div class="field"><label for="delete-email">Type your email, ${escapeHTML(email)}</label><input id="delete-email" type="email" autocomplete="off" spellcheck="false" maxlength="254" required></div>
          <div class="field"><label for="delete-password">Your password</label><input id="delete-password" type="password" autocomplete="current-password" maxlength="128" required></div>
          <div class="actions"><button class="btn btn-danger" type="submit" disabled>Delete my account</button><button class="btn ghost" type="button" data-delete-cancel>Cancel</button></div>
        </form>
      </section>`;
  }, { once: true });

  async function exportData(btn) {
    const panel = $("[data-export]", root);
    busy(btn, true);
    say(panel, "Preparing your file…");
    const res = await api("/api/account/export", { method: "POST", body: {} });
    busy(btn, false);
    if (res.status === 401) return toLogin();
    if (!res.ok) return say(panel, res.status === 429 ? "You've downloaded it a few times already. Try again in an hour." : res.error.message, true);
    const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `autostacc-data-${String(res.data.exportedAt).slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say(panel, "Downloaded.");
  }

  const openDelete = (open) => {
    const form = $("[data-form=delete]", root);
    form.hidden = !open;
    $("[data-delete-start]", root).setAttribute("aria-expanded", String(open));
    if (open) $("#delete-email", form).focus();
    else { form.reset(); $("button[type=submit]", form).disabled = true; $("[data-delete-start]", root).focus(); }
  };

  root.addEventListener("click", (e) => {
    const exp = e.target.closest("[data-export-now]");
    if (exp && !exp.disabled) return exportData(exp);
    if (e.target.closest("[data-delete-start]")) return openDelete(true);
    if (e.target.closest("[data-delete-cancel]")) return openDelete(false);
  });

  // The button wakes up only once the email typed matches, so it can't be pressed by accident.
  root.addEventListener("input", (e) => {
    const form = e.target.closest("[data-form=delete]");
    if (!form) return;
    $("button[type=submit]", form).disabled = !($("#delete-email", form).value.trim().toLowerCase() === email && $("#delete-password", form).value);
  });

  const REFUSED = {
    invalid_password: "That password isn't right.",
    confirm: "Type your email exactly as shown.",
    owns_creator: "You still own a creator space in the Studio. Contact AutoStacc to close it or hand it over first.",
    admin_account: "Admin accounts can't be deleted here.",
    checkout_open: "You have a checkout in progress. Finish or leave it, then try again in half an hour.",
    rate_limited: "Too many tries. Wait a few minutes."
  };

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-form=delete]");
    if (!form) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    const panel = $("[data-delete]", root);
    busy(btn, true);
    const res = await api("/api/account/delete", { method: "POST", body: { confirm: $("#delete-email", form).value.trim(), password: $("#delete-password", form).value } });
    if (res.status === 401) return toLogin();
    if (!res.ok) {
      busy(btn, false);
      return say(panel, REFUSED[res.error.code] || res.error.message, true);
    }
    root.innerHTML = `<section class="panel appear" aria-labelledby="gone-title"><h2 id="gone-title" tabindex="-1">Your account is deleted</h2>
      <p class="msg" role="status">You're signed out everywhere. Thanks for being here.</p>
      <div class="actions"><a class="btn" href="/">Go to the home page</a></div></section>`;
    $("#gone-title", root).focus();
  });
})();

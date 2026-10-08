// Settings › Emails: switches for the optional emails (/api/account/email-preferences), each saved the moment it's
// flipped and put back if saving fails. Receipts and security emails have no switch: they always come. Draws into
// #settings-app when js/settings.js opens this section. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath, say } = window.GS;
  const root = $('#settings-app[data-section="email"]');
  if (!root) return;

  const KINDS = [
    ["newReleases", "New releases from projects you follow", "When a project you follow puts out something new."],
    ["platformNews", "AutoStacc news", "New features and the occasional announcement. Rarely."]
  ];

  const row = ([key, label, hint], on) => `
    <div class="setting-row">
      <label for="pref-${key}">${escapeHTML(label)}<span class="small-print">${escapeHTML(hint)}</span></label>
      <input class="switch" type="checkbox" role="switch" id="pref-${key}" data-pref="${key}"${on ? " checked" : ""}>
    </div>`;

  addEventListener("gs:settings", async () => {
    root.innerHTML = `<section class="panel appear" aria-labelledby="email-title"><h2 id="email-title">Emails</h2><p class="msg pending">Loading…</p></section>`;
    const panel = $(".panel", root);
    const res = await api("/api/account/email-preferences");
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    if (!res.ok) return say(panel, res.error.message, true);
    const prefs = res.data.preferences;
    panel.innerHTML = `<h2 id="email-title">Emails</h2><p class="msg" role="status"></p>
      ${KINDS.map((k) => row(k, prefs[k[0]])).join("")}
      <p class="small-print">Receipts, download links and security emails (confirming your email, resetting your password) always come.</p>`;
  }, { once: true });

  root.addEventListener("change", async (e) => {
    const box = e.target.closest("[data-pref]");
    if (!box) return;
    const panel = $(".panel", root);
    box.disabled = true;
    const res = await api("/api/account/email-preferences", { method: "PUT", body: { [box.dataset.pref]: box.checked } });
    box.disabled = false;
    if (res.status === 401) return location.replace(loginPath(location.pathname));
    if (!res.ok) {
      box.checked = !box.checked;
      return say(panel, res.error.message, true);
    }
    say(panel, "Saved.");
  });
})();

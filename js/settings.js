// Settings shell (settings.html, served at /settings and /settings/<section>): picks the section from the address,
// marks it in the section list, sets the breadcrumb, heading and title, and on phones shows the list at /settings and
// one section per page (computers show Profile beside the list there). It asks the store once who is signed in and
// hands the answer to the section scripts as a gs:settings event on window; each js/settings-<section>.js draws its
// section into #settings-app. The server only serves this page to a signed-in visitor (server/pages/guard.js); this
// script still sends anyone else to log in. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, loginPath } = window.GS;
  const layout = $("[data-settings]");
  if (!layout) return;
  const root = $("#settings-app", layout);

  const SECTIONS = {
    profile: ["Profile", "Your name, and the email your purchases are tied to."],
    security: ["Security", "Your password, and every device signed in to your account."],
    orders: ["Orders", "Every order and its status. What you own is in Your Stacc."],
    email: ["Emails", "Receipts and security emails always come. Everything else is up to you."],
    privacy: ["Privacy and data", "Download everything AutoStacc holds about you, or delete your account."]
  };
  const asked = (location.pathname.match(/^\/settings\/([a-z]+)\/?$/) || [])[1];
  let section = SECTIONS[asked] ? asked : null;
  // /settings on a computer opens Profile beside the list, at Profile's own address so a reload stays there.
  if (!section && !matchMedia("(max-width: 760px)").matches) {
    section = "profile";
    history.replaceState(history.state, "", "/settings/profile" + location.search);
  }
  layout.dataset.view = section ? "section" : "index";
  root.dataset.section = section || "profile";

  if (section) {
    const [name, intro] = SECTIONS[section];
    const link = $(`.settings-nav a[data-section="${section}"]`, layout);
    if (link) link.setAttribute("aria-current", "page");
    const title = $("[data-settings-title]");
    title.textContent = name;
    title.dataset.text = name;
    $("[data-settings-intro]").textContent = intro;
    $("[data-settings-crumb]").textContent = name;
    $("[data-settings-crumbs]").hidden = false;
    document.title = `${name} · Settings · AutoStacc`;
  }

  const fail = (text) => { root.innerHTML = `<p class="msg error" role="alert">${escapeHTML(text)}</p>`; };

  (async () => {
    const me = await api("/api/account");
    if (me.status === 503) return fail("Accounts are offline for maintenance. Try again soon.");
    if (!me.ok) return fail(me.error.message);
    if (!me.data.user) return location.replace(loginPath(location.pathname));
    // The section scripts load after this one; on a slow network the answer can beat them, so wait for the page.
    if (document.readyState === "loading") await new Promise((done) => addEventListener("DOMContentLoaded", done, { once: true }));
    root.innerHTML = "";
    dispatchEvent(new CustomEvent("gs:settings", { detail: { user: me.data.user, section: root.dataset.section } }));
  })();
})();

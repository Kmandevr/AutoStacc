// Account navigation on every page: asks the store once whether the visitor is signed in (GET /api/account), shows the
// matching set of [data-auth="in"] / [data-auth="out"] elements (the frames' links, the home page's actions), fills
// every [data-account-menu] slot with the account menu (a button with your initial that opens Dashboard, Your Stacc,
// Studio, Settings, the Control Center for an admin, and Log out), and handles every [data-signout] button. It only
// chooses what to show: the account pages are gated on the server (server/pages/guard.js) and every private API checks
// the session itself. A remembered hint ("this browser was signed in", never who) picks the set before the answer
// arrives; offline or with the store down the set stays as it is. While an admin impersonates a customer, the same
// answer says so and this loads the impersonation banner (js/impersonation.js, css/impersonation.css) on every page.
// Load it after the frame (js/layout.js or js/project-frame.js). Needs js/util.js.
(function () {
  "use strict";

  const { api, escapeHTML: e } = window.GS;
  const KEY = "gs:in";
  const remember = (on) => {
    try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  };
  const recalled = () => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  };

  function show(signedIn) {
    document.querySelectorAll("[data-auth]").forEach((el) => { el.hidden = (el.dataset.auth === "in") !== signedIn; });
  }

  // ---------- the account menu: a disclosure (button + list of links), closed by Escape, a click outside or Tab away
  const here = location.pathname.replace(/\/+$/, "") || "/";
  const link = (href, label) => {
    const on = here === href || (href !== "/" && here.startsWith(href + "/"));
    return `<li><a href="${href}"${on ? ' aria-current="page"' : ""}>${e(label)}</a></li>`;
  };
  function drawMenus(user) {
    const name = (user && (user.name || user.email)) || "";
    document.querySelectorAll("[data-account-menu]").forEach((slot, i) => {
      const id = `account-menu-${i}`;
      const wasOpen = Boolean(slot.querySelector('.account-button[aria-expanded="true"]'));
      slot.innerHTML = `
        <button class="account-button" type="button" aria-expanded="false" aria-controls="${id}">
          <span class="avatar" aria-hidden="true">${e(name.trim().charAt(0).toUpperCase() || "•")}</span>
          <span class="sr-only">Account${name ? `: ${e(name)}` : ""}</span>
        </button>
        <div class="account-panel" id="${id}" hidden>
          ${user ? `<p class="account-who"><strong>${e(user.name || "You")}</strong><span>${e(user.email)}</span></p>` : ""}
          <ul>
            ${link("/dashboard", "Dashboard")}${link("/library", "Your Stacc")}${link("/studio", "Studio")}${link("/settings", "Settings")}
            ${user && user.admin ? link("/admin", "Control Center") : ""}
          </ul>
          <button class="account-theme" type="button" data-theme-cycle></button>
          <button class="account-signout" type="button" data-signout>Log out</button>
        </div>`;
      dispatchEvent(new Event("gs:theme-draw"));
      if (wasOpen) setOpen(slot, true);
    });
  }
  const setOpen = (slot, open, refocus = false) => {
    const btn = slot.querySelector(".account-button"), panel = slot.querySelector(".account-panel");
    if (!btn || !panel) return;
    btn.setAttribute("aria-expanded", String(open));
    // Closing plays a short fade (css/layout.css .closing) before the panel is hidden; reduced motion hides it at once.
    if (!open && !panel.hidden && matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      panel.classList.add("closing");
      setTimeout(() => { panel.classList.remove("closing"); if (btn.getAttribute("aria-expanded") === "false") panel.hidden = true; }, 140);
    } else panel.hidden = !open;
    if (refocus) btn.focus();
  };
  const closeAll = (except) => document.querySelectorAll("[data-account-menu]").forEach((s) => s !== except && setOpen(s, false));
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".account-button");
    const slot = ev.target.closest("[data-account-menu]");
    closeAll(slot);
    if (btn) setOpen(slot, btn.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const open = document.querySelector('[data-account-menu] .account-button[aria-expanded="true"]');
    if (open) setOpen(open.closest("[data-account-menu]"), false, true);
  });
  document.addEventListener("focusin", (ev) => closeAll(ev.target.closest("[data-account-menu]")));

  const signedInBefore = recalled();
  show(signedInBefore);
  if (signedInBefore) drawMenus(null);
  api("/api/account").then((res) => {
    if (res.data && res.data.impersonation) loadBanner();
    if (!res.ok) return;
    const user = res.data.user;
    remember(Boolean(user));
    if (user) drawMenus(user);
    show(Boolean(user));
  });

  // The banner's own files, once per page. They come only when the store says this browser is impersonating.
  function loadBanner() {
    if (document.querySelector("script[data-impersonation]")) return;
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/css/impersonation.css">');
    const s = document.createElement("script");
    s.src = "/js/impersonation.js";
    s.dataset.impersonation = "";
    document.body.append(s);
  }

  // Log out from anywhere, then land on the public home page. If the store didn't confirm it, say so and stay: a
  // visitor on a shared computer must not walk away still signed in.
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-signout]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const res = await api("/api/auth/sign-out", { method: "POST", body: {} });
    if (!res.ok && res.status !== 401) {
      btn.disabled = false;
      btn.textContent = res.error.code === "impersonation_blocked" ? "Exit impersonation first (banner at the top)" : "Log out failed, try again";
      return;
    }
    remember(false);
    location.replace("/");
  });
})();

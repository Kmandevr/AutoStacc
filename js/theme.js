// Light/dark theme for AutoStacc: follows the device until the visitor picks one, then remembers it. Loaded in <head>
// (before the page paints, so there's no flash) on every page; its switch is any [data-theme-cycle] button (the
// account menu's item and one at the foot of every page). css/platform.css reads <html data-theme>.
// It also applies the sidebar's remembered width and the lighter-effects choice before paint, and settles aborted page-change animations (below), which must
// be handled before the page first paints, so it lives in the one script that runs that early. Needs nothing.
(function () {
  "use strict";

  // Page changes animate (css/core.css @view-transition). When the browser aborts one (a fast second navigation, the
  // next page not ready), it rejects the transition's promises at the first paint, before end-of-page scripts run;
  // handle them here so an aborted animation isn't an uncaught error.
  const settle = (t) => t && [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
  addEventListener("pagereveal", (ev) => settle(ev.viewTransition));
  addEventListener("pageswap", (ev) => settle(ev.viewTransition));
  // Some browsers also abort a transition before either event hands it over (a navigation that turns into a download,
  // the next page not opting in yet). That rejection is the browser's, not the page's, so it is settled here too; any
  // other unhandled rejection is still reported.
  addEventListener("unhandledrejection", (ev) => {
    if (ev.reason instanceof DOMException && /^Transition was aborted/.test(ev.reason.message)) ev.preventDefault();
  });

  const KEY = "as-theme";
  const root = document.documentElement;
  const MODES = ["auto", "light", "dark"];
  let mode = "auto";
  try { mode = MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : "auto"; } catch { /* storage blocked */ }
  const apply = () => (mode === "auto" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", mode));
  apply();
  // The sidebar's remembered width (js/layout.js, key "gs:side") is set here too, before the first paint, so pages
  // don't slide sideways when the frame appears.
  try { if (localStorage.getItem("gs:side") === "open") root.classList.add("side-open"); } catch { /* storage blocked: rail */ }
  // Lighter effects (owner, 2026-10-22: "drops heavy effects if the device can't handle it"): blur, see-through glass
  // and looping backdrops give way to near-solid surfaces in the same colours (html.fx-lite, css/platform.css). Decided
  // here, before the first paint, from what the device says about itself and from js/motion.js's frame check on an
  // earlier page (remembered as "as-fx"), so the look never changes while a page is open.
  const n = navigator;
  let lite = false;
  try { lite = localStorage.getItem("as-fx") === "lite"; } catch { /* not remembered */ }
  if (lite || (n.connection && n.connection.saveData) || (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2)
    || matchMedia("(prefers-reduced-transparency: reduce)").matches) root.classList.add("fx-lite");

  // The switch (owner, 2026-10-22): an item in the account menu (js/account-nav.js draws <button data-theme-cycle>)
  // and a button at the foot of every page; any [data-theme-cycle] cycles Auto, Light and Dark.
  const LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
  const draw = (btn) => {
    btn.dataset.mode = mode;
    btn.innerHTML = `<span class="theme-icon" aria-hidden="true"></span><span class="theme-label">Theme: ${LABEL[mode]}</span>`;
    btn.setAttribute("aria-label", `Theme: ${LABEL[mode]}${mode === "auto" ? " (follows your device)" : ""}. Change theme`);
  };
  const drawAll = () => document.querySelectorAll("[data-theme-cycle]").forEach(draw);
  addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest("[data-theme-cycle]");
    if (!btn) return;
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try { localStorage.setItem(KEY, mode); } catch { /* not remembered */ }
    apply();
    drawAll();
  });
  addEventListener("gs:theme-draw", drawAll);
  addEventListener("DOMContentLoaded", () => {
    const foot = document.querySelector(".site-footer .footer-legal, .site-footer");
    if (foot) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-switch theme-foot";
      btn.setAttribute("data-theme-cycle", "");
      foot.append(btn);
    }
    drawAll();
  });
})();

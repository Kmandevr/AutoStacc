// Light/dark theme for AutoStacc: follows the device until the visitor picks one, then remembers it. Loaded in <head>
// (before the page paints, so there's no flash) on every page; draws its switch into the top bar once the page is
// ready. css/platform.css reads <html data-theme>. It also settles aborted page-change animations (below), which must
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

  addEventListener("DOMContentLoaded", () => {
    const tools = document.querySelector(".topbar-tools");
    if (!tools) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-switch";
    const LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
    const draw = () => {
      btn.dataset.mode = mode;
      btn.innerHTML = `<span class="theme-icon" aria-hidden="true"></span><span class="theme-label">${LABEL[mode]}</span>`;
      btn.setAttribute("aria-label", `Theme: ${LABEL[mode]}${mode === "auto" ? " (follows your device)" : ""}. Change theme`);
    };
    draw();
    btn.addEventListener("click", () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem(KEY, mode); } catch { /* not remembered */ }
      apply();
      draw();
    });
    tools.prepend(btn);
  });
})();

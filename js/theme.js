// Light/dark theme for AutoStacc: follows the device until the visitor picks one, then remembers it. Loaded in <head>
// (before the page paints, so there's no flash) on every page; draws its switch into the top bar once the page is
// ready. css/platform.css reads <html data-theme>. Needs nothing.
(function () {
  "use strict";

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

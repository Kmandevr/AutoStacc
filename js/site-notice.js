// The store's notice on every page (Control Center › Settings › Switches; GET /api/site-status): one short line at the
// top of the page when the owner set one, nothing otherwise (or when the store can't answer). Text only, never HTML.
// Needs js/util.js; loads after js/layout.js or js/project-frame.js.
(function () {
  "use strict";

  const GS = window.GS;
  const main = document.querySelector("main");
  if (!GS || !GS.api || !main) return;

  GS.api("/api/site-status").then((res) => {
    const text = res.ok && typeof res.data.notice === "string" ? res.data.notice.trim() : "";
    if (!text) return;
    const bar = document.createElement("p");
    bar.className = "site-notice";
    bar.setAttribute("role", "status");
    bar.textContent = text;
    main.prepend(bar);
  });
})();

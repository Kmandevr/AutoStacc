// Impersonation banner, on every page while an admin is impersonating a customer (loaded by js/account-nav.js only
// then). A fixed hazard-striped bar names the customer and the admin, shows the time left and an Exit button, and a
// frame marks the whole window. It re-checks the store every minute and when the tab comes back: if the
// impersonation ended (exit elsewhere, time limit, idle, sign-out) the bar turns into an "ended" warning with a way
// back, so the page never silently changes whose view it is. The server enforces everything; this only makes it
// impossible to miss. Needs js/util.js and css/impersonation.css.
(function () {
  "use strict";

  const { escapeHTML: e, api } = window.GS;
  if (document.getElementById("impersonation-bar")) return;
  const bar = document.createElement("div");
  bar.id = "impersonation-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Impersonation");
  document.body.prepend(bar);
  document.body.classList.add("is-impersonating");
  const baseTitle = document.title.replace(/^\[[A-Z ]+\] /, "");
  // The page starts below the bar, however tall it wraps on a phone.
  const fit = () => document.body.style.setProperty("--imp-h", `${bar.offsetHeight + 8}px`);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);

  const minutesLeft = (iso) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));

  function draw(imp) {
    if (imp && imp.active) {
      const test = imp.purpose === "test-purchase";
      document.title = `[IMPERSONATING] ${baseTitle}`;
      bar.className = "imp-active";
      bar.innerHTML = `<strong class="imp-flag">⚠ Impersonating customer${test ? " · test purchase" : ""}</strong>
        <span>Customer: <b>${e(imp.customer.email)}</b></span><span>Admin: <b>${e(imp.admin.email)}</b></span>
        <span class="imp-time">ends in ${minutesLeft(imp.expiresAt)} min at most (${e(String(imp.idleMinutes))} min idle)</span>
        <button type="button" class="imp-exit" data-imp-exit>Exit impersonation</button>`;
    } else {
      document.title = `[IMPERSONATION ENDED] ${baseTitle}`;
      bar.className = "imp-ended";
      bar.innerHTML = `<strong class="imp-flag">⚠ Impersonation ended${imp && imp.reason ? ` (${e(imp.reason)})` : ""}</strong>
        <span>This page may still show the customer's view. Nothing more can be done as them.</span>
        <button type="button" class="imp-exit" data-imp-exit>Return to admin</button>`;
    }
  }

  async function refresh() {
    // Marked as the banner's poll, so it doesn't keep an idle impersonation alive.
    const res = await api("/api/account", { headers: { "X-Impersonation-Poll": "1" } });
    if (res.status === 0) return; // offline: keep showing what we know
    draw(res.ok ? res.data.impersonation : null);
  }

  bar.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-imp-exit]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "Exiting…";
    const res = await api("/api/impersonation/exit", { method: "POST", body: {} });
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = "Exit failed, try again";
      return;
    }
    location.replace(res.data.redirect || "/admin/daily#customers");
  });

  draw({ active: false, reason: "checking" });
  fit();
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();

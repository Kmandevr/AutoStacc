// Preloads the next page for browsers without Speculation Rules (the rest read speculation-rules.json, named by the
// Speculation-Rules header in _headers): hovering or pressing a same-origin link adds one <link rel=prefetch>, with
// the rules file's exclusions (API, media, logout, admin, cart, checkout, query strings, [download], [data-no-prefetch]).
// Skipped when the visitor saves data. Needs nothing.
(function () {
  const S = window.HTMLScriptElement;
  if (S && typeof S.supports === "function" && S.supports("speculationrules")) return;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ""))) return;
  const SKIP = /^\/(api|media)\/|^\/(logout|cart)$|^\/(admin|checkout)(\/|$)/;
  const done = new Set();
  let timer = 0;

  // The address to preload for a link, or null when it must not be preloaded.
  function target(a) {
    if (!a || a.matches("[download], [data-no-prefetch]")) return null;
    const href = a.getAttribute("href");
    if (!href || href.includes("?")) return null;
    let u;
    try { u = new URL(href, location.href); } catch { return null; }
    if (u.origin !== location.origin || u.search || SKIP.test(u.pathname) || u.pathname === location.pathname) return null;
    return u.origin + u.pathname;
  }

  function warm(a) {
    const url = target(a);
    if (!url || done.has(url)) return;
    done.add(url);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    document.head.appendChild(link);
  }

  const linkOf = (ev) => (ev.target && ev.target.closest ? ev.target.closest("a[href], area[href]") : null);
  // Hover waits a moment (a pointer passing over is not intent); a press or keyboard focus preloads at once.
  document.addEventListener("mouseover", (ev) => {
    const a = linkOf(ev);
    clearTimeout(timer);
    if (a) timer = setTimeout(() => warm(a), 120);
  });
  document.addEventListener("mouseout", () => clearTimeout(timer));
  document.addEventListener("pointerdown", (ev) => warm(linkOf(ev)), { passive: true });
  document.addEventListener("focusin", (ev) => warm(linkOf(ev)));
})();

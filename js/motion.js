// Motion: scroll reveals, typed [data-type] text, the occasional glitch "zap", and ambient effects that keep their place across pages.
// Needs nothing; load it after the scripts that render content. Does nothing for reduced-motion users.
(function () {
  "use strict";

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  const main = document.querySelector("main");
  if (!main) return;

  const root = document.documentElement;
  // css/base.css only hides .reveal items under .motion, so the page stays visible if this script never runs.
  root.classList.add("motion");
  // Ambient loops run on wall-clock time, so they carry on from where they were when you change page.
  root.style.setProperty("--clock", `${-(Date.now() % 9000)}ms`);

  const ITEMS = ".section-head, .card, .news-item, .show, .about .art, .loop li, .newsletter form, .listen, .bio, .panel";
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      seen.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  function watch(scope) {
    scope.querySelectorAll(ITEMS).forEach((el) => {
      if (el.classList.contains("reveal")) return;
      // Stagger siblings (cards in a row, rows in a list), capped so long lists don't lag.
      el.style.setProperty("--i", Math.min([...el.parentElement.children].indexOf(el), 5));
      el.classList.add("reveal");
      seen.observe(el);
    });
  }

  watch(main);

  // Every 6 to 14 seconds one visible title glitches for a moment.
  const ZAP = ".section-head h2, .bio h2, .panel h2, .cover span, .loop strong, .logo";
  function zap() {
    const visible = [...document.querySelectorAll(ZAP)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
    const el = visible[Math.floor(Math.random() * visible.length)];
    if (el && !document.hidden) {
      el.classList.add("zap");
      el.addEventListener("animationend", () => el.classList.remove("zap"), { once: true });
    }
    setTimeout(zap, 6000 + Math.random() * 8000);
  }
  setTimeout(zap, 4000);

  // Typewriter: screen readers get the full text at once, the typed copy is hidden from them.
  document.querySelectorAll("[data-type]").forEach((el) => {
    const text = el.textContent.trim();
    const full = document.createElement("span");
    const typed = document.createElement("span");
    full.className = "sr-only";
    full.textContent = text;
    typed.setAttribute("aria-hidden", "true");
    el.replaceChildren(full, typed);

    let n = 0;
    setTimeout(function tick() {
      typed.textContent = text.slice(0, ++n);
      if (n < text.length) setTimeout(tick, 28 + Math.random() * 36);
    }, Number(el.dataset.type) || 0);
  });
})();

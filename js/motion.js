// Motion: reveals cards, news, shows and section titles as they scroll into view, and types out [data-type] text.
// Needs nothing; load it after the scripts that render content. Does nothing for reduced-motion users.
(function () {
  "use strict";

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  const main = document.querySelector("main");
  if (!main) return;

  // css/base.css only hides .reveal items under .motion, so the page stays visible if this script never runs.
  document.documentElement.classList.add("motion");

  const ITEMS = ".section-head, .card, .news-item, .show, .about .art, .loop li, .newsletter form";
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
  // Shop filters re-render the grid; animate the new cards in too.
  new MutationObserver((changes) => {
    changes.forEach((c) => c.target.nodeType === 1 && watch(c.target));
  }).observe(main, { childList: true, subtree: true });

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

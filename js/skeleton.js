// Loading placeholders for every feature (GS.skeleton): grey shapes like the coming content (cards, rows, lines, text,
// buttons, tiles, panels), aria-busy on the region while it loads (pending: until the region is first drawn), and a
// small spinner in a button waiting on a request.
// Styles in css/skeleton.css (shimmer and spin only without reduced motion). Needs js/util.js; features work without it.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;

  // Line widths vary a little so a list of placeholders reads as text, not as a grid of bars.
  // (classes sk-w0 to sk-w5, not inline styles, so no style attribute meets the CSP).
  const bar = (i, extra = "") => `<span class="sk-bar sk-line sk-w${i % 6}${extra}"></span>`;
  const lines = (n, from = 0) => Array.from({ length: n }, (_, i) => bar(from + i)).join("");

  // The inside of each shape; the wrapper (class "sk sk-<shape>") is added by html().
  const SHAPES = {
    card: (i) => `<span class="sk-bar sk-cover"></span><span class="sk-body">${bar(i, " sk-title")}${bar(i + 2)}<span class="sk-bar sk-btn"></span></span>`,
    row: (i) => `<span class="sk-bar sk-avatar"></span><span class="sk-body">${bar(i, " sk-title")}${bar(i + 3)}</span>`,
    line: (i) => bar(i),
    text: (i) => lines(3, i),
    button: () => `<span class="sk-bar sk-btn"></span>`,
    tile: () => `<span class="sk-bar sk-block"></span>`,
    panel: (i) => `${bar(i, " sk-title")}<span class="sk-bar sk-block"></span>`
  };

  // The container decides what a child must be: list items in a list, rows in a table body, otherwise plain blocks.
  const childTag = (el) => {
    const tag = el && el.tagName;
    if (tag === "UL" || tag === "OL") return "li";
    if (tag === "TBODY" || tag === "TABLE" || tag === "THEAD") return "tr";
    return "div";
  };

  // n placeholders of a shape as an HTML string, hidden from screen readers (show() adds the one spoken "Loading…").
  function html(shape = "line", n = 3, tag = "div") {
    const make = SHAPES[shape] ? shape : "line";
    let out = "";
    for (let i = 0; i < Math.max(1, n | 0); i++) {
      const inner = SHAPES[make](i);
      out += tag === "tr"
        ? `<tr class="sk-item" aria-hidden="true"><td colspan="99"><span class="sk sk-${make}">${inner}</span></td></tr>`
        : `<${tag} class="sk sk-${make}" aria-hidden="true">${inner}</${tag}>`;
    }
    return out;
  }

  const live = (tag) => tag === "tr"
    ? `<tr class="sk-live"><td class="sr-only">Loading…</td></tr>`
    : `<${tag} class="sk-live sr-only">Loading…</${tag}>`;

  // Fills a region with placeholders and marks it busy. The region keeps its own classes (its grid or list layout), so
  // the placeholders take the same slots the real content will.
  function show(el, shape, n) {
    if (!el) return el;
    const tag = childTag(el);
    el.setAttribute("aria-busy", "true");
    el.innerHTML = html(shape, n, tag) + live(tag);
    return el;
  }

  // The region is ready: no longer busy, and any placeholders still in it go. The caller writes the real content.
  function done(el) {
    if (!el) return el;
    el.removeAttribute("aria-busy");
    el.querySelectorAll(":scope > .sk, :scope > .sk-item, :scope > .sk-live").forEach((n) => n.remove());
    return el;
  }

  // A button waiting on a request: disabled, aria-busy and a leading spinner, label untouched; off undoes all three.
  function busy(button, on = true) {
    if (!button) return button;
    const spin = button.querySelector(":scope > .spin");
    button.disabled = !!on;
    button.classList.toggle("sk-busy", !!on);
    if (on) {
      button.setAttribute("aria-busy", "true");
      if (!spin) button.insertAdjacentHTML("afterbegin", `<span class="spin" aria-hidden="true"></span>`);
    } else {
      button.removeAttribute("aria-busy");
      if (spin) spin.remove();
    }
    return button;
  }

  // Placeholders in a region until whatever draws it writes or appends there (or empties it): then they and aria-busy go.
  // Callers need no clean-up of their own, so every section and tab gets them from one place.
  function pending(el, shape = "row", n = 3) {
    if (!el) return el;
    show(el, shape, n);
    const drawn = () => !el.querySelector(":scope > .sk-live") || [...el.children].some((c) => !c.matches(".sk, .sk-item, .sk-live"));
    const watch = new MutationObserver(() => { if (drawn()) { watch.disconnect(); done(el); } });
    watch.observe(el, { childList: true });
    return el;
  }

  GS.skeleton = { html, show, done, busy, pending };
})();

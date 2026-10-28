// The search bar in the header of every AutoStacc page (owner, 2026-10-27, #230; docs/search.md). Like a browser's
// address bar: as you type, a dropdown lists a few matches per group (Tags, Store, Creators & projects, Community,
// Help; js/search-sources.js), and Enter opens the full results page (/search). On a page with its own search (the
// store, Discover, New & upcoming, the community) the bar is scoped to it: it reads "Search Store", a chip switches
// it to All, Enter runs that page's own search (its form, hidden while the bar stands in for it), and Filters opens
// the page's own filters. Only one search bar is ever on screen. A full-width row on phones. Needs js/util.js,
// js/search-sources.js and the frame's top bar (js/layout.js).
(function () {
  "use strict";
  const GS = window.GS;
  const bar = document.querySelector("#site-header .topbar");
  if (!GS || !GS.searchSources || !bar || bar.querySelector(".site-search")) return;
  const { escapeHTML: e } = GS;
  const page = document.body.dataset.page || "";
  // Pages that keep their own search: what the scope is called, and where its own form is (drawn by its script).
  const SCOPES = { shop: "Store", discover: "Discover", explore: "New & upcoming", community: "Community" };
  const OWN = "form[data-search-form], form.cm-search";
  const scopeName = SCOPES[page] || (document.body.dataset.section === "community" ? "Community" : "");
  const own = () => [...document.querySelectorAll(OWN)].find((f) => !f.closest(".site-search, [hidden]"));

  const form = document.createElement("form");
  form.className = "site-search";
  form.setAttribute("role", "search");
  form.action = "/search";
  form.innerHTML = `
    ${scopeName ? `<button class="site-search-scope" type="button" aria-pressed="true" title="Search ${e(scopeName)} only, or all of AutoStacc">${e(scopeName)}</button>` : ""}
    <input class="site-search-input" type="search" name="q" maxlength="80" autocomplete="off" enterkeyhint="search" spellcheck="false"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="site-search-list" aria-label="Search">
    <button class="site-search-filters" type="button" hidden>Filters</button>
    <button class="site-search-go" type="submit"><span class="sr-only">Search</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <div class="site-search-list" id="site-search-list" role="listbox" aria-label="Suggestions" hidden></div>`;
  const brand = bar.querySelector(".topbar-brand");
  (brand || bar.firstElementChild).after(form);
  document.documentElement.classList.add("has-site-search");

  const input = form.querySelector(".site-search-input");
  const list = form.querySelector(".site-search-list");
  const chip = form.querySelector(".site-search-scope");
  const filters = form.querySelector(".site-search-filters");
  let scoped = Boolean(scopeName);
  const asked = new URLSearchParams(location.search).get("q");
  if (asked) input.value = asked.slice(0, 80);

  const draw = () => {
    input.placeholder = scoped ? `Search ${scopeName}` : "Search AutoStacc";
    if (chip) { chip.setAttribute("aria-pressed", String(scoped)); chip.textContent = scoped ? scopeName : "All"; }
    document.documentElement.classList.toggle("site-search-scoped", scoped);
    filters.hidden = !(scoped && document.querySelector("[data-open-filters]"));
  };
  draw();
  // The page's filters button appears after its script draws the page.
  new MutationObserver(() => { filters.hidden = !(scoped && document.querySelector("[data-open-filters]")); })
    .observe(document.body, { childList: true, subtree: true });
  if (chip) chip.addEventListener("click", () => { scoped = !scoped; draw(); close(); input.focus(); });
  filters.addEventListener("click", () => { const b = document.querySelector("[data-open-filters]"); if (b) b.click(); });

  // ---------- the dropdown (All) ----------
  let active = -1, timer = null, turn = 0;
  const options = () => [...list.querySelectorAll("[role=option]")];
  function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
  const mark = (i) => {
    const o = options();
    o.forEach((x, k) => x.setAttribute("aria-selected", String(k === i)));
    active = i;
    if (o[i]) { input.setAttribute("aria-activedescendant", o[i].id); o[i].scrollIntoView({ block: "nearest" }); }
  };
  async function suggest() {
    const q = input.value.trim();
    if (scoped || q.replace(/^#/, "").length < 2) return close();
    const mine = ++turn;
    const r = await GS.searchSources.find(q, 3);
    if (mine !== turn) return;
    const groups = [["Tags", r.tags.slice(0, 3)], ...GS.searchSources.GROUPS.map((g) => [g.label, r[g.key]])].filter(([, items]) => items.length);
    let k = 0;
    const row = (x) => `<a role="option" id="ss-opt-${k++}" aria-selected="false" class="site-search-opt" href="${e(x.path)}"><span>${e(x.title)}</span>${x.sub ? `<small>${e(x.sub)}</small>` : ""}</a>`;
    list.innerHTML = groups.map(([label, items]) => `<div class="site-search-group" role="group" aria-label="${e(label)}"><p aria-hidden="true">${e(label)}</p>${items.map(row).join("")}</div>`).join("")
      + row({ title: `See all results for “${q}”`, path: `/search?q=${encodeURIComponent(q)}` });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(suggest, 200); });
  input.addEventListener("keydown", (ev) => {
    const o = options();
    if (ev.key === "ArrowDown" && o.length) { ev.preventDefault(); mark((active + 1) % o.length); }
    else if (ev.key === "ArrowUp" && o.length) { ev.preventDefault(); mark((active - 1 + o.length) % o.length); }
    else if (ev.key === "Enter" && active >= 0 && o[active]) { ev.preventDefault(); location.href = o[active].href; }
    else if (ev.key === "Escape") { if (!list.hidden) close(); else input.blur(); }
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".site-search")) close(); });

  // ---------- Enter ----------
  form.addEventListener("submit", (ev) => {
    const q = input.value.trim();
    ev.preventDefault();
    if (!q) return;
    const f = scoped && own();
    if (f) {
      // The page's own search runs it, with its own results, filters and address.
      const box = f.querySelector("input[type=search], input[name=q]");
      if (box) box.value = q;
      if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit", { cancelable: true }));
      close();
      return;
    }
    location.href = scoped && page === "shop" ? `/shop?q=${encodeURIComponent(q)}` : `/search?q=${encodeURIComponent(q)}`;
  });
})();

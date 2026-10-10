// Workspace shell (GS.workspace, for js/studio-workspace.js and js/admin.js; docs/studio.md): a sidebar of sections
// (a drawer opened by "Sections" below 900px, never tabs), a compact header (title, status pill, save status, actions,
// a settings menu) and the body the caller draws sections into. It draws and navigates only; what a section holds and
// where it lives in the address is the caller's. Styles: css/workspace.css. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e } = window.GS;
  const SAVE = { saved: "All changes saved", saving: "Saving…", dirty: "Unsaved changes", error: "Couldn't save", "": "" };
  const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";
  const narrow = window.matchMedia ? window.matchMedia("(max-width: 900px)") : { matches: false, addEventListener() {} };
  let count = 0;

  const actionHTML = (a, i) => a.href
    ? `<a class="btn small${a.primary ? "" : " ghost"}" href="${e(a.href)}"${a.newTab ? ' target="_blank" rel="noopener"' : ""} data-ws-action="${i}">${e(a.label)}${a.newTab ? '<span class="sr-only"> (opens in a new tab)</span>' : ""}</a>`
    : `<button class="btn small${a.primary ? "" : " ghost"}" type="button" data-ws-action="${i}">${e(a.label)}</button>`;

  function mount(root, cfg) {
    const n = ++count;
    let current = cfg.current, actions = cfg.actions || [], menu = cfg.menu || [];
    const label = cfg.label || "Workspace";
    root.innerHTML = `<div class="ws" data-ws>
      <div class="ws-head">
        <button class="btn ghost small ws-open" type="button" data-ws-open aria-controls="ws-nav-${n}" aria-expanded="false">Sections</button>
        <div class="ws-titles"><p class="ws-label">${e(label)}</p><p class="ws-title" data-ws-title></p><p class="ws-sub" data-ws-sub${cfg.subtitle ? "" : " hidden"}>${e(cfg.subtitle || "")}</p></div>
        <span class="ws-status" data-ws-status hidden></span>
        <p class="ws-save" role="status" data-ws-save></p>
        <div class="ws-actions" data-ws-actions></div>
        <div class="ws-menu" data-ws-menu-wrap${menu.length ? "" : " hidden"}>
          <button class="btn ghost small" type="button" data-ws-menu aria-haspopup="menu" aria-expanded="false" aria-controls="ws-menu-${n}">Settings</button>
          <ul class="ws-popover" id="ws-menu-${n}" role="menu" aria-label="${e(label)} settings" hidden></ul>
        </div>
      </div>
      <div class="ws-frame">
        <nav class="ws-nav" id="ws-nav-${n}" aria-label="${e(label)} sections">
          <div class="ws-drawer-head"><strong>Sections</strong><button class="btn ghost small" type="button" data-ws-close>Close</button></div>
          ${cfg.groups.map((g) => `${g.label ? `<p class="ws-group">${e(g.label)}</p>` : ""}<ul class="ws-items">${g.items.map((it) => `<li>
            <button type="button" class="ws-item" data-ws-item="${e(it.key)}"><span>${e(it.label)}</span><span class="ws-badge" data-ws-badge${it.badge ? "" : " hidden"}>${e(it.badge || "")}</span></button></li>`).join("")}</ul>`).join("")}
        </nav>
        <div class="ws-scrim" data-ws-scrim hidden></div>
        <div class="ws-body" data-ws-body></div>
      </div></div>`;
    const ws = $("[data-ws]", root), nav = $(".ws-nav", ws), opener = $("[data-ws-open]", ws), scrim = $("[data-ws-scrim]", ws);
    const menuBtn = $("[data-ws-menu]", ws), pop = $(".ws-popover", ws);
    const body = $("[data-ws-body]", ws);
    const items = () => [...ws.querySelectorAll("[data-ws-item]")];

    // The drawer (phones): focus stays inside while it's open; Escape, the scrim, Close or a choice closes it.
    const isOpen = () => ws.classList.contains("ws-drawer-open");
    function openDrawer() {
      ws.classList.add("ws-drawer-open");
      scrim.hidden = false;
      opener.setAttribute("aria-expanded", "true");
      ($("[aria-current]", nav) || $(FOCUSABLE, nav)).focus();
    }
    function closeDrawer(refocus = true) {
      if (!isOpen()) return;
      ws.classList.remove("ws-drawer-open");
      scrim.hidden = true;
      opener.setAttribute("aria-expanded", "false");
      if (refocus) opener.focus();
    }
    narrow.addEventListener("change", () => closeDrawer(false));

    function closeMenu(refocus) {
      if (pop.hidden) return;
      pop.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
      if (refocus) menuBtn.focus();
    }
    function drawMenu() {
      pop.innerHTML = menu.map((m, i) => `<li role="none"><button type="button" role="menuitem" tabindex="-1" class="ws-menuitem${m.danger ? " danger" : ""}" data-ws-menuitem="${i}">${e(m.label)}</button></li>`).join("");
      $("[data-ws-menu-wrap]", ws).hidden = !menu.length;
    }

    // Focus goes to the open section's heading ([data-ws-heading], else its first heading) so screen readers hear it.
    function focusHeading() {
      const shown = (el) => el.getClientRects().length > 0;
      const h = [...body.querySelectorAll("[data-ws-heading]")].find(shown) || [...body.querySelectorAll("h2, h3")].find(shown) || body;
      if (!h.hasAttribute("tabindex")) h.tabIndex = -1;
      h.focus({ preventScroll: false });
    }

    function select(key, { focus = false, silent = false } = {}) {
      if (!items().some((b) => b.dataset.wsItem === key)) key = items()[0].dataset.wsItem;
      current = key;
      items().forEach((b) => (b.dataset.wsItem === key ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
      closeDrawer(false);
      if (!silent && cfg.onSelect) cfg.onSelect(key);
      if (focus) focusHeading();
      return key;
    }

    ws.addEventListener("click", (ev) => {
      const item = ev.target.closest("[data-ws-item]");
      if (item) return select(item.dataset.wsItem, { focus: true });
      if (ev.target.closest("[data-ws-open]")) return isOpen() ? closeDrawer() : openDrawer();
      if (ev.target.closest("[data-ws-close], [data-ws-scrim]")) return closeDrawer();
      if (ev.target.closest("[data-ws-menu]")) {
        if (!pop.hidden) return closeMenu(false);
        pop.hidden = false;
        menuBtn.setAttribute("aria-expanded", "true");
        const first = $("[role=menuitem]", pop);
        return first && first.focus();
      }
      const mi = ev.target.closest("[data-ws-menuitem]");
      if (mi) { closeMenu(true); return cfg.onAction && cfg.onAction(menu[Number(mi.dataset.wsMenuitem)].act); }
      const act = ev.target.closest("[data-ws-action]");
      const a = act && actions[Number(act.dataset.wsAction)];
      if (a && a.act && !a.href) cfg.onAction && cfg.onAction(a.act, act);
    });
    document.addEventListener("click", (ev) => { if (ws.isConnected && !ev.target.closest(".ws-menu")) closeMenu(false); });

    ws.addEventListener("keydown", (ev) => {
      if (!pop.hidden && ev.target.closest(".ws-popover")) {
        const list = [...pop.querySelectorAll("[role=menuitem]")], at = list.indexOf(document.activeElement);
        const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1 }[ev.key];
        if (to !== undefined) { ev.preventDefault(); list[(to + list.length) % list.length].focus(); }
        if (ev.key === "Escape" || ev.key === "Tab") { if (ev.key === "Escape") ev.preventDefault(); closeMenu(ev.key === "Escape"); }
        return;
      }
      if (!isOpen()) return;
      if (ev.key === "Escape") { ev.preventDefault(); return closeDrawer(); }
      if (ev.key !== "Tab") return;
      const f = [...nav.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    });

    const api = {
      body,
      select,
      current: () => current,
      setTitle(text) { $("[data-ws-title]", ws).textContent = text || ""; },
      setSubtitle(text) { const s = $("[data-ws-sub]", ws); s.textContent = text || ""; s.hidden = !text; },
      setStatus(st) { const s = $("[data-ws-status]", ws); s.textContent = (st && st.text) || ""; s.dataset.tone = (st && st.tone) || "neutral"; s.hidden = !(st && st.text); },
      setSave(state) { const s = $("[data-ws-save]", ws); s.textContent = SAVE[state || ""] || ""; s.dataset.state = state || ""; },
      setBadge(key, text, srText) {
        const b = $(`[data-ws-item="${CSS.escape(key)}"] [data-ws-badge]`, ws);
        if (!b) return;
        b.hidden = !text;
        b.innerHTML = text ? `<span aria-hidden="true">${e(text)}</span><span class="sr-only">, ${e(srText || text)}</span>` : "";
      },
      setActions(list) { actions = list || []; $("[data-ws-actions]", ws).innerHTML = actions.map(actionHTML).join(""); },
      setMenu(list) { menu = list || []; drawMenu(); }
    };
    api.setTitle(cfg.title);
    api.setStatus(cfg.status);
    api.setActions(actions);
    drawMenu();
    select(current, { silent: true });
    return api;
  }

  window.GS.workspace = { mount };
})();

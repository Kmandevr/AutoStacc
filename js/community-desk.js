// A space team's Team desk (owner, 2026-10-22; GS.communityDesk, used by js/community-kit.js, which loads after it):
// in the Studio (/studio?desk=<space>, a host with data-cm-desk) the desk is tabs (To do, Members, Space, Rules, Log)
// with a fixed place for each feature's part, so nothing moves while the parts load; on the space's own page the team
// sees only a slim link to it there. Features hand their parts over with a key (KEYS below). Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;

  const TABS = [
    ["todo", "To do", ["upkeep", "reports", "held", "appeals"]],
    ["members", "Members", ["bans"]],
    ["space", "Space", ["settings", "tags", "look", "welcome"]],
    ["rules", "Rules", ["slowmode", "newmembers", "words", "links", "patterns", "selfpromo"]],
    ["log", "Log", ["log"]]
  ];
  const HINT = {
    slowmode: "A wait between one person's posts, for busy moments. The team isn't slowed.",
    newmembers: "What new accounts may do in their first days.",
    words: "Words and phrases that hold a post for the team or refuse it.",
    links: "Sites whose links pass without waiting for the team.",
    patterns: "If a post matches a rule, hold it or refuse it.",
    selfpromo: "Whether people may link their own products and projects here."
  };
  const TODO = new Set(TABS[0][2]);

  // The desk's parts for one host element: { open, wait(key), part(title, wait, key) }.
  function make(host, el, sk) {
    const full = host.hasAttribute("data-cm-desk");
    const slots = {};
    const tabs = [];
    let built = false;
    let waiting = 0;
    let clear = null;
    let todoTab = null;

    const select = (i, focus = false) => tabs.forEach((t, j) => {
      t.btn.setAttribute("aria-selected", String(i === j));
      t.btn.tabIndex = i === j ? 0 : -1;
      t.panel.hidden = i !== j;
      if (i === j && focus) t.btn.focus();
    });

    function build() {
      if (built) return;
      built = true;
      host.hidden = false;
      if (!full) {
        // The space's page: one slim link to the full desk in the Studio.
        host.classList.add("cm-desk-slim");
        host.append(el("p", {}, el("strong", { text: "Team desk" }), " Reports, approvals, members and rules are in the Studio. ",
          el("a", { class: "btn small", href: `/studio?desk=${encodeURIComponent(host.dataset.cmSpace)}`, text: "Open the Team desk" })));
        return;
      }
      const list = el("div", { class: "cm-desk-tabs", role: "tablist", "aria-label": "Team desk" });
      host.append(el("h2", { class: "cm-desk-title", text: "Team desk" }), list);
      TABS.forEach(([id, label, keys], i) => {
        const btn = el("button", { type: "button", role: "tab", id: `desk-tab-${id}`, "aria-controls": `desk-${id}`, text: label });
        const panel = el("div", { class: "cm-desk-panel", role: "tabpanel", id: `desk-${id}`, "aria-labelledby": `desk-tab-${id}` });
        keys.forEach((k) => { slots[k] = panel.appendChild(el("div", { class: "cm-desk-slot" })); });
        if (id === "todo") {
          todoTab = btn;
          clear = panel.insertBefore(el("p", { class: "cm-small cm-desk-clear", text: "All clear: nothing is waiting for the team." }), panel.firstChild);
        }
        btn.addEventListener("click", () => select(i));
        btn.addEventListener("keydown", (ev) => {
          const step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
          if (step) { ev.preventDefault(); select((i + step + TABS.length) % TABS.length, true); }
        });
        list.append(btn);
        host.append(panel);
        tabs.push({ btn, panel });
      });
      select(0);
    }

    // A placeholder in a part's slot while its list loads (busy for screen readers).
    const wait = (key) => {
      build();
      const w = el("div", { class: "cm-desk-part" });
      if (!full) return w;
      (slots[key] || tabs[tabs.length - 1].panel).append(w);
      if (sk()) sk().show(w, "line", 1);
      return w;
    };

    // A titled part, in its placeholder's place or its slot. A count in the title "(n)" adds to To do's badge.
    const part = (title, w = null, key = "") => {
      build();
      const p = el("section", { class: "cm-desk-part" }, el("h3", { text: title }), HINT[key] ? el("p", { class: "cm-small", text: HINT[key] }) : null);
      if (!full) return p;
      if (w && w.parentNode) w.replaceWith(p); else (slots[key] || tabs[tabs.length - 1].panel).append(p);
      const n = Number((String(title).match(/\((\d+)\)\s*$/) || [])[1] || 0);
      if (TODO.has(key) && (n > 0 || key === "upkeep")) {
        waiting += n || 1;
        clear.hidden = true;
        todoTab.textContent = `To do (${waiting})`;
      }
      return p;
    };

    return { full, open: build, wait, part };
  }

  GS.communityDesk = { make };
})();

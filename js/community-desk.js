// A space team's desk (owner, 2026-10-22 and 2026-10-27; GS.communityDesk, used by js/community-kit.js, which loads
// after it): on the space's management page (/community/<space>/manage, a host with data-cm-desk) the desk is tabs (To
// do, Members, Space, Rules, Log) with a fixed place for each feature's part, so nothing moves while the parts load;
// moderators see only To do, Members and Log (settings and rules are the managers'). On the space's own page the team
// sees only a slim link to it, with how many things wait in To do. Features hand their parts over with a key (KEYS below). Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;

  const TABS = [
    ["todo", "To do", ["upkeep", "reports", "held", "appeals"]],
    ["members", "Members", ["team", "bans"]],
    ["space", "Space", ["settings", "tags", "look", "welcome", "archive"]],
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
  const MANAGERS_ONLY = new Set(["space", "rules"]);

  // The desk's parts for one host element: { open, wait(key), part(title, wait, key) }.
  // role(): a promise of the visitor's /mine answer ({ team, role }), so moderators get only their tabs.
  function make(host, el, sk, role = () => Promise.resolve(null)) {
    const full = host.hasAttribute("data-cm-desk");
    const slots = {};
    const tabs = [];
    let built = false;
    let waiting = 0;
    let clear = null;
    let todoTab = null;
    let slimCount = null; // the space page's link: "· N waiting" once the To do parts have counted

    let pick = null; // GS.tabs (js/util.js) wires the buttons; it shows tab i through show(i).
    const show = (i) => tabs.forEach((t, j) => { t.panel.hidden = i !== j; });

    function build() {
      if (built) return;
      built = true;
      host.hidden = false;
      if (!full) {
        // The space's page: one slim link to its management page.
        host.classList.add("cm-desk-slim");
        slimCount = el("span", { class: "cm-desk-count" });
        host.append(el("p", {}, el("strong", { text: "You help run this space" }), slimCount, " ",
          el("a", { class: "btn small", href: `${host.dataset.cmPath || ""}/manage`, text: "Manage" })));
        return;
      }
      const list = el("div", { class: "cm-desk-tabs", role: "tablist", "aria-label": "Manage this space" });
      host.append(list);
      TABS.forEach(([id, label, keys]) => {
        const btn = el("button", { type: "button", role: "tab", id: `desk-tab-${id}`, "aria-controls": `desk-${id}`, text: label });
        const panel = el("div", { class: "cm-desk-panel", role: "tabpanel", id: `desk-${id}`, "aria-labelledby": `desk-tab-${id}` });
        keys.forEach((k) => { slots[k] = panel.appendChild(el("div", { class: "cm-desk-slot" })); });
        if (id === "todo") {
          todoTab = btn;
          clear = panel.insertBefore(el("p", { class: "cm-small cm-desk-clear", text: "All clear: nothing is waiting for the team." }), panel.firstChild);
        }
        list.append(btn);
        host.append(panel);
        tabs.push({ btn, panel });
      });
      pick = GS.tabs(tabs.map((t) => t.btn), show);
      pick(0, false);
      role().then((d) => {
        if (!d || d.role !== "moderator") return;
        TABS.forEach(([id], i) => { if (MANAGERS_ONLY.has(id)) { tabs[i].btn.hidden = true; tabs[i].panel.hidden = true; } });
        slots.team.before(el("p", { class: "cm-small", text: "As a moderator you handle what's waiting, members and bans. The space's settings and rules are changed by its founder or owners." }));
      });
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
      const n = Number((String(title).match(/\((\d+)\)\s*$/) || [])[1] || 0);
      if (!full) {
        if (TODO.has(key) && n > 0 && slimCount) { waiting += n; slimCount.textContent = ` · ${waiting} waiting`; }
        return p;
      }
      if (w && w.parentNode) w.replaceWith(p); else (slots[key] || tabs[tabs.length - 1].panel).append(p);
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

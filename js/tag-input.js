// The tag box (owner, 2026-10-27, #230; GS.tagInput, a drop-in for any <input data-tag-input>): type a tag, pick from
// suggestions of tags used anywhere on AutoStacc (GET /api/tags/suggest, typos tolerated), Enter, comma or a pick adds
// it as a chip, Backspace on an empty box removes the last. The original input stays in the form (hidden) holding the
// tags as "a, b, c", so the forms that read it don't change. data-max caps the count (8 by default); data-extra holds
// more suggestions as JSON ([{ tag }], a space's own list). Tags are folded like the server does (#Lo Fi is lo-fi); the
// server checks them again. Mounts on inputs added later too (the Studio draws its forms on the fly). Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;
  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^#+/, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
  let n = 0;

  function mount(input) {
    if (input.dataset.tagMounted) return;
    input.dataset.tagMounted = "1";
    const max = Number(input.dataset.max) || 8;
    let extra = [];
    try { extra = JSON.parse(input.dataset.extra || "[]").map((x) => x.tag || x.key).filter(Boolean); } catch { /* none */ }
    const id = `tag-list-${++n}`;
    const tags = [...new Set(String(input.value || "").split(/[,\s]+/).map(fold).filter(Boolean))].slice(0, max);
    const box = document.createElement("div");
    box.className = "tag-box";
    const chips = document.createElement("ul");
    chips.className = "tag-chips";
    chips.setAttribute("aria-label", "Tags");
    const type = document.createElement("input");
    type.type = "text";
    type.className = "tag-type";
    type.setAttribute("role", "combobox");
    type.setAttribute("aria-autocomplete", "list");
    type.setAttribute("aria-expanded", "false");
    type.setAttribute("aria-controls", id);
    type.setAttribute("aria-label", input.getAttribute("aria-label") || (input.labels && input.labels[0] ? input.labels[0].textContent.trim() : "Tags"));
    type.autocapitalize = "off";
    type.spellcheck = false;
    type.maxLength = 40;
    type.placeholder = input.placeholder || "Add a tag";
    const list = document.createElement("ul");
    list.className = "tag-suggest";
    list.id = id;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    box.append(chips, type, list);
    input.type = "hidden";
    if (input.id) { type.id = input.id; input.removeAttribute("id"); }
    input.after(box);

    const sync = () => {
      input.value = tags.join(", ");
      chips.replaceChildren(...tags.map((t, i) => {
        const li = document.createElement("li");
        const x = document.createElement("button");
        x.type = "button";
        x.className = "tag-chip";
        x.textContent = `#${t}`;
        x.setAttribute("aria-label", `Remove tag ${t}`);
        x.addEventListener("click", () => { tags.splice(i, 1); sync(); type.focus(); });
        li.append(x);
        return li;
      }));
      type.hidden = tags.length >= max;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const add = (raw) => {
      const t = fold(raw);
      if (t && !tags.includes(t) && tags.length < max) tags.push(t);
      type.value = "";
      close();
      sync();
    };
    let active = -1;
    const close = () => { list.hidden = true; type.setAttribute("aria-expanded", "false"); type.removeAttribute("aria-activedescendant"); active = -1; };
    const mark = (i) => {
      const items = [...list.children];
      items.forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
      active = i;
      if (items[i]) type.setAttribute("aria-activedescendant", items[i].id);
    };
    let timer = null, asked = 0;
    const show = (found) => {
      const q = fold(type.value);
      const own = extra.filter((t) => q && t.includes(q));
      const all = [...new Set([...found, ...own])].filter((t) => !tags.includes(t)).slice(0, 8);
      list.replaceChildren(...all.map((t, k) => {
        const li = document.createElement("li");
        li.id = `${id}-${k}`;
        li.setAttribute("role", "option");
        li.textContent = `#${t}`;
        li.addEventListener("mousedown", (ev) => { ev.preventDefault(); add(t); });
        return li;
      }));
      list.hidden = !all.length;
      type.setAttribute("aria-expanded", String(!list.hidden));
      active = -1;
    };
    type.addEventListener("input", () => {
      if (/[,\n]/.test(type.value)) { type.value.split(/[,\n]/).forEach((part, i, a) => (i < a.length - 1 ? add(part) : (type.value = part))); return; }
      clearTimeout(timer);
      const q = fold(type.value);
      if (!q) return close();
      const mine = ++asked;
      timer = setTimeout(async () => {
        const r = await GS.api(`/api/tags/suggest?q=${encodeURIComponent(q)}`);
        if (mine === asked) show(r.ok ? r.data.tags.map((x) => x.tag) : []);
      }, 150);
    });
    type.addEventListener("keydown", (ev) => {
      const items = [...list.children];
      if (ev.key === "ArrowDown" && items.length) { ev.preventDefault(); mark((active + 1) % items.length); }
      else if (ev.key === "ArrowUp" && items.length) { ev.preventDefault(); mark((active - 1 + items.length) % items.length); }
      else if (ev.key === "Enter" || ev.key === "Tab" && type.value.trim()) {
        if (!type.value.trim() && active < 0) return;
        ev.preventDefault();
        add(active >= 0 && items[active] ? items[active].textContent : type.value);
      } else if (ev.key === "Escape") close();
      else if (ev.key === "Backspace" && !type.value && tags.length) { tags.pop(); sync(); }
    });
    type.addEventListener("blur", () => { if (type.value.trim()) add(type.value); else close(); });
    sync();
  }

  const scan = (root) => root.querySelectorAll && root.querySelectorAll("input[data-tag-input]").forEach(mount);
  scan(document);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((x) => { if (x.nodeType === 1) { if (x.matches && x.matches("input[data-tag-input]")) mount(x); scan(x); } })))
    .observe(document.documentElement, { childList: true, subtree: true });
  GS.tagInput = mount;
})();

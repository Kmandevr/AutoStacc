// A post's actions on the community pages (owner, 2026-10-27, #230; GS.communityMenu, used through js/community-kit.js):
// one small row under each post for what stays in view (Boost, Reply, Helpful, Best answer), and a "⋯" button at its
// end that opens the rest (Save, Follow, Share link, Report, Block, Edit, Delete, the team's tools). Features add to
// either through the kit (row(post), menu(post)), so none knows the others; the ⋯ appears once something is in it. One
// menu is open at a time; Escape, a click outside or picking an item closes it. Needs nothing but the page.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;
  let open = null;
  const close = () => {
    if (!open) return;
    open.list.hidden = true;
    open.button.setAttribute("aria-expanded", "false");
    open = null;
  };
  document.addEventListener("click", (ev) => { if (open && !ev.target.closest(".cm-postmenu")) close(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !open) return;
    const b = open.button;
    close();
    b.focus();
  });

  // The row under a post (made on first ask, shared by every feature).
  function row(post) {
    let bar = post.querySelector(":scope > [data-cm-tools]");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "cm-post-tools";
      bar.dataset.cmTools = post.id;
      post.append(bar);
    }
    return bar;
  }

  // The ⋯ list of a post (made on first ask). Items are the features' own buttons; the list styles them as rows.
  function menu(post) {
    const bar = row(post);
    const have = bar.querySelector(":scope > .cm-postmenu");
    if (have) return have.querySelector(".cm-menu");
    const id = `cm-menu-${post.id}`;
    const wrap = document.createElement("div");
    wrap.className = "cm-postmenu";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-more-button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    button.setAttribute("aria-label", "More actions");
    button.title = "More actions";
    button.textContent = "⋯";
    const list = document.createElement("div");
    list.className = "cm-menu";
    list.id = id;
    list.hidden = true;
    button.addEventListener("click", () => {
      const was = open && open.list === list;
      close();
      if (was) return;
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      open = { list, button };
      const first = list.querySelector("button, a");
      if (first) first.focus();
    });
    // Picking an item closes the menu, unless the item opens something inside it (aria-expanded).
    list.addEventListener("click", (ev) => { const b = ev.target.closest("button, a"); if (b && !b.hasAttribute("aria-expanded")) close(); });
    list.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      const items = [...list.querySelectorAll("button:not([disabled]), a")];
      const at = items.indexOf(document.activeElement);
      const next = items[(at + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      if (next) { ev.preventDefault(); next.focus(); }
    });
    wrap.append(button, list);
    bar.append(wrap);
    return list;
  }

  // Share link: the system share sheet where there is one, else the address copied, said with a toast.
  function share(post, title) {
    const url = new URL(location.href);
    url.hash = post.classList.contains("cm-opening") ? "" : post.id;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Share link";
    b.addEventListener("click", async () => {
      if (navigator.share) { try { await navigator.share({ title, url: url.href }); return; } catch { /* closed, or not allowed: copy instead */ } }
      try { await navigator.clipboard.writeText(url.href); GS.toast("Link copied."); } catch { GS.toast("Copy this address: " + url.href); }
    });
    return b;
  }

  GS.communityMenu = { row, menu, share, close };
})();

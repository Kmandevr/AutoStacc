// The bell (owner, 2026-10-22; what waits added 2026-10-27, #214): signed in, a top-bar button with the number of
// things waiting on you, opening a short list of where each one is: unread community notices (to the community, where
// the inbox opens), a creator's Studio items that need them (GET /api/studio/attention: refused files, failed or
// checked Pac versions; never drafts or reviews, which only need patience) and each space you help run with reports
// and held posts waiting (GET /api/community/my-spaces). Each part shows only when it applies; nothing at all when
// none does. Loaded by js/account-nav.js (data-creator says whether to ask the Studio). Text only through
// GS.escapeHTML. Needs js/util.js.
(function () {
  "use strict";
  const { api, escapeHTML: e } = window.GS;
  const me = document.currentScript;
  const creator = Boolean(me && me.dataset.creator);
  const slot = document.querySelector("[data-account-menu]");
  if (!slot || document.querySelector(".bell")) return;
  const community = (window.FEATURES || {})["community.forum"] !== false;
  const none = Promise.resolve({ ok: false });

  async function draw() {
    const [inbox, spaces, studio] = await Promise.all([
      community ? api("/api/community/inbox") : none,
      community ? api("/api/community/my-spaces") : none,
      creator ? api("/api/studio/attention") : none
    ]);
    const rows = [];
    let total = 0;
    const row = (href, label, n) => { total += n; rows.push(`<li><a href="${e(href)}"><span>${e(label)}</span><span class="bell-count">${n > 99 ? "99+" : n}</span></a></li>`); };
    if (inbox.ok && inbox.data.unread) row("/community", "Community notices", inbox.data.unread);
    if (studio.ok) studio.data.creators.forEach((c) => c.needsYou && row("/studio", `${c.name} in the Studio`, c.needsYou));
    if (spaces.ok) spaces.data.spaces.forEach((s) => s.waiting && row(s.manage, `Manage ${s.name}`, s.waiting));
    // Someone outside the community with nothing waiting gets no bell (as before); members always see it.
    if (!rows.length && !inbox.ok) return;
    const say = total ? `${total} waiting` : "nothing new";
    slot.insertAdjacentHTML("beforebegin", `<div class="bell">
      <button class="tool-link bell-link" type="button" aria-expanded="false" aria-controls="bell-panel" aria-label="Notifications: ${e(say)}">
        <svg class="bell-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>${total ? `<span class="bell-count">${total > 99 ? "99+" : total}</span>` : ""}
      </button>
      <div class="account-panel bell-panel" id="bell-panel" hidden>
        ${rows.length ? `<ul>${rows.join("")}</ul>` : '<p class="small-print">Nothing waiting on you.</p>'}
        ${inbox.ok ? '<p class="account-extra"><a href="/community">Open the community</a></p>' : ""}
      </div>
    </div>`);
  }

  // A disclosure like the account menu: Escape, a click outside or Tab away closes it.
  const parts = () => { const b = document.querySelector(".bell"); return b ? [b, b.querySelector(".bell-link"), b.querySelector(".bell-panel")] : []; };
  const setOpen = (open, refocus = false) => {
    const [, btn, panel] = parts();
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (refocus) btn.focus();
  };
  document.addEventListener("click", (ev) => {
    const [bell, btn] = parts();
    if (!bell) return;
    if (ev.target.closest(".bell-link")) setOpen(btn.getAttribute("aria-expanded") !== "true");
    else if (!bell.contains(ev.target)) setOpen(false);
  });
  document.addEventListener("keydown", (ev) => {
    const [, btn] = parts();
    if (ev.key === "Escape" && btn && btn.getAttribute("aria-expanded") === "true") setOpen(false, true);
  });
  document.addEventListener("focusin", (ev) => { const [bell] = parts(); if (bell && !bell.contains(ev.target)) setOpen(false); });

  draw();
})();

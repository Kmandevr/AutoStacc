// Control Center, Spotlight tab (owner, 2026-10-22): what each browse page's banner shows first: Discover (projects,
// creators, communities), the Store (products) and New & upcoming (releases, events). Add by kind and id, remove; the
// pages fill the other slots with a fair rotation. Talks to /api/admin/spotlight. Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";
  const { $, escapeHTML: e, api } = window.GS;
  const NAMES = { discover: "Discover", store: "Store", explore: "New & upcoming" };

  async function draw(el) {
    const r = await api("/api/admin/spotlight");
    if (!r.ok) { el.innerHTML = `<p class="msg error">${e(r.error.message)}</p>`; return; }
    const { pages, picks, max } = r.data;
    el.innerHTML = `<p class="small-print">Your picks show first, in this order, up to ${max} a page. The rest of each banner rotates fairly through
      everything the page lists, a new order each day, so new and small creators get the same turns as everyone else.</p>
      ${Object.keys(pages).map((page) => `<section class="panel wide">
        <h3>${e(NAMES[page] || page)}</h3>
        ${picks[page].length ? `<ol>${picks[page].map((p) => `<li>${e(p.kind)} <code>${e(p.refId)}</code>
          <button class="btn ghost small" type="button" data-spot-remove="${e(p.id)}">Remove</button></li>`).join("")}</ol>` : `<p class="small-print">No picks: the whole banner rotates.</p>`}
        <form class="actions" data-spot-add="${e(page)}">
          <label class="sr-only" for="spot-kind-${e(page)}">Kind</label>
          <select id="spot-kind-${e(page)}" name="kind">${pages[page].map((k) => `<option value="${e(k)}">${e(k)}</option>`).join("")}</select>
          <label class="sr-only" for="spot-id-${e(page)}">Id</label>
          <input id="spot-id-${e(page)}" name="refId" placeholder="Its id, e.g. glitches-and-stitches" maxlength="120" required>
          <button class="btn small" type="submit">Add</button>
        </form></section>`).join("")}
      <p class="msg" role="status" hidden></p>`;
  }

  addEventListener("gs:admin", () => {
    const el = $("#admin-spotlight");
    if (!el) return;
    draw(el);
    const say = (text) => { const m = $(".msg[role=status]", el); if (m) { m.hidden = false; m.className = "msg error"; m.textContent = text; } };
    el.addEventListener("submit", async (ev) => {
      const form = ev.target.closest("[data-spot-add]");
      if (!form) return;
      ev.preventDefault();
      const b = form.querySelector("button");
      b.disabled = true;
      const res = await api("/api/admin/spotlight", { method: "POST", body: { page: form.dataset.spotAdd, kind: form.elements.kind.value, refId: form.elements.refId.value } });
      b.disabled = false;
      if (res.ok) draw(el); else say(res.error.message);
    });
    el.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-spot-remove]");
      if (!b) return;
      b.disabled = true;
      const res = await api(`/api/admin/spotlight/${encodeURIComponent(b.dataset.spotRemove)}`, { method: "DELETE" });
      if (res.ok) draw(el); else { b.disabled = false; say(res.error.message); }
    });
  });
})();

// The signed-in home's "Needs your attention" and quick actions (owner, 2026-10-27, #223): only what applies to this
// person. A creator sees how many things wait in each creator's Studio (GET /api/studio, then each one's "Needs you",
// server/studio/attention.js); someone who helps run community spaces sees each one with a Manage link (GET
// /api/community/my-spaces). The section stays hidden when nothing waits. Quick actions add Studio (creators) or
// "Become a creator", and "Start a community" when the community is open. Text only through textContent and
// GS.escapeHTML. Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  const box = document.querySelector("[data-home-attention]");
  const list = document.querySelector("[data-home-attention-list]");
  const actions = document.querySelector("[data-home-actions]");
  if (!GS || !box || !list) return;
  const { escapeHTML: e, api } = GS;

  const add = (href, label, note) => {
    list.insertAdjacentHTML("beforeend", `<li><a href="${e(href)}">${e(label)}</a><span class="small-print">${e(note)}</span></li>`);
    box.hidden = false;
  };
  const action = (href, label) => actions && actions.insertAdjacentHTML("beforeend", `<li><a class="btn ghost small" href="${e(href)}">${e(label)}</a></li>`);

  async function studio() {
    const r = await api("/api/studio");
    const creators = r.ok ? r.data.creators || [] : [];
    action("/studio", creators.length ? "Studio" : "Become a creator");
    for (const c of creators) {
      if (!(c.capabilities || []).includes("products")) continue;
      const a = await api(`/api/studio/creators/${encodeURIComponent(c.id)}/attention`);
      const n = a.ok ? a.data.items.length : 0;
      if (n) add("/studio", `${c.name}: ${n} waiting in the Studio`, "Drafts, Coming soon, files and Pac versions waiting on someone.");
    }
  }

  async function spaces() {
    if ((window.FEATURES || {})["community.forum"] === false) return;
    const r = await api("/api/community/my-spaces");
    if (r.status === 404) return; // the community or its spaces feature is off
    action("/community", "Start a community");
    if (!r.ok) return;
    r.data.spaces.forEach((s) => add(s.manage, `Manage ${s.name}`, s.role === "founder" ? "You founded it: reports, members, settings and rules." : "You moderate it: reports, approvals and bans."));
  }

  studio();
  spaces();
})();

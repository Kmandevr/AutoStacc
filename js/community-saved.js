// Save for later (the saved feature, server/community/features/saved/; needs js/community-kit.js): a Save button in
// a take's tools, and your private Saved list as a panel in the community toolbar. Does nothing when the
// feature is off or the visitor is signed out.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press } = kit;
  const api = window.GS.api;

  async function button() {
    const state = await kit.mine();
    if (!state || !state.features || !state.features.saved) return;
    let saved = state.features.saved.saved;
    const path = `/api/community/threads/${encodeURIComponent(kit.tools.dataset.cmThread)}/save`;
    const b = el("button", { class: "btn ghost small", type: "button" });
    const draw = () => { b.textContent = saved ? "Saved" : "Save"; b.setAttribute("aria-pressed", String(saved)); };
    draw();
    b.addEventListener("click", async () => {
      press(b, true);
      const r = await api(path, { method: saved ? "DELETE" : "PUT" });
      press(b, false);
      if (r.ok) { saved = r.data.saved; draw(); } else window.GS.toast(r.error.message, true);
    });
    const post = kit.opening();
    if (post) kit.menu(post).append(b);
  }

  async function list() {
    const r = await api("/api/community/saved");
    const slot = r.ok && kit.panel("saved", `Saved (${r.data.saved.length})`);
    if (!slot) return;
    const d = el("div", { class: "cm-saved" });
    if (!r.data.saved.length) d.append(el("p", { class: "cm-small", text: "Nothing saved yet. Press Save on any take to keep it here." }));
    r.data.saved.forEach((x) => d.append(el("p", { class: "cm-small" }, el("a", { href: x.path, text: x.title }), ` · ${x.space}`)));
    slot.box.append(d);
  }

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("saved") || !who.signedIn || !who.member) return;
    if (kit.tools) button();
    if (kit.bar) list();
  })();
})();

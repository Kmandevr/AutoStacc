// Mention alerts (the mentions feature, server/community/features/mentions/; needs js/community-kit.js): a small
// switch at the foot of the toolbar's Notifications panel (shared through the kit, so neither feature knows the other) for being told when someone @mentions you. Does nothing when the
// feature is off or the visitor is signed out.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.bar) return;
  const { el } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("mentions") || !who.signedIn || !who.member) return;
    const r = await api("/api/community/mentions/prefs");
    if (!r.ok) return;
    const box = el("input", { type: "checkbox", checked: r.data.alerts });
    box.checked = r.data.alerts;
    box.addEventListener("change", async () => {
      box.disabled = true;
      const res = await api("/api/community/mentions/prefs", { method: "PUT", body: { alerts: box.checked } });
      box.disabled = false;
      if (!res.ok) { box.checked = !box.checked; window.GS.toast(res.error.message, true); }
    });
    const slot = kit.panel("inbox", "Notifications");
    if (slot) slot.box.append(el("label", { class: "cm-check cm-small cm-bar-setting" }, box, " Tell me when someone @mentions me"));
  })();
})();

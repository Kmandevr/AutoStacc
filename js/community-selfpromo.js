// The self-promotion switch on a team desk (the selfpromo feature, server/community/features/selfpromo/; needs
// js/community-kit.js): the team can switch linking your own products and projects off for the whole space. Does
// nothing when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, press } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("selfpromo") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/self-promotion`;
    const r = await api(path);
    if (!r.ok) return;
    const off = r.data.off.includes("");
    const part = kit.deskPart("Self-promotion", null, "selfpromo");
    part.append(el("p", { class: "cm-small", text: "Linking your own products or projects is never allowed in questions and their answers. You can also switch it off everywhere in this space." }));
    const b = el("button", { class: "btn ghost small", type: "button", text: off ? "Allow it again in ordinary takes" : "Switch it off in this whole space" });
    b.addEventListener("click", async () => {
      press(b, true);
      const res = await api(path, { method: off ? "DELETE" : "PUT", body: {} });
      press(b, false);
      if (res.ok) location.reload(); else window.alert(res.error.message);
    });
    part.append(b);
  })();
})();

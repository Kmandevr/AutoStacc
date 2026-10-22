// Slow mode on a space's Team desk (the pace feature, server/community/features/pace/; needs js/community-kit.js):
// the team picks the wait between one person's posts in the space (off, 30 seconds, 2 minutes, 10 minutes); the team
// itself isn't slowed. Does nothing when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy } = kit;
  const api = window.GS.api;
  const LABEL = { 0: "Off", 30: "30 seconds", 120: "2 minutes", 600: "10 minutes" };

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("pace") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/slow-mode`;
    const r = await api(path);
    if (!r.ok) return;
    const part = kit.deskPart("Slow mode", null, "slowmode");
    const pick = el("select", { "aria-label": "Wait between posts" }, r.data.choices.map((c) => el("option", { value: String(c), text: LABEL[c] || `${c} seconds` })));
    pick.value = String(r.data.seconds);
    const msg = status();
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(path, { method: "PUT", body: { seconds: Number(pick.value) } });
      busy(ev.currentTarget, false);
      say(msg, res.ok ? "Saved." : res.error.message, res.ok);
    } } }, el("label", {}, "Wait between one person's posts", pick), el("button", { class: "btn small", type: "submit", text: "Save" }), msg));
  })();
})();

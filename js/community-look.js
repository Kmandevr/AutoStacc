// A space's look (the look feature, server/community/features/look/; needs js/community-kit.js): applies the space's
// accent colour and banner preset to its page, and gives the team a picker on its desk. Colours and banner names come
// from the server's preset lists only. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("look")) return;
    const base = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/look`;
    const r = await api(base);
    if (!r.ok) return;
    const main = document.querySelector("main");
    if (r.data.color && /^#[0-9a-f]{6}$/i.test(r.data.color)) main.style.setProperty("--accent", r.data.color);
    if (/^[a-z]+$/.test(r.data.banner) && r.data.banner !== "none") (document.querySelector(".page-hero") || main).classList.add(`cm-banner-${r.data.banner}`);
    if (!who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const part = kit.deskPart("Look");
    const accent = el("select", { "aria-label": "Accent colour" }, r.data.accents.map((a) => el("option", { value: a, text: a })));
    const banner = el("select", { "aria-label": "Banner" }, r.data.banners.map((b) => el("option", { value: b, text: b })));
    accent.value = r.data.accent || r.data.accents[0];
    banner.value = r.data.banner;
    const msg = status();
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(base, { method: "PUT", body: { accent: accent.value, banner: banner.value } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    } } }, el("label", {}, "Accent colour", accent), el("label", {}, "Banner", banner), el("button", { class: "btn small", type: "submit", text: "Save" }), msg));
  })();
})();

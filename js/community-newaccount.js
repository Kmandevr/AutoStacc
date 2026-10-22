// A space's new-account rules on its team desk (the newaccount feature; needs js/community-kit.js): how young an
// account, or how few posts in the space, makes someone new, and whether their posts are held or their links refused.
// Does nothing when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("newaccount") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/new-account-rule`;
    const r = await api(path);
    if (!r.ok) return;
    const part = kit.deskPart("New members", null, "newmembers");
    const days = el("input", { type: "number", min: 0, max: 90, value: r.data.rule.accountDays, "aria-label": "Account younger than (days)" });
    const posts = el("input", { type: "number", min: 0, max: 20, value: r.data.rule.spacePosts, "aria-label": "Fewer than this many posts here" });
    const mode = el("select", { "aria-label": "What happens" }, el("option", { value: "hold", text: "Hold their posts for the team" }), el("option", { value: "nolinks", text: "Refuse posts with links" }));
    mode.value = r.data.rule.mode;
    const msg = status();
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(path, { method: "PUT", body: { accountDays: Number(days.value), spacePosts: Number(posts.value), mode: mode.value } });
      busy(ev.currentTarget, false);
      say(msg, res.ok ? "Saved." : res.error.message, res.ok);
    } } },
    el("p", { class: "cm-small", text: "Treat someone as new while (0 turns a part off):" }),
    el("label", {}, "their account is younger than (days)", days), el("label", {}, "or they have fewer than this many posts in this space", posts), mode,
    el("button", { class: "btn small", type: "submit", text: "Save" }), msg));
  })();
})();

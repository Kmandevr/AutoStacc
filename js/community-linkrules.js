// A space's allowed sites on its team desk (the linkrules feature; needs js/community-kit.js): the sites whose links pass
// without the team's approval, with Add and Remove. AutoStacc's own safe list is shown for reference. Does nothing
// when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy, press } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("linkrules") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${enc(kit.desk.dataset.cmSpace)}/allowed-links`;
    const r = await api(path);
    if (!r.ok) return;
    const part = kit.deskPart(`Allowed sites (${r.data.allowed.length})`);
    part.append(el("p", { class: "cm-small", text: "Links to these sites pass at once. Other sites (not on AutoStacc's safe list) wait for the team." }));
    r.data.allowed.forEach((host) => part.append(el("p", { class: "cm-desk-row" }, `${host} `, el("button", { class: "btn ghost small", type: "button", text: "Remove", on: { click: async (ev) => {
      const b = ev.currentTarget;
      press(b, true);
      const res = await api(path, { method: "DELETE", body: { host } });
      press(b, false);
      if (res.ok) location.reload(); else window.alert(res.error.message);
    } } }))));
    const msg = status();
    const host = el("input", { name: "host", required: true, maxlength: 100, placeholder: "example.com", "aria-label": "Site to allow" });
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(path, { method: "PUT", body: { host: host.value } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    } } }, host, el("button", { class: "btn small", type: "submit", text: "Allow this site" }), msg));
  })();
})();

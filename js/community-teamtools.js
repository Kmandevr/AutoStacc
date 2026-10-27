// A team's space settings on its team desk (the teamtools feature, server/community/features/teamtools/; needs
// js/community-kit.js): the description and rules text, and the channels (add, rename, who may start, kinds, archive).
// Does nothing when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy, press } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("teamtools") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const base = `/api/community/spaces/${enc(kit.desk.dataset.cmSpace)}`;
    const r = await api(`${base}/settings`);
    if (!r.ok) return;
    const part = kit.deskPart("Space settings", null, "settings");
    const msg = status();
    const description = el("textarea", { rows: 2, maxlength: 500, "aria-label": "Description" });
    description.value = r.data.description;
    const rules = el("textarea", { rows: 6, maxlength: 4000, "aria-label": "This space's rules" });
    rules.value = r.data.rules;
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(`${base}/text`, { method: "PUT", body: { description: description.value, rules: rules.value } });
      busy(ev.currentTarget, false);
      say(msg, res.ok ? "Saved." : res.error.message, res.ok);
    } } }, el("label", {}, "Description", description), el("label", {}, "Rules (stricter than AutoStacc's, never looser)", rules),
    el("button", { class: "btn small", type: "submit", text: "Save" }), msg));
    part.append(el("h3", { text: "Channels" }));
    const change = (b, body) => async () => {
      press(b, true);
      const res = await api(`${base}/channels`, { method: "PATCH", body });
      press(b, false);
      if (res.ok) location.reload(); else window.GS.toast(res.error.message, true);
    };
    r.data.channels.forEach((c) => {
      const b = el("button", { class: "btn ghost small", type: "button", text: c.archived ? "Bring back" : "Archive" });
      b.addEventListener("click", change(b, { id: c.id, archived: !c.archived }));
      const w = el("button", { class: "btn ghost small", type: "button", text: c.whoMayStart === "team" ? "Team starts takes" : "Everyone starts takes" });
      w.addEventListener("click", change(w, { id: c.id, whoMayStart: c.whoMayStart === "team" ? "everyone" : "team" }));
      part.append(el("p", { class: "cm-desk-row" }, `${c.name}${c.archived ? " (archived)" : ""}: ${c.postTypes.join(", ")} `, w, b));
    });
    const name = el("input", { required: true, maxlength: 40, "aria-label": "New channel name" });
    const kinds = el("select", { "aria-label": "Kinds" }, el("option", { value: "discussion,question", text: "Discussions and questions" }), el("option", { value: "discussion", text: "Discussions" }), el("option", { value: "question", text: "Questions" }));
    const cmsg = status();
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(`${base}/channels`, { method: "POST", body: { name: name.value, whoMayStart: "everyone", postTypes: kinds.value.split(",") } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(cmsg, res.error.message);
    } } }, name, kinds, el("button", { class: "btn small", type: "submit", text: "Add channel" }), cmsg));
  })();
})();

// A space's pattern rules on its team desk (the patterns feature; needs js/community-kit.js): "if a post matches, hold
// it or refuse it", built from a form with no code. Lists the rules with switch and Remove, and a form for a new one.
// Does nothing when the feature is off or for anyone not on the team.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy, press } = kit;
  const api = window.GS.api;
  const TESTS = { contains: "contains the text", starts: "starts with the text", link: "has a link", caps: "is mostly capitals", short: "is shorter than (characters)" };

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("patterns") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/pattern-rules`;
    const r = await api(path);
    if (!r.ok) return;
    const part = kit.deskPart(`Pattern rules (${r.data.rules.length})`, null, "patterns");
    const act = (label, method, body) => el("button", { class: "btn ghost small", type: "button", text: label, on: { click: async (ev) => {
      const b = ev.currentTarget;
      press(b, true);
      const res = await api(path, { method, body });
      press(b, false);
      if (res.ok) location.reload(); else window.alert(res.error.message);
    } } });
    r.data.rules.forEach((x) => part.append(el("p", { class: "cm-desk-row" },
      `${x.name}: ${x.field === "any" ? "title or text" : x.field} ${TESTS[x.test]}${x.value ? ` "${x.value}"` : ""} → ${x.action === "hold" ? "hold" : "refuse"}${x.enabled ? "" : " (off)"} `,
      act(x.enabled ? "Turn off" : "Turn on", "PATCH", { id: x.id, enabled: !x.enabled }), act("Remove", "DELETE", { id: x.id }))));
    const msg = status();
    const name = el("input", { required: true, maxlength: 60, "aria-label": "Rule name", placeholder: "Rule name" });
    const field = el("select", { "aria-label": "Look at" }, el("option", { value: "any", text: "title or text" }), el("option", { value: "title", text: "title" }), el("option", { value: "body", text: "text" }));
    const test = el("select", { "aria-label": "If it" }, Object.entries(TESTS).map(([v, t]) => el("option", { value: v, text: t })));
    const value = el("input", { maxlength: 100, "aria-label": "Text or number" });
    const action = el("select", { "aria-label": "Then" }, el("option", { value: "hold", text: "hold for the team" }), el("option", { value: "refuse", text: "refuse" }));
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(path, { method: "POST", body: { name: name.value, field: field.value, test: test.value, value: value.value, action: action.value } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    } } }, el("p", { class: "cm-small", text: "New rule: look at the" }), field, el("span", { text: " if it " }), test, value, el("span", { text: " then " }), action, name,
    el("button", { class: "btn small", type: "submit", text: "Add rule" }), msg));
  })();
})();

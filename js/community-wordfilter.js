// A space's filtered words on its team desk (the wordfilter feature; needs js/community-kit.js): add a word or phrase
// that holds a post for the team or refuses it, and remove one; and keep the space clean (strong swear words refused in
// posts). AutoStacc's own word levels are always on and aren't shown here.
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
    if (!who.features.includes("wordfilter") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team) return;
    const path = `/api/community/spaces/${enc(kit.desk.dataset.cmSpace)}/filter-words`;
    const r = await api(path);
    if (!r.ok) return;
    const part = kit.deskPart(`Filtered words (${r.data.words.length})`, null, "words");
    // A clean space (owner, 2026-10-27, #230): strong swear words refused in posts too. Only ever stricter than AutoStacc.
    const clean = el("input", { type: "checkbox", checked: r.data.clean });
    clean.addEventListener("change", async () => {
      clean.disabled = true;
      const res = await api(`/api/community/spaces/${enc(kit.desk.dataset.cmSpace)}/clean-words`, { method: "PUT", body: { clean: clean.checked } });
      clean.disabled = false;
      if (!res.ok) { clean.checked = !clean.checked; window.GS.toast(res.error.message, true); } else window.GS.toast(clean.checked ? "Strong swear words are now refused here." : "Strong swear words are allowed again, softened for readers.");
    });
    part.append(el("label", { class: "cm-check cm-desk-row" }, clean, " Keep this space clean: refuse strong swear words in posts"));
    r.data.words.forEach((w) => part.append(el("p", { class: "cm-desk-row" }, `${w.phrase}: ${w.action === "hold" ? "held for the team" : "refused"} `, el("button", { class: "btn ghost small", type: "button", text: "Remove", on: { click: async (ev) => {
      const b = ev.currentTarget;
      press(b, true);
      const res = await api(path, { method: "DELETE", body: { id: w.id } });
      press(b, false);
      if (res.ok) location.reload(); else window.GS.toast(res.error.message, true);
    } } }))));
    const msg = status();
    const phrase = el("input", { name: "phrase", required: true, maxlength: 60, "aria-label": "Word or phrase" });
    const action = el("select", { name: "action", "aria-label": "What happens" }, el("option", { value: "hold", text: "Hold for the team" }), el("option", { value: "refuse", text: "Refuse" }));
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(path, { method: "PUT", body: { phrase: phrase.value, action: action.value } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    } } }, phrase, action, el("button", { class: "btn small", type: "submit", text: "Add" }), msg));
  })();
})();

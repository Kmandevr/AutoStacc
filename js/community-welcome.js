// A space's welcome message (the welcome feature, server/community/features/welcome/; needs js/community-kit.js): a
// signed-in member sees the team's message once on a space's page, with a button to dismiss it; the team edits it on
// its desk. Text only through textContent. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, status, say, busy, press } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("welcome") || !who.signedIn || !who.member) return;
    const base = `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/welcome`;
    const r = await api(base);
    if (r.ok && r.data.message && kit.notices) {
      kit.notices.hidden = false;
      const b = el("button", { class: "btn ghost small", type: "button", text: "Got it" });
      const box = el("div", { class: "cm-welcome", role: "note" }, el("p", { text: r.data.message }), b);
      b.addEventListener("click", async () => { press(b, true); await api(`${base}/seen`, { method: "POST", body: {} }); box.remove(); });
      kit.notices.prepend(box);
    }
    const s = await kit.space();
    if (!s || !s.team) return;
    const cur = await api(`${base}/message`);
    if (!cur.ok) return;
    const part = kit.deskPart("Welcome message", null, "welcome");
    const text = el("textarea", { rows: 3, maxlength: 500, "aria-label": "Welcome message" });
    text.value = cur.data.message;
    const msg = status();
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(`${base}/message`, { method: "PUT", body: { message: text.value } });
      busy(ev.currentTarget, false);
      say(msg, res.ok ? "Saved. Everyone sees the new message once." : res.error.message, res.ok);
    } } }, text, el("button", { class: "btn small", type: "submit", text: "Save" }), msg));
  })();
})();

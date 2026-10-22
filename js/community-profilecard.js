// The mini profile card (the profilecard feature, server/community/features/profilecard/; needs js/community-kit.js):
// tapping a community name shows a small card: the name, when they joined, best answers and the spaces they help run,
// with a Block button when the blocks feature is on. Text only through textContent. Does nothing when the feature is
// off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("profilecard")) return;
    let card = null;
    const close = () => { if (card) card.remove(); card = null; };
    document.addEventListener("click", async (ev) => {
      const name = ev.target instanceof Element && ev.target.closest(".cm-name");
      if (!name) { if (card && !card.contains(ev.target)) close(); return; }
      close();
      const r = await api(`/api/community/members/card?name=${encodeURIComponent(name.textContent)}`);
      if (!r.ok) return;
      const c = r.data;
      card = el("div", { class: "cm-profile-card", role: "dialog", "aria-label": `${c.name}` },
        el("strong", { text: c.name }),
        el("p", { class: "cm-small", text: `Joined ${c.since} · ${c.bestAnswers} best ${c.bestAnswers === 1 ? "answer" : "answers"}` }),
        c.teams.map((t) => el("p", { class: "cm-small", text: `${t.role === "founder" ? "Founder" : "Moderator"} of ${t.space}` })),
        el("button", { class: "btn ghost small", type: "button", text: "Close", on: { click: close } }));
      if (who.features.includes("blocks") && who.signedIn && who.member && who.member.displayName !== c.name) {
        const b = el("button", { class: "btn ghost small", type: "button", text: "Block" });
        b.addEventListener("click", async () => {
          press(b, true);
          const res = await api("/api/community/blocks", { method: "PUT", body: { name: c.name } });
          press(b, false);
          if (res.ok) location.reload(); else window.alert(res.error.message);
        });
        card.append(b);
      }
      name.after(card);
    });
  })();
})();
